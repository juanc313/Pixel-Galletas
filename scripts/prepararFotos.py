# Prepara las imágenes del sitio a partir de las fotos reales del emprendimiento.
# Uso:  py scripts/prepararFotos.py
#   Fotos en C:/Users/HP/Downloads  ->  public/img/sabores/*.webp
#
# Mapeo de sabores (confirmado con el usuario, septiembre 2025):
#   monster        IMG_20251015_181049  turquesa con chips
#   red-velvet     IMG_20251015_180913  roja lisa
#   chocolate      IMG_20251015_153410  marrón con chips y centro amarillo
#   red-monster    IMG_20250821_201244  fusión red velvet + monster, bicolor rojo/turquesa
#   special-edition IMG_20251104_194507 cuatro cuadrantes de color
#
#   red-monster sale de una foto cruda (sobre plato), por lo que lleva un recorte
#   por color + elipse; los demás ya venían con fondo removebg.
#
#   areklim NO está en el mapeo automático: su foto origen (PIXEL AREKLIM.png, galleta
#   amarilla con M&M) no está en la carpeta de origen, así que su webp final no puede
#   regenerarse desde aquí. Ya existe generada en public/img/sabores/areklim.webp, y el
#   script la respeta: no la pisa, pero sí la sigue incluyendo en la composición de contacto.
#
# Nota: la galleta "Pixel Arequipe" y la "Pixel Klim" por separado se retiraron del
# catálogo; hoy son la fusión AreKlim. No volver a generar arequipe.webp ni klim.webp.
#
# Nota: la foto IMG_20251015_153845 (galleta con M&M) se identificó erróneamente como
# "Chocoarequipe" en una versión anterior. El emprendedor confirmó que NO es un sabor
# del catálogo, así que no se genera ninguna webp a partir de esa foto.
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import os
import math

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = r"C:/Users/HP/Downloads"
SALIDA = os.path.join(RAIZ, "public", "img", "sabores")
os.makedirs(SALIDA, exist_ok=True)

# (sabor, archivo origen, tipo de recorte)
#   "fondo" = la foto ya trae fondo transparente (removebg), solo centrar y escalar
#   "cruda" = foto sobre fondo complejo; recortar por color y recortar con elipse
ORIGENES = [
    ("monster",         "IMG_20251015_181049.jpg", "fondo"),
    ("red-velvet",      "IMG_20251015_180913.jpg", "fondo"),
    ("chocolate",       "IMG_20251015_153410.jpg", "fondo"),
    ("red-monster",     "IMG_20250821_201244.jpg", "cruda"),
    ("special-edition", "IMG_20251104_194507.jpg", "fondo"),
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


def recortar_cruda(ruta, umbral=42):
    """Recorta una galleta sobre fondo complejo (reja o plato).
    Separa el sujeto por diferencia con el color del borde, rellena los huecos
    internos y limpia las esquinas con una elipse (las galletas son redondas)."""
    im = Image.open(ruta).convert("RGB")
    ancho, alto = im.size
    # Color de referencia del fondo: promedio de los bordes.
    muestras = []
    for x in range(0, ancho, max(1, ancho // 40)):
        muestras.append(im.getpixel((x, 2)))
        muestras.append(im.getpixel((x, alto - 3)))
    for y in range(0, alto, max(1, alto // 40)):
        muestras.append(im.getpixel((2, y)))
        muestras.append(im.getpixel((ancho - 3, y)))
    fondo = tuple(sum(c[i] for c in muestras) // len(muestras) for i in range(3))

    # Máscara: 255 = galleta (lo que difiere del fondo).
    gris = im.convert("L")
    fondo_l = int(0.299 * fondo[0] + 0.587 * fondo[1] + 0.114 * fondo[2])
    mascara = gris.point(lambda p: 255 if abs(p - fondo_l) > umbral else 0)

    # Rellena huecos internos (chips, grietas) y descarta fragmentos sueltos.
    relleno = mascara.copy()
    ImageDraw.floodfill(relleno, (0, 0), 0, thresh=0)  # marca el exterior tocado
    interior = relleno.point(lambda p: 255 if p == 255 else 0)
    mascara = ImageChops.lighter(mascara, interior)

    # Conserva solo el cuerpo principal (elipse centrada; las galletas son redondas).
    mascara = mascara.filter(ImageFilter.MedianFilter(9))
    elipse = Image.new("L", mascara.size, 0)
    ImageDraw.Draw(elipse).ellipse((int(ancho * .06), int(alto * .06),
                                    int(ancho * .94), int(alto * .94)), fill=255)
    elipse = elipse.filter(ImageFilter.MedianFilter(9))
    mascara = ImageChops.multiply(mascara, elipse)
    mascara = mascara.filter(ImageFilter.GaussianBlur(2))

    salida = im.convert("RGBA")
    salida.putalpha(mascara)
    return salida


def contacto():
    """Composición de marca: las seis galletas ya recortadas (public/img/sabores)
    más el logo, sobre el mismo índigo pixelado del sitio. Reutiliza los .webp
    finales para que la composición coincida siempre con el catálogo."""
    ancho, alto = 1080, 1080
    noche = Image.new("RGBA", (ancho, alto), (21, 9, 79, 255))
    tex = ImageDraw.Draw(noche)
    for x in range(0, ancho, 36):
        tex.line([(x, 0), (x, alto)], fill=(255, 243, 220, 9), width=2)
    for y in range(0, alto, 36):
        tex.line([(0, y), (ancho, y)], fill=(255, 243, 220, 9), width=2)
    halo = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse((140, 140, ancho - 140, alto - 140), fill=(245, 144, 47, 60))
    halo = halo.filter(ImageFilter.GaussianBlur(120))
    noche.alpha_composite(halo)

    galletas = []
    # Lee lo que realmente hay en la carpeta de salida (así incluye también a areklim,
    # cuyo origen automático ya no existe pero su webp final sí está generada).
    for archivo in sorted(os.listdir(SALIDA)):
        if not archivo.endswith(".webp"):
            continue
        g = Image.open(os.path.join(SALIDA, archivo)).convert("RGBA")
        g.thumbnail((300, 300), Image.LANCZOS)
        galletas.append((archivo, g))

    # Coloca las galletas en una corona alrededor del logo, dejando libre la banda
    # central (el logo ocupa ~460px centrado). Se normaliza el lado de todas para que
    # el conjunto quede parejo y ninguna se salga del lienzo ni se encime con el logo.
    n = max(1, len(galletas))
    lado = 250                      # lado común para todas las galletas
    radio_x = ancho // 2 - lado // 2 - 20
    radio_y = int((alto // 2 - lado // 2 - 20) * 1.18)   # elipse: deja aire arriba/abajo al logo
    for i, (sabor, g) in enumerate(galletas):
        ang = (2 * math.pi * i) / n - math.pi / 2   # primera arriba, sentido horario
        cx = ancho // 2 + radio_x * math.cos(ang)
        cy = alto // 2 + radio_y * math.sin(ang)
        g = g.copy(); g.thumbnail((lado, lado), Image.LANCZOS)
        x = int(max(0, min(cx - g.width // 2, ancho - g.width)))
        y = int(max(0, min(cy - g.height // 2, alto - g.height)))
        sombra = Image.new("RGBA", g.size, (0, 0, 0, 0))
        sombra.paste((0, 0, 0, 130), (0, 0, g.width, g.height), g.getchannel("A"))
        sombra = sombra.filter(ImageFilter.GaussianBlur(14))
        noche.alpha_composite(sombra, (min(x + 10, ancho - 1), min(y + 30, alto - 1)))
        noche.alpha_composite(g, (x, y))

    logo = Image.open(os.path.join(RAIZ, "public", "img", "logo.png")).convert("RGBA")
    logo.thumbnail((430, 430), Image.LANCZOS)
    noche.alpha_composite(logo, ((ancho - logo.width) // 2, (alto - logo.height) // 2 - 10))
    return noche.convert("RGB")


if __name__ == "__main__":
    for sabor, archivo, tipo in ORIGENES:
        ruta_origen = os.path.join(FOTOS, archivo)
        if not os.path.exists(ruta_origen):
            print("FALTA la foto de", sabor, "->", ruta_origen)
            continue
        im = recortar_cruda(ruta_origen) if tipo == "cruda" else Image.open(ruta_origen)
        im = centrar_y_escalar(im)
        ruta = os.path.join(SALIDA, sabor + ".webp")
        im.save(ruta, "WEBP", quality=82, method=6)
        print("sabor:", os.path.basename(ruta), im.size, os.path.getsize(ruta), "bytes")

    # Composición de marca de la sección de contacto (WebP + respaldo JPEG para Open Graph).
    c = contacto()
    ruta_webp = os.path.join(RAIZ, "public", "img", "contacto.webp")
    c.save(ruta_webp, "WEBP", quality=80, method=6)
    print("contacto.webp:", os.path.getsize(ruta_webp), "bytes")
    ruta = os.path.join(RAIZ, "public", "img", "contacto.jpg")
    c.save(ruta, quality=86, optimize=True, progressive=True)
    print("contacto.jpg (respaldo OG):", os.path.getsize(ruta), "bytes")
