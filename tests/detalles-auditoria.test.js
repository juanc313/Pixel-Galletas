// Detalles encontrados en la revisión del sitio publicado (noviembre 2026):
// fotos más livianas, menú de tema, botón de WhatsApp, Pixelito, mensaje del
// teléfono y HSTS. Que no vuelvan.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), "utf8").replace(/\r\n/g, "\n");
const existe = (ruta) => fs.existsSync(path.join(raiz, ruta));

test("Pixelito chico: hay versión liviana de cada cara que puede poner el bot", async () => {
  const { imagenPoseChica } = await import("../public/js/pixelito.js");
  const caras = fs.readdirSync(path.join(raiz, "public", "img")).filter((a) => /^pixelito.*\.webp$/.test(a));
  for (const archivo of caras) {
    const pose = archivo === "pixelito.webp" ? undefined : archivo.slice("pixelito-".length, -".webp".length);
    assert.ok(existe(path.join("public", imagenPoseChica(pose))), `falta ${imagenPoseChica(pose)}: corre  py scripts/fotos-livianas.py`);
  }
  assert.equal(imagenPoseChica(undefined), "/img/pixelito-chico/pixelito.webp");
});

test("El bot usa el Pixelito chico (no la imagen de 360 px)", () => {
  const js = leer("public/js/pixelito.js");
  assert.match(js, /src: imagenPoseChica\(pose\), alt: "", width: "120", height: "132"/);
  assert.doesNotMatch(js, /new Image\(\)\.src = imagenPose\(/);
});

test("Portada y foto de clientes: versión liviana con srcset para el celular", () => {
  const html = leer("public/index.html");
  assert.match(html, /<source srcset="\/img\/hero-700\.webp 700w, \/img\/hero\.webp 1200w"/);
  assert.match(html, /imagesrcset="\/img\/hero-700\.webp 700w, \/img\/hero\.webp 1200w"/);
  assert.match(html, /srcset="\/img\/clientes-700\.webp 700w, \/img\/clientes\.jpg 900w"/);
  assert.match(html, /width="900" height="675"/, "clientes.jpg mide 900x675 (antes decía 1080x1080)");
  for (const f of ["public/img/hero-700.webp", "public/img/clientes-700.webp"]) assert.ok(existe(f), `falta ${f}`);
});

test("Tarjetas de sabores: foto chica en la tarjeta y la grande al ampliar", async () => {
  const js = leer("public/js/productos.js");
  assert.match(js, /foto\.srcset = `\/img\/sabores\/chico\/\$\{li\.dataset\.sabor\}\.webp 320w, \$\{grande\} 480w`/);
  assert.match(js, /foto\.dataset\.grande = grande/);
  assert.match(leer("public/js/visor.js"), /foto\.src = img\.dataset\.grande \|\| img\.currentSrc \|\| img\.src/);
  const { FOTOS } = await import("../public/js/sabores.js");
  for (const id of FOTOS) assert.ok(existe(`public/img/sabores/chico/${id}.webp`), `falta la foto chica de ${id}`);
});

test("Menú de tema: se cierra al elegir y al bajar por la página", () => {
  const js = leer("public/js/arranque.js");
  const inicio = js.indexOf('op.addEventListener("click"');
  const clic = js.slice(inicio, js.indexOf('document.addEventListener("click"', inicio));
  assert.match(clic, /abrir\(false\);/, "al elegir un tema, el menú debe cerrarse");
  assert.match(js, /addEventListener\("scroll", function \(\) \{ if \(!panel\.hidden\) abrir\(false\); \}/);
});

test("Botón flotante de WhatsApp: la lista de la portada le deja espacio en el celular", () => {
  assert.match(leer("public/css/styles.css"), /@media \(max-width: 40rem\) \{ \.confianza \{ padding-right: 4\.25rem; \} \}/);
});

test("Teléfono mal escrito: mensaje claro en vez del genérico del navegador", () => {
  const js = leer("public/js/arranque.js");
  assert.match(js, /document\.addEventListener\("invalid", function \(e\) \{/);
  assert.match(js, /campo\.type !== "tel"/);
  assert.match(js, /de 7 a 15 dígitos \(ej\. 300 123 4567\)/);
});

test("HSTS de 2 años con preload en Vercel y en la API", () => {
  assert.match(leer("vercel.json"), /"Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload"/);
  assert.match(leer("src/app.js"), /strictTransportSecurity: \{ maxAge: 63072000, includeSubDomains: true, preload: true \}/);
});
