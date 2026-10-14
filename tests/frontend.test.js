// Pruebas de la lógica del frontend: sesión, cliente de la API, modelos y servicios.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const memoria = {};
globalThis.localStorage = { setItem: (k, v) => (memoria[k] = v), getItem: (k) => memoria[k] ?? null, removeItem: (k) => delete memoria[k] };
let llamadas = [], respuesta;
globalThis.fetch = async (url, opc) => {
  llamadas.push({ url, metodo: opc.method, cabeceras: opc.headers, cuerpo: opc.body });
  if (respuesta instanceof Error) throw respuesta;
  return { ok: respuesta.ok, status: respuesta.status, json: async () => respuesta.cuerpo };
};
const ok = (cuerpo) => ({ ok: true, status: 200, cuerpo });
const cargar = async () => ({ ...(await import("../public/js/api.js")), ...(await import("../public/js/productos.js")), ...(await import("../public/js/usuarios.js")) });

beforeEach(() => { llamadas = []; respuesta = ok({}); delete memoria["pixel_galletas_sesion"]; });

test("Sesion: guarda, lee y limpia", async () => {
  const { Sesion } = await cargar();
  Sesion.guardar("T", { nombre: "Ana" });
  assert.equal(Sesion.obtener().usuario.nombre, "Ana");
  Sesion.limpiar();
  assert.equal(Sesion.obtener(), null);
});

test("ApiClient: el login guarda la sesión y luego envía el token", async () => {
  const { ApiClient, Sesion } = await cargar();
  respuesta = ok({ token: "T1", usuario: { nombre: "Ana", rol: "cliente" } });
  const usuario = await new ApiClient().iniciarSesion("a@x.com", "clave");
  assert.equal(usuario.rol, "cliente");
  assert.equal(Sesion.obtener().token, "T1");
  respuesta = ok([]);
  await new ApiClient().get("/productos");
  assert.equal(llamadas.at(-1).cabeceras.Authorization, "Bearer T1");
});

test("ApiClient: un 401 con sesión la limpia y propaga el mensaje de la API", async () => {
  const { ApiClient, Sesion } = await cargar();
  Sesion.guardar("viejo", { nombre: "Ana" });
  respuesta = { ok: false, status: 401, cuerpo: { error: "Token inválido o expirado" } };
  await assert.rejects(() => new ApiClient().get("/usuarios"), { message: "Token inválido o expirado" });
  assert.equal(Sesion.obtener(), null);
});

test("ApiClient: sin conexión muestra un mensaje claro", async () => {
  const { ApiClient } = await cargar();
  respuesta = new Error("red caída");
  await assert.rejects(() => new ApiClient().get("/productos"), { message: "No se pudo conectar con el servidor." });
});

test("Producto: convierte el precio de texto a número y lo da en pesos colombianos", async () => {
  const { Producto } = await cargar();
  const p = new Producto({ id: 1, nombre_sabor: "Pixel Monster", descripcion: null, precio_venta: "4500.00" });
  assert.equal(p.precio, 4500);
  assert.ok(p.precioTexto.includes("4.500"));
  assert.equal(p.descripcion, "");
});

test("Producto: el inventario decide si se puede pedir y qué avisa la tarjeta", async () => {
  const { Producto } = await cargar();
  const base = { precio_venta: "6000.00" };
  // Sin control de inventario: se hornea bajo pedido y no hay nada que avisar.
  const libre = new Producto({ ...base, id: 1, nombre_sabor: "Libre", cantidad_disponible: null });
  assert.equal(libre.disponible, true);
  assert.equal(libre.avisoStock, null);
  // Con pocas unidades se anuncia urgencia real; con muchas, no se inventa.
  const pocas = new Producto({ ...base, id: 2, nombre_sabor: "Pocas", cantidad_disponible: 3 });
  assert.equal(pocas.disponible, true);
  assert.equal(pocas.avisoStock, "Quedan 3");
  assert.equal(new Producto({ ...base, id: 3, nombre_sabor: "Muchas", cantidad_disponible: 40 }).avisoStock, null);
  // Agotado: no se puede pedir y la tarjeta lo dice.
  const agotado = new Producto({ ...base, id: 4, nombre_sabor: "Agotado", cantidad_disponible: 0 });
  assert.equal(agotado.disponible, false);
  assert.equal(agotado.avisoStock, "Agotado por ahora");
  // Una respuesta vieja de la API (sin el campo) no marca nada como agotado.
  assert.equal(new Producto({ ...base, id: 5, nombre_sabor: "Viejo" }).disponible, true);
});

test("ProductoServicio: usa el método y la ruta correctos en cada operación CRUD", async () => {
  const { ProductoServicio, ApiClient, Producto } = await cargar();
  const s = new ProductoServicio(new ApiClient());
  respuesta = ok([{ id: 1, nombre_sabor: "A", descripcion: "x", precio_venta: "5000.00" }]);
  assert.ok((await s.listar())[0] instanceof Producto);
  await s.crear({ nombre_sabor: "N", precio_venta: 1 });
  await s.actualizar(3, { precio_venta: 2 });
  await s.eliminar(3);
  assert.deepEqual(llamadas.slice(1).map((l) => `${l.metodo} ${l.url}`), ["POST /api/productos", "PUT /api/productos/3", "DELETE /api/productos/3"]);
});

test("UsuarioServicio: listar, cambiar rol (solo envía el rol) y eliminar", async () => {
  const { UsuarioServicio, ApiClient, Usuario } = await cargar();
  const s = new UsuarioServicio(new ApiClient());
  respuesta = ok([{ id: 2, nombre: "Ana", correo: "a@x.com", rol: "cliente", creado_en: "2026-09-30T19:44:18.000Z" }]);
  assert.ok((await s.listar())[0] instanceof Usuario);
  await s.cambiarRol(2, "admin");
  await s.eliminar(2);
  assert.equal(llamadas[1].cuerpo, JSON.stringify({ rol: "admin" }));
  assert.deepEqual(llamadas.slice(1).map((l) => `${l.metodo} ${l.url}`), ["PUT /api/usuarios/2", "DELETE /api/usuarios/2"]);
});

test("Sello de familia: cada familia del catálogo tiene sigilo y todo sabor lo hereda", async () => {
  const { SIGILOS, FAMILIAS_INFO, FAMILIAS, familiaDe } = await cargar();
  assert.deepEqual(Object.keys(SIGILOS).sort(), Object.keys(FAMILIAS_INFO).sort());
  for (const [idSabor, familia] of Object.entries(FAMILIAS)) {
    assert.ok(SIGILOS[familia], `${idSabor} debería tener sigilo`);
  }
  assert.equal(familiaDe("special-edition"), "edicion");
  // Un sabor sin familia declarada no recibe sello: nunca se etiqueta de más.
  assert.equal(familiaDe("sabor-inventado"), null);
});

test("Sello de familia: cada sigilo apunta a un sprite definido en la página", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { SIGILOS } = await cargar();
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  for (const { sprite } of Object.values(SIGILOS)) {
    assert.ok(html.includes(`id="${sprite}"`), `el sprite ${sprite} debería estar definido en index.html`);
  }
});
