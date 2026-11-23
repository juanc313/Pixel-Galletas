# Páginas de cada sabor para que WhatsApp muestre la FOTO de la galleta.
# Uso:  py scripts/paginas-sabores.py
#
# Por qué: el botón "Enviar por WhatsApp" abre el chat de Pixel Galletas
# directo (wa.me con el número), y un enlace así no puede llevar imágenes.
# Lo que sí hace WhatsApp es mostrar la vista previa de una PÁGINA que tenga
# etiquetas og: con una foto. Probado en celular real en los otros sitios:
# con un enlace directo a la imagen NO sale; con una página sí, y mejor en JPG.
#
# Crea, por cada sabor con foto real (public/img/sabores/<id>.webp):
#   public/img/sabores/og/<id>.jpg   foto JPG 600 px, fondo crema
#   public/s/<id>.html               página con og:image, botón de pedir y
#                                    enlace a la tienda
# El mensaje del pedido enlaza a la del primer sabor (pedidos.js).
# Si agregas un sabor con foto a FOTOS (public/js/sabores.js), agrégalo aquí
# también; la prueba tests/paginas-sabores.test.js avisa si falta.
from PIL import Image
import html
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITIO = "https://pixel-galletas.vercel.app"
FONDO = (255, 246, 229)  # crema de la marca

SABORES = {
    "monster": ("Pixel Monster", "Galleta Nueva York turquesa con chips de chocolate."),
    "red-velvet": ("Pixel Red Velvet", "Galleta Nueva York roja, suave y con chips."),
    "chocolate": ("Pixel Chocolate", "Galleta Nueva York de chocolate con centro cremoso."),
    "areklim": ("Pixel AreKlim", "Fusión de arequipe y Klim, con M&M de colores."),
    "red-monster": ("Pixel Red Monster", "Fusión Red Velvet + Monster, roja y turquesa."),
    "special-edition": ("Pixel Special Edition", "Edición especial de cuatro colores."),
}


def pagina(id_sabor, nombre, descripcion):
    e = lambda t: html.escape(t, quote=True)
    url = f"{SITIO}/s/{id_sabor}.html"
    foto = f"{SITIO}/img/sabores/og/{id_sabor}.jpg"
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(nombre)} · Pixel Galletas</title>
<meta name="description" content="{e(descripcion)}">
<meta name="robots" content="noindex">
<link rel="canonical" href="{e(url)}">
<link rel="icon" href="/img/favicon.png">
<meta property="og:type" content="product">
<meta property="og:locale" content="es_CO">
<meta property="og:site_name" content="Pixel Galletas">
<meta property="og:title" content="{e(nombre)} · Pixel Galletas">
<meta property="og:description" content="{e(descripcion)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{e(foto)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="Galleta {e(nombre)}">
<link rel="stylesheet" href="/css/pagina-sabor.css">
</head>
<body>
<main>
<img src="/img/sabores/og/{id_sabor}.jpg" alt="Galleta {e(nombre)}" width="600" height="600">
<h1>{e(nombre)}</h1>
<p>{e(descripcion)}</p>
<a class="boton" href="/#pedido">Pedir en Pixel Galletas</a>
</main>
</body>
</html>
"""


def main():
    carpeta_og = os.path.join(RAIZ, "public", "img", "sabores", "og")
    carpeta_s = os.path.join(RAIZ, "public", "s")
    os.makedirs(carpeta_og, exist_ok=True)
    os.makedirs(carpeta_s, exist_ok=True)
    for id_sabor, (nombre, descripcion) in SABORES.items():
        origen = os.path.join(RAIZ, "public", "img", "sabores", id_sabor + ".webp")
        if not os.path.exists(origen):
            print(f"Aviso: falta {origen}; se salta {id_sabor}")
            continue
        im = Image.open(origen).convert("RGBA")
        im.thumbnail((600, 600))
        lienzo = Image.new("RGB", (600, 600), FONDO)
        lienzo.paste(im, ((600 - im.width) // 2, (600 - im.height) // 2), im)
        lienzo.save(os.path.join(carpeta_og, id_sabor + ".jpg"), "JPEG", quality=82, optimize=True, progressive=True)
        with open(os.path.join(carpeta_s, id_sabor + ".html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(pagina(id_sabor, nombre, descripcion))
    print(f"Listo: {len(SABORES)} páginas en public/s/ y fotos JPG en public/img/sabores/og/")


if __name__ == "__main__":
    main()
