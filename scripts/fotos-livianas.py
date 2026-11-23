# Versiones livianas de las fotos para el celular.
# Uso:  py scripts/fotos-livianas.py
#
# PageSpeed (noviembre 2026) marcó ~417 KB de fotos más grandes de lo que se
# ven en el celular. Este script deja copias chicas y la página las usa con
# srcset (el navegador elige la que necesita según la pantalla):
#   public/img/pixelito-chico/<pose>.webp  Pixelito del botón y del chat
#                                         (se ve de ~48 px; antes bajaba 360 px).
#                                         Todas en el mismo lienzo 120x132 para
#                                         que la proporción sea siempre la misma.
#   public/img/hero-700.webp              portada en el celular (700 px: pantallas 2x)
#   public/img/clientes-700.webp          foto de clientes en el celular
#   public/img/sabores/chico/<id>.webp    foto de la tarjeta del sabor (320 px);
#                                         al ampliar se usa la grande (480 px).
# Repítelo si cambias alguna de esas fotos originales.
from PIL import Image
import glob
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(RAIZ, "public", "img")


def guardar(im, ruta, calidad=80):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    im.save(ruta, "WEBP", quality=calidad, method=6)


def pixelito_chico():
    lienzo_w, lienzo_h = 120, 132  # misma proporción que 360x397 (width/height del HTML)
    hechas = 0
    for ruta in sorted(glob.glob(os.path.join(IMG, "pixelito*.webp"))):
        nombre = os.path.basename(ruta)
        pose = "pixelito" if nombre == "pixelito.webp" else nombre[len("pixelito-"):-len(".webp")]
        im = Image.open(ruta).convert("RGBA")
        im.thumbnail((lienzo_w, lienzo_h), Image.LANCZOS)
        lienzo = Image.new("RGBA", (lienzo_w, lienzo_h), (0, 0, 0, 0))
        lienzo.paste(im, ((lienzo_w - im.width) // 2, lienzo_h - im.height), im)  # apoyado abajo
        guardar(lienzo, os.path.join(IMG, "pixelito-chico", pose + ".webp"), 82)
        hechas += 1
    return hechas


def achicar(origen, destino, ancho, calidad=78):
    im = Image.open(os.path.join(IMG, origen))
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    alto = round(im.height * ancho / im.width)
    guardar(im.resize((ancho, alto), Image.LANCZOS), os.path.join(IMG, destino), calidad)


def main():
    n = pixelito_chico()
    achicar("hero.webp", "hero-700.webp", 700)
    achicar("clientes.jpg", "clientes-700.webp", 700)
    sabores = 0
    for ruta in sorted(glob.glob(os.path.join(IMG, "sabores", "*.webp"))):
        nombre = os.path.basename(ruta)
        achicar(os.path.join("sabores", nombre), os.path.join("sabores", "chico", nombre), 320, 80)
        sabores += 1
    print(f"Listo: {n} caras de Pixelito, portada, clientes y {sabores} sabores en versión liviana.")


if __name__ == "__main__":
    main()
