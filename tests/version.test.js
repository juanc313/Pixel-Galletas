// Aviso de versión nueva: el servidor dice qué versión está publicada y la app
// avisa (sin recargar sola) cuando cambió mientras estaba abierta.
process.env.JWT_SECRET = "clave-solo-para-pruebas";
process.env.VERCEL_GIT_COMMIT_SHA = "abc123def4567890";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { instalarDbFalsa } = require("./helpers/dbFalsa");
instalarDbFalsa();
const app = require("../src/app");

test("Versión: /api/version responde el commit publicado y sin caché", async () => {
  const servidor = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${servidor.address().port}/api/version`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(await r.json(), { version: "abc123def456" });
  } finally {
    servidor.close();
  }
});

// Ejecuta pwa.js con un navegador mínimo: fetch, reloj y eventos controlados.
function navegadorFalso() {
  let versionServidor = "v1";
  let ahora = 1_000_000;
  const oyentes = {};
  const hijos = [];
  let recargas = 0;
  const elemento = (tag) => ({
    tag, children: [], textContent: "", className: "", attrs: {}, oyentes: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...h) { this.children.push(...h); },
    addEventListener(ev, fn) { this.oyentes[ev] = fn; },
    remove() { hijos.splice(hijos.indexOf(this), 1); },
  });
  const documento = {
    hidden: false,
    createElement: elemento,
    createTextNode: (t) => ({ textContent: t }),
    addEventListener: (ev, fn) => { oyentes[ev] = fn; },
    body: { append: (n) => hijos.push(n) },
  };
  const ventana = {
    fetch: async () => ({ ok: true, json: async () => ({ version: versionServidor }) }),
    addEventListener: (ev, fn) => { oyentes[`w:${ev}`] = fn; },
  };
  const almacen = {};
  const contexto = {
    window: ventana, document: documento, navigator: {}, fetch: ventana.fetch,
    location: { reload: () => { recargas += 1; } },
    sessionStorage: { getItem: (k) => almacen[k] ?? null, setItem: (k, v) => { almacen[k] = String(v); } },
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false }),
    setTimeout: () => 0, setInterval: () => 0,
    Date: { now: () => ahora },
    Promise,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "public", "js", "pwa.js"), "utf8"), contexto);
  const esperar = () => new Promise((r) => setImmediate(r));
  return {
    publicar(v) { versionServidor = v; },
    pasarMinutos(m) { ahora += m * 60000; },
    async volverALaApp() { oyentes.visibilitychange(); await esperar(); await esperar(); },
    get aviso() { return hijos.find((h) => h.className === "actualizar-aviso"); },
    get recargas() { return recargas; },
    esperar,
  };
}

test("Versión: avisa al volver a la app si se publicó algo nuevo, y no recarga sola", async () => {
  const nav = navegadorFalso();
  await nav.esperar(); await nav.esperar();
  assert.equal(nav.aviso, undefined, "al abrir no hay aviso");

  nav.pasarMinutos(5);
  await nav.volverALaApp();
  assert.equal(nav.aviso, undefined, "misma versión: sin aviso");

  nav.publicar("v2");
  nav.pasarMinutos(5);
  await nav.volverALaApp();
  assert.ok(nav.aviso, "versión nueva: aparece el aviso");
  assert.equal(nav.recargas, 0, "nunca recarga sin que el cliente lo pida");

  const [, acciones] = nav.aviso.children;
  const [actualizar, luego] = acciones.children;
  actualizar.oyentes.click();
  assert.equal(nav.recargas, 1, "Actualizar recarga la página");

  luego.oyentes.click();
  assert.equal(nav.aviso, undefined, "Luego lo quita");
  nav.pasarMinutos(5);
  await nav.volverALaApp();
  assert.equal(nav.aviso, undefined, "y no insiste con esa misma versión en la visita");
});

test("Versión: no consulta al servidor en cada cambio de pestaña (máximo una vez por minuto)", async () => {
  const nav = navegadorFalso();
  await nav.esperar(); await nav.esperar();
  nav.publicar("v2");
  nav.pasarMinutos(0.5);
  await nav.volverALaApp();
  assert.equal(nav.aviso, undefined, "a los 30 segundos todavía no vuelve a preguntar");
  nav.pasarMinutos(1);
  await nav.volverALaApp();
  assert.ok(nav.aviso);
});
