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

// La barra de la portada también va en las páginas sueltas: abiertas
// directamente (desde Google o un enlace) antes no traían menú ni botones.
const PAGINAS_CON_BARRA = ["404.html", "combo-personalizado.html", "historia-marca.html", "memoria-8bit.html",
  "preguntas-gamer.html", "privacidad.html", "seguimiento-pedido.html", "terminos.html"];

test("Barra: cada página suelta trae la barra completa de la portada", () => {
  const secciones = ["catalogo", "cajas", "como-funciona", "marca", "faq", "pedido", "estado", "contacto"];
  for (const pagina of PAGINAS_CON_BARRA) {
    const html = leer(`public/${pagina}`);
    const barra = html.slice(html.indexOf('<header class="barra">'), html.indexOf("</header>"));
    assert.ok(barra.length > 0, `${pagina} no tiene la barra`);
    for (const id of secciones) assert.match(barra, new RegExp(`href="/#${id}"`), `${pagina}: falta el enlace a ${id}`);
    for (const pieza of ['id="btn-acceso"', 'id="btn-menu"', 'id="carrito-contador"']) {
      assert.ok(barra.includes(pieza), `${pagina}: falta ${pieza} en la barra`);
    }
    // Tema y Música flotan aparte, a la derecha (como Pixelito y WhatsApp).
    const flotantes = html.slice(html.indexOf('<div class="ajustes-flotantes">'));
    assert.ok(html.includes('<div class="ajustes-flotantes">'), `${pagina}: faltan los botones flotantes`);
    for (const pieza of ['id="tema-boton"', 'class="musica-boton musica-flotante"', 'aria-label="Tema: claro u oscuro', 'aria-label="Música: sonido de fondo']) {
      assert.ok(flotantes.includes(pieza), `${pagina}: falta ${pieza} en los botones flotantes`);
    }
    // Lo que hace funcionar la barra: menú y tema (arranque), nombre y carrito
    // (cabecera) y el reproductor que abre el botón ♫.
    assert.match(html, /<script src="\/js\/arranque\.js"><\/script>/, `${pagina}: falta arranque.js`);
    assert.match(html, /<script type="module" src="\/js\/cabecera\.js"><\/script>/, `${pagina}: falta cabecera.js`);
    assert.match(html, /id="musica-panel"/, `${pagina}: falta el reproductor`);
    assert.match(html, /<script src="\/js\/musica\.js" defer><\/script>/, `${pagina}: falta musica.js`);
    // Debajo de Tema y Música, Pixelito y WhatsApp, igual que en la portada.
    assert.ok(html.includes('id="link-whatsapp-fijo-barra" class="barra-whatsapp"'), `${pagina}: falta WhatsApp`);
    assert.match(html, /<script type="module" src="\/js\/contacto\.js"><\/script>/, `${pagina}: falta contacto.js (número de WhatsApp)`);
    assert.match(html, /<script type="module" src="\/js\/pixelito\.js"><\/script>/, `${pagina}: falta Pixelito`);
  }
});

test("Barra: la pantalla de título solo tapa la portada, no las páginas sueltas", () => {
  assert.match(leer("public/js/arranque.js"), /if \(location\.pathname !== "\/" && location\.pathname !== "\/index\.html"\) return;/);
});

test("Barra: el contador de las páginas sueltas suma las galletas guardadas", async () => {
  const { contarCarrito } = await import("../public/js/cabecera.js");
  assert.equal(contarCarrito('[{"id":1,"cantidad":2},{"id":2,"cantidad":3}]'), 5);
  assert.equal(contarCarrito('[{"id":1,"cantidad":0}]'), 0, "una línea en 0 no cuenta");
  assert.equal(contarCarrito(null), 0);
  assert.equal(contarCarrito("no es json"), 0);
});
