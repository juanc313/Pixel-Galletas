# Prepara las imágenes del sitio a partir de las fotos reales del emprendimiento.
# Uso:  py scripts/prepararFotos.py
#   5 fotos con fondo transparente (carpeta PIXEL GALLETAS) + 1 recorte de public/img/clientes.jpg
#   -> public/img/sabores/*.png   y una composición de marca -> public/img/contacto.png
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = r"C:/Users/HP/OneDrive/Documents/PIXEL GALLETAS"
SALIDA = os.path.join(RAIZ, "public", "img", "sabores")
os.makedirs(SALIDA, exist_ok=True)

# (sabor, archivo origen) — mapeo confirmado con los materiales de marca del usuario
ORIGENES = [
    ("monster",       "IMG_20251015_181049-removebg-preview.png"),   # galleta turquesa
    ("red-velvet",    "IMG_20251015_180913-removebg-preview.png"),   # galleta roja
    ("chocolate",     "IMG_20251015_153410-removebg-preview.png"),   # marrón con centro blanco
    ("klim",          "IMG_20251015_153845-removebg-preview.png"),   # amarilla con M&M's
    ("special-edition", "IMG_20251104_194507-removebg-preview.png"), # multicolor
]

LADO = 480  # tamaño de salida (la tarjeta las muestra ~115px)


def centrar_y_escalar(im, lado=LADO):
    im = im.convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((lado, lado), Image.LANCZOS)
    lienzo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    lienzo.alpha_composite(im, ((lado - im.width) // 2, (lado - im.height) // 2))
    return lienzo


def recortar_arequipe():
    """Recorta la galleta oscura con relleno blanco de la foto de clientes.
    La galleta es muy oscura (L<88); el mantel y la mesa son claros. El relleno
    brillante del centro se conserva porque está rodeado por la galleta."""
    im = Image.open((os.path.join(RAIZ, "public", "img", "clientes.jpg")).replace("\\", "/"))
    # galleta oscura (izquierda) en la foto de 900x675, recorte ajustado
    # (se empieza en y=219 para dejar fuera un trozo del mantel rojo de arriba)
    galleta = im.crop((48, 219, 278, 428)).convert("RGB")
    galleta = galleta.resize((galleta.width * 3, galleta.height * 3), Image.LANCZOS)

    gris = galleta.convert("L")
    # 255 = píxel oscuro (galleta)
    mascara = gris.point(lambda p: 255 if p < 88 else 0)

    # Los claros tocados desde el borde son fondo; los que no (el relleno del
    # centro) se reincorporan a la galleta.
    claros = gris.point(lambda p: 255 if p >= 88 else 0)
    for esquina in [(0, 0), (claros.width - 1, 0), (0, claros.height - 1), (claros.width - 1, claros.height - 1)]:
        if claros.getpixel(esquina) == 255:
            ImageDraw.floodfill(claros, esquina, 128, thresh=0)
    interiores = claros.point(lambda p: 255 if p == 255 else 0)
    mascara = Image.composite(Image.new("L", mascara.size, 255), mascara, interiores)

    # Se come un poco el borde para eliminar los restos del mantel y se suaviza
    mascara = mascara.filter(ImageFilter.MinFilter(9))

    # La galleta es redonda: una elíptica interior limpia los restos del mantel
    # que hayan sobrevivido en las esquinas del recorte.
    elipse = Image.new("L", mascara.size, 0)
    ImageDraw.Draw(elipse).ellipse(
        (int(mascara.width * .04), int(mascara.height * .04),
         int(mascara.width * .96), int(mascara.height * .96)), fill=255)
    elipse = elipse.filter(ImageFilter.MinFilter(9))
    mascara = ImageChops.multiply(mascara, elipse)

    mascara = mascara.filter(ImageFilter.GaussianBlur(3))
    salida = galleta.convert("RGBA")
    salida.putalpha(mascara)
    return salida


def contacto():
    """Composición de marca: las 5 galletas reales + logo sobre fondo índigo pixelado."""
    ancho, alto = 1080, 1080
    noche = Image.new("RGBA", (ancho, alto), (21, 9, 79, 255))

    # textura de cuadrícula pixelada (la misma del CSS)
    tex = ImageDraw.Draw(noche)
    for x in range(0, ancho, 36):
        tex.line([(x, 0), (x, alto)], fill=(255, 243, 220, 9), width=2)
    for y in range(0, alto, 36):
        tex.line([(0, y), (ancho, y)], fill=(255, 243, 220, 9), width=2)

    # halo naranja central
    halo = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse((140, 140, ancho - 140, alto - 140), fill=(245, 144, 47, 60))
    halo = halo.filter(ImageFilter.GaussianBlur(120))
    noche.alpha_composite(halo)

    galletas = []
    for sabor, archivo in ORIGENES:
        g = centrar_y_escalar(Image.open(os.path.join(FOTOS, archivo)), 340)
        galletas.append((sabor, g))
    galletas.append(("arequipe", centrar_y_escalar(recortar_arequipe(), 340)))

    # 5 galletas alrededor del logo (sin taparlo)
    posiciones = [
        (30, 60), (710, 60),          # fila superior: chocolate, klim
        (40, 700), (370, 745), (710, 700),  # fila inferior: monster, red-velvet, special
    ]
    orden = [2, 3, 0, 1, 4]
    for (x, y), i in zip(posiciones, orden):
        g = galletas[i][1]
        # sombra suave
        sombra = Image.new("RGBA", g.size, (0, 0, 0, 0))
        sombra.paste((0, 0, 0, 130), (0, 0, g.width, g.height), g.getchannel("A"))
        sombra = sombra.filter(ImageFilter.GaussianBlur(14))
        noche.alpha_composite(sombra, (x + 10, y + 30))
        noche.alpha_composite(g, (x, y))

    # logo al centro
    logo = Image.open(os.path.join(RAIZ, "public", "img", "logo.png")).convert("RGBA")
    logo.thumbnail((430, 430), Image.LANCZOS)
    noche.alpha_composite(logo, ((ancho - logo.width) // 2, (alto - logo.height) // 2 - 10))

    return noche.convert("RGB")


if __name__ == "__main__":
    for sabor, archivo in ORIGENES:
        im = centrar_y_escalar(Image.open(os.path.join(FOTOS, archivo)))
        ruta = os.path.join(SALIDA, sabor + ".webp")
        im.save(ruta, "WEBP", quality=82, method=6)
        print("sabor:", os.path.basename(ruta), im.size, os.path.getsize(ruta), "bytes")

    arequipe = centrar_y_escalar(recortar_arequipe())
    ruta = os.path.join(SALIDA, "arequipe.webp")
    arequipe.save(ruta, "WEBP", quality=82, method=6)
    print("sabor: arequipe.webp (recorte de clientes.jpg)", arequipe.size, os.path.getsize(ruta), "bytes")

    c = contacto().convert("RGB")
    # WebP para la página (aligera la carga) y JPEG como respaldo para el Open Graph.
    ruta_webp = os.path.join(RAIZ, "public", "img", "contacto.webp")
    c.save(ruta_webp, "WEBP", quality=80, method=6)
    print("contacto.webp:", os.path.getsize(ruta_webp), "bytes")
    ruta = os.path.join(RAIZ, "public", "img", "contacto.jpg")
    c.save(ruta, quality=86, optimize=True, progressive=True)
    print("contacto.jpg (respaldo OG):", os.path.getsize(ruta), "bytes")
