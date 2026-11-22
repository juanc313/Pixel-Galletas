// Regresión: con el token vencido (dura 2 h), los paneles de admin "Pedidos
// recibidos" y "Usuarios" mostraban "Token inválido o expirado" y dejaban la
// cabecera como si siguiera la sesión. Al cargar, deben avisar "sesion-vencida"
// para que la cabecera pida entrar de nuevo.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Los archivos pueden tener fin de línea de Windows (\r\n): se normaliza a \n.
const leer = (ruta) => fs.readFileSync(path.join(__dirname, "..", ruta), "utf8").replace(/\r\n/g, "\n");

// Cuerpo de "async cargar() { ... }" (hasta la llave que lo cierra con 2 espacios).
function cuerpoDeCargar(fuente, desde = 0) {
  const inicio = fuente.indexOf("async cargar() {", desde);
  assert.ok(inicio !== -1, "no se encontró async cargar()");
  const fin = fuente.indexOf("\n  }\n", inicio);
  assert.ok(fin !== -1, "no se encontró el cierre de cargar()");
  return fuente.slice(inicio, fin);
}

const AVISO = 'if (habiaSesion && !Sesion.obtener()) window.dispatchEvent(new Event("sesion-vencida"));';

test("usuarios.js: cargar() avisa sesion-vencida si el token venció", () => {
  const cuerpo = cuerpoDeCargar(leer("public/js/usuarios.js"));
  assert.match(cuerpo, /const habiaSesion = !!Sesion\.obtener\(\);/);
  assert.ok(cuerpo.includes(AVISO), "falta el aviso sesion-vencida en el catch");
});

test("pedidos.js: cargar() del panel de admin avisa sesion-vencida si el token venció", () => {
  const fuente = leer("public/js/pedidos.js");
  const panel = fuente.indexOf('this.$("seccion-pedidos-admin")');
  assert.ok(panel !== -1, "no se encontró el panel de pedidos de admin");
  const cuerpo = cuerpoDeCargar(fuente, panel);
  assert.match(cuerpo, /servicio\.listar\(\)/);
  assert.match(cuerpo, /const habiaSesion = !!Sesion\.obtener\(\);/);
  assert.ok(cuerpo.includes(AVISO), "falta el aviso sesion-vencida en el catch");
});

test("api.js: un 401 con sesión la borra (por eso habiaSesion && !Sesion.obtener() detecta el vencimiento)", async () => {
  const almacen = new Map();
  globalThis.localStorage = {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: (k) => almacen.delete(k),
  };
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: "Token inválido o expirado" }) });
  const { ApiClient, Sesion } = await import("../public/js/api.js");

  Sesion.guardar("token-vencido", { id: 1, nombre: "Admin", rol: "admin" });
  const habiaSesion = !!Sesion.obtener();
  await assert.rejects(() => new ApiClient().get("/usuarios"), { message: "Token inválido o expirado" });
  assert.equal(habiaSesion && !Sesion.obtener(), true);
  assert.equal(Sesion.vencio(), true);
});
