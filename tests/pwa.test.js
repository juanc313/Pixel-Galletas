// Pruebas de la PWA: el service worker (con cachés y red simuladas), el manifest,
// los iconos y las piezas que deben funcionar sin depender de los efectos.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.join(__dirname, "..");
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), "utf8");
const enPublic = (url) => fs.existsSync(path.join(raiz, "public", url.split(/[?#]/)[0]));

// Cachés en memoria: guardan copias, y una 206 revienta como en el navegador.
function cachesFalsas() {
  const almacen = new Map();
  // Como en el navegador, una ruta relativa se resuelve contra el sitio.
  const clave = (k) => new URL(typeof k === "string" ? k : k.url, "http://tienda.test").href;
  const abrir = (nombre) => {
    if (!almacen.has(nombre)) almacen.set(nombre, new Map());
    const c = almacen.get(nombre);
    return {
      addAll: async (urls) => urls.forEach((u) => c.set("http://tienda.test" + u, new Response("basico", { headers: { "content-type": "text/html" } }))),
      put: async (k, r) => {
        if (r.status === 206) throw new TypeError("Partial response");
        c.delete(clave(k));
        c.set(clave(k), r);
      },
      keys: async () => [...c.keys()].map((url) => ({ url })),
      delete: async (k) => c.delete(clave(k)),
    };
  };
  return {
    almacen,
    open: async (nombre) => abrir(nombre),
    keys: async () => [...almacen.keys()],
    delete: async (nombre) => almacen.delete(nombre),
    match: async (k) => {
      for (const c of almacen.values()) if (c.has(clave(k))) return c.get(clave(k));
      return undefined;
    },
  };
}

function cargarSw(red) {
  const oyentes = {};
  const caches = cachesFalsas();
  const self = {
    location: { origin: "http://tienda.test" },
    addEventListener: (nombre, fn) => { oyentes[nombre] = fn; },
    skipWaiting() {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(leer("public/sw.js"), { self, caches, fetch: red, URL, Response, Promise, Math, console });
  const instalar = async () => {
    const esperas = [];
    oyentes.install({ waitUntil: (p) => esperas.push(p) });
    await Promise.all(esperas);
  };
  // Devuelve la respuesta para la página, o undefined si el SW no interviene.
  const pedir = async (ruta, opciones = {}) => {
    const esperas = [];
    let respuesta;
    oyentes.fetch({
      request: {
        url: "http://tienda.test" + ruta,
        method: "GET",
        mode: opciones.mode || "cors",
        destination: opciones.destination || "",
        headers: new Headers(opciones.headers || {}),
      },
      respondWith: (p) => { respuesta = p; },
      waitUntil: (p) => esperas.push(p),
    });
    const final = await respuesta;
    await Promise.all(esperas);
    return final;
  };
  return { caches, instalar, pedir, extra: () => caches.almacen.get("pixel-galletas-extra-v4") };
}

// Una respuesta con type "basic", que es lo que da la red para el propio sitio.
const comoBasica = (r) => Object.defineProperty(r, "type", { value: "basic" });
const css = () => comoBasica(new Response("a{}", { status: 200, headers: { "content-type": "text/css" } }));

test("SW: guarda una copia y la página aún puede leer el cuerpo", async () => {
  const { pedir, extra } = cargarSw(async () => css());
  const r = await pedir("/css/otra.css");
  assert.equal(await r.text(), "a{}");
  assert.equal(await extra().get("http://tienda.test/css/otra.css").text(), "a{}");
});

test("SW: nunca guarda respuestas 206 ni se mete con peticiones Range", async () => {
  const { pedir, caches } = cargarSw(async () => comoBasica(new Response("x", { status: 206 })));
  await pedir("/img/parcial.jpg");
  assert.equal(caches.almacen.size, 0);
  assert.equal(await pedir("/video/horno.mp4", { headers: { range: "bytes=0-" } }), undefined);
});

test("SW: ?nav= no crea entradas nuevas y la caché tiene tope", async () => {
  const { pedir, extra } = cargarSw(async () => css());
  await pedir("/js/efectos.js?nav=1");
  await pedir("/js/efectos.js?nav=2");
  assert.deepEqual([...extra().keys()], ["http://tienda.test/js/efectos.js"]);
  for (let i = 0; i < 80; i++) await pedir(`/img/f${i}.jpg`);
  assert.ok(extra().size <= 60, `quedaron ${extra().size}`);
});

test("SW: sin red solo las navegaciones reciben la página sin conexión", async () => {
  const { instalar, pedir } = cargarSw(async () => { throw new TypeError("sin red"); });
  await instalar();
  const pagina = await pedir("/combo-personalizado.html", { mode: "navigate" });
  assert.equal(await pagina.text(), "basico");
  // Un recurso que falla da error de red, nunca HTML disfrazado de JS o imagen.
  const recurso = await pedir("/js/no-guardado.js");
  assert.equal(recurso.type, "error");
});

test("SW: un recurso guardado se sirve sin red bajo su clave sin ?nav=", async () => {
  let conRed = true;
  const { pedir } = cargarSw(async () => { if (!conRed) throw new TypeError("sin red"); return css(); });
  await pedir("/js/efectos.js");
  conRed = false;
  const r = await pedir("/js/efectos.js?nav=7");
  assert.equal(await r.text(), "a{}");
});

test("SW: no guarda HTML ni toca la API", async () => {
  let llamadas = 0;
  const { pedir, extra } = cargarSw(async () => {
    llamadas++;
    return comoBasica(new Response("<p>", { status: 200, headers: { "content-type": "text/html" } }));
  });
  await pedir("/seguimiento-pedido.html");
  assert.equal(extra(), undefined);
  assert.equal(await pedir("/api/productos"), undefined);
  assert.equal(llamadas, 1);
});

test("SW: todo lo precacheado existe y la página sin conexión solo usa eso", () => {
  const bloque = leer("public/sw.js").match(/const BASICOS = \[([\s\S]*?)\];/)[1];
  const basicos = [...bloque.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]);
  basicos.push("/offline.html");
  for (const url of basicos) assert.ok(enPublic(url), `falta ${url}`);
  const html = leer("public/offline.html");
  for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    assert.ok(basicos.includes(url), `offline.html usa ${url} y no está precacheado`);
  }
  for (const [, url] of leer("public/css/fuentes.css").matchAll(/url\('(\/fonts\/[^']*-latin\.woff2)'\)/g)) {
    assert.ok(basicos.includes(url), `falta precachear ${url}`);
  }
});

test("Manifest: icono maskable propio y atajos que existen", () => {
  const manifest = JSON.parse(leer("public/manifest.json"));
  const maskable = manifest.icons.find((i) => i.purpose === "maskable");
  assert.equal(maskable.src, "/img/icon-maskable-512.png");
  const nombres = manifest.shortcuts.map((a) => a.name);
  assert.deepEqual(nombres, ["Galletas", "Combos", "Estado de mi pedido"]);
  const portada = leer("public/index.html");
  for (const atajo of manifest.shortcuts) {
    const [ruta, ancla] = atajo.url.split("#");
    if (ancla) assert.ok(portada.includes(`id="${ancla}"`), `la portada no tiene #${ancla}`);
    else assert.ok(enPublic(ruta), `no existe ${ruta}`);
  }
  for (const icono of manifest.icons) assert.ok(enPublic(icono.src), `falta ${icono.src}`);
});

test("Iconos: el maskable y el de Apple no tienen transparencia", () => {
  // Byte 25 de un PNG: tipo de color. El 2 es RGB sin canal alfa.
  for (const ruta of ["public/img/icon-maskable-512.png", "public/img/apple-touch-icon.png"]) {
    assert.equal(fs.readFileSync(path.join(raiz, ruta))[25], 2, `${ruta} tiene transparencia`);
  }
});

test("Páginas: las que tienen manifest traen las etiquetas de Apple y la 404 su icono", () => {
  for (const pagina of ["index", "combo-personalizado", "historia-marca", "memoria-8bit", "preguntas-gamer", "seguimiento-pedido"]) {
    const html = leer(`public/${pagina}.html`);
    for (const nombre of ["apple-mobile-web-app-capable", "apple-mobile-web-app-status-bar-style", "apple-mobile-web-app-title"]) {
      assert.ok(html.includes(`name="${nombre}"`), `${pagina} no tiene ${nombre}`);
    }
  }
  const noEncontrada = leer("public/404.html");
  assert.match(noEncontrada, /name="theme-color"/);
  assert.match(noEncontrada, /rel="icon"/);
});

test("Menú móvil: no depende de efectos.js ni de js-anim", () => {
  const css = leer("public/css/styles.css");
  assert.doesNotMatch(css, /\.js-anim \.menu/);
  assert.doesNotMatch(css, /:not\(\.js-anim\) \.menu/);
  assert.match(leer("public/js/arranque.js"), /classList\.add\("js-menu"\)/);
  assert.doesNotMatch(leer("public/js/efectos.js"), /btn-menu/);
});

test("Catálogo: efectos.js reutiliza la petición de productos.js", () => {
  const efectos = leer("public/js/efectos.js");
  assert.doesNotMatch(efectos, /api\/productos/);
  assert.match(efectos, /catalogo-cargado/);
});

test("Fuentes: Rubik baja un solo archivo y el CSS no tiene comentarios // que anulen reglas", () => {
  const fuentes = leer("public/css/fuentes.css");
  assert.doesNotMatch(fuentes, /^\/\//m);
  assert.doesNotMatch(fuentes, /rubik-(500|700)/);
  assert.equal(fuentes.match(/fonts\/rubik-400-latin\.woff2/g).length, 1);
});
