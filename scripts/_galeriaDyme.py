# Temporal: saca las fotos de evidencias del Modelo DYME y arma una página
# para que el emprendedor diga qué foto corresponde a cada sabor.
from pypdf import PdfReader
import os, io
from PIL import Image

PDF = r"C:/Users/HP/OneDrive/Documents/MODELO DYME PIXEL GALLETAS EMPRENDE 2026.pdf"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "public", "img", "_dyme")
os.makedirs(SALIDA, exist_ok=True)

r = PdfReader(PDF)
fotos = []
n = 0
for i, p in enumerate(r.pages):
    for img in p.images:
        datos = img.data
        try:
            im = Image.open(io.BytesIO(datos))
        except Exception:
            continue
        # Las fotos del emprendimiento son las verticales grandes.
        if im.width < 600 or im.height <= im.width:
            continue
        n += 1
        nombre = f"F{n}.jpg"
        im.convert("RGB").save(os.path.join(SALIDA, nombre), "JPEG", quality=88, optimize=True)
        fotos.append((f"F{n}", f"página {i + 1}", im.size))

filas = "\n".join(
    f'      <figure><img src="/img/_dyme/{nombre}" alt="{nombre}"><figcaption><b>{nombre}</b> — {pagina} ({ancho}×{alto})</figcaption></figure>'
    for nombre, pagina, (ancho, alto) in fotos
)
html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fotos del Modelo DYME — ¿cuál es de qué sabor?</title>
<style>
  body {{ margin: 0; padding: 2rem; background: #150947; color: #fff3dc; font-family: system-ui, sans-serif; }}
  h1 {{ font-size: 1.4rem; }}
  p {{ color: #c9c0e8; max-width: 60ch; }}
  .rejilla {{ display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }}
  figure {{ margin: 0; background: #0c0535; padding: 0.8rem; border-radius: 10px; }}
  img {{ width: 100%; display: block; border-radius: 6px; }}
  figcaption {{ margin-top: 0.6rem; font-size: 0.9rem; color: #f5902f; }}
</style>
</head>
<body>
  <h1>Fotos del Modelo DYME</h1>
  <p>Estas son todas las fotos del emprendimiento que trae el PDF. Dime cuál es de qué sabor
  (por ejemplo: <b>F1 = Pixel Monster, F2 = Pixel Red Velvet…</b>) y también cuál, si alguna,
  es la foto del obrador o del proceso. Con esa lista genero los webp del catálogo.</p>
  <div class="rejilla">
{filas}
  </div>
</body>
</html>
"""
with open(os.path.join(RAIZ, "public", "_fotos-dyme.html"), "w", encoding="utf-8") as f:
    f.write(html)
print("fotos extraidas:", len(fotos))
for fila in fotos:
    print(" ", fila)
