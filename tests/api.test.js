// Pruebas de la API: autenticación, autorización por rol y CRUD (con base simulada).
process.env.JWT_SECRET = "clave-solo-para-pruebas";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { instalarDbFalsa } = require("./helpers/dbFalsa");
const db = instalarDbFalsa();
const app = require("../src/app");

let servidor, base, tokAdmin, tokCliente, idAdmin, idCliente, idPedido;

async function llamar(metodo, ruta, cuerpo, token) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: r.status, datos: await r.json().catch(() => null) };
}
const entrar = async (correo, contrasena) => (await llamar("POST", "/api/usuarios/login", { correo, contrasena })).datos.token;

before(async () => {
  servidor = app.listen(0);
  base = "http://127.0.0.1:" + servidor.address().port;
  idAdmin = db.agregarUsuario("Admin", "admin@x.com", await bcrypt.hash("adminpass", 10), "admin");
  tokAdmin = await entrar("admin@x.com", "adminpass");
});
after(() => servidor.close());

test("Registro: crea un cliente aunque se envíe rol=admin", async () => {
  const { estado, datos } = await llamar("POST", "/api/usuarios/registro", { nombre: "Ana", correo: "ana@x.com", contrasena: "secreto1", rol: "admin" });
  assert.equal(estado, 201);
  assert.equal(datos.rol, "cliente");
  idCliente = datos.id;
  tokCliente = await entrar("ana@x.com", "secreto1");
});

test("Registro: rechaza contraseña corta (400) y correo repetido (409)", async () => {
  assert.equal((await llamar("POST", "/api/usuarios/registro", { nombre: "B", correo: "b@x.com", contrasena: "123" })).estado, 400);
  assert.equal((await llamar("POST", "/api/usuarios/registro", { nombre: "Ana", correo: "ana@x.com", contrasena: "otraclave" })).estado, 409);
});

test("Login: credenciales incorrectas -> 401 con mensaje genérico", async () => {
  const { estado, datos } = await llamar("POST", "/api/usuarios/login", { correo: "ana@x.com", contrasena: "mala" });
  assert.equal(estado, 401);
  assert.equal(datos.error, "Credenciales inválidas");
});

test("Productos: el catálogo es público", async () => {
  assert.equal((await llamar("GET", "/api/productos")).estado, 200);
});

test("Productos: crear exige sesión (401) y rol admin (403)", async () => {
  const nuevo = { nombre_sabor: "Pixel Test", precio_venta: 5000 };
  assert.equal((await llamar("POST", "/api/productos", nuevo)).estado, 401);
  assert.equal((await llamar("POST", "/api/productos", nuevo, "token.falso.aqui")).estado, 401);
  assert.equal((await llamar("POST", "/api/productos", nuevo, tokCliente)).estado, 403);
});

test("Productos: el admin crea, edita y elimina", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Test", precio_venta: 5000 }, tokAdmin);
  assert.equal(creado.estado, 201);
  const id = creado.datos.id;
  const editado = await llamar("PUT", "/api/productos/" + id, { precio_venta: 5200 }, tokAdmin);
  assert.equal(editado.estado, 200);
  assert.equal(Number(editado.datos.precio_venta), 5200);
  assert.equal((await llamar("PUT", "/api/productos/" + id, { precio_venta: 1 }, tokCliente)).estado, 403);
  assert.equal((await llamar("DELETE", "/api/productos/" + id, null, tokCliente)).estado, 403);
  assert.equal((await llamar("DELETE", "/api/productos/" + id, null, tokAdmin)).estado, 200);
  assert.equal((await llamar("GET", "/api/productos/" + id)).estado, 404);
});

test("Usuarios: la gestión es solo del admin y nunca expone contraseñas", async () => {
  assert.equal((await llamar("GET", "/api/usuarios")).estado, 401);
  assert.equal((await llamar("GET", "/api/usuarios", null, tokCliente)).estado, 403);
  const lista = await llamar("GET", "/api/usuarios", null, tokAdmin);
  assert.equal(lista.estado, 200);
  assert.ok(!JSON.stringify(lista.datos).includes("contrasena"));
});

test("Usuarios: rol inválido (400); el admin no puede eliminarse ni quitarse su rol", async () => {
  assert.equal((await llamar("PUT", "/api/usuarios/" + idCliente, { rol: "superadmin" }, tokAdmin)).estado, 400);
  assert.equal((await llamar("DELETE", "/api/usuarios/" + idAdmin, null, tokAdmin)).estado, 400);
  assert.equal((await llamar("PUT", "/api/usuarios/" + idAdmin, { rol: "cliente" }, tokAdmin)).estado, 400);
});

test("Usuarios: el rol vigente en la base de datos manda sobre el del token", async () => {
  await llamar("PUT", "/api/usuarios/" + idCliente, { rol: "admin" }, tokAdmin);
  assert.equal((await llamar("GET", "/api/usuarios", null, tokCliente)).estado, 200);
  await llamar("PUT", "/api/usuarios/" + idCliente, { rol: "cliente" }, tokAdmin);
  assert.equal((await llamar("GET", "/api/usuarios", null, tokCliente)).estado, 403);
  await llamar("DELETE", "/api/usuarios/" + idCliente, null, tokAdmin);
  assert.equal((await llamar("GET", "/api/usuarios", null, tokCliente)).estado, 403);
});

test("Rutas inexistentes responden 404 en JSON", async () => {
  const { estado, datos } = await llamar("GET", "/api/nada");
  assert.equal(estado, 404);
  assert.ok(datos);
});

// ---------- Pedidos ----------

test("Pedidos: crear es público y valida los datos del cliente", async () => {
  const sinItems = await llamar("POST", "/api/pedidos", { cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [] });
  assert.equal(sinItems.estado, 400);
  const sinNombre = await llamar("POST", "/api/pedidos", { cliente_telefono: "3001112233", items: [{ producto_id: 1, cantidad: 1 }] });
  assert.equal(sinNombre.estado, 400);
  const telefonoMalo = await llamar("POST", "/api/pedidos", { cliente_nombre: "Ana", cliente_telefono: "abc", items: [{ producto_id: 1, cantidad: 1 }] });
  assert.equal(telefonoMalo.estado, 400);
  const productoInexistente = await llamar("POST", "/api/pedidos", { cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [{ producto_id: 9999, cantidad: 1 }] });
  assert.equal(productoInexistente.estado, 400);
  const cantidadMala = await llamar("POST", "/api/pedidos", { cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [{ producto_id: 1, cantidad: 0 }] });
  assert.equal(cantidadMala.estado, 400);
});

test("Pedidos: el total lo calcula el servidor con los precios reales, no con los del navegador", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Prueba", precio_venta: 6000 }, tokAdmin);
  const idProducto = creado.datos.id;

  // El cliente manda precio_unitario falsísimo: debe ignorarse.
  const respuesta = await llamar("POST", "/api/pedidos", {
    cliente_nombre: "Pedro",
    cliente_telefono: "+57 300 555 4444",
    direccion: "Ceiba 2",
    notas: "Sin nueces",
    items: [
      { producto_id: idProducto, cantidad: 3, precio_unitario: 1 },
      { producto_id: idProducto, cantidad: 2 },
    ],
  });
  assert.equal(respuesta.estado, 201);
  idPedido = respuesta.datos.id;
  assert.equal(respuesta.datos.total, 30000); // 5 × $6.000, ignorando precio_unitario del cliente
  assert.equal(respuesta.datos.estado, "pendiente");
  assert.equal(respuesta.datos.detalles.length, 2);
  assert.equal(respuesta.datos.detalles[0].nombre_sabor, "Pixel Prueba");
  assert.ok(!JSON.stringify(respuesta.datos).includes("contrasena"));
});

test("Pedidos: ver y gestionar es solo del admin", async () => {
  assert.equal((await llamar("GET", "/api/pedidos")).estado, 401);
  assert.equal((await llamar("GET", "/api/pedidos", null, tokCliente)).estado, 403);
  assert.equal((await llamar("PUT", `/api/pedidos/${idPedido}/estado`, { estado: "listo" }, tokCliente)).estado, 403);

  const lista = await llamar("GET", "/api/pedidos", null, tokAdmin);
  assert.equal(lista.estado, 200);
  assert.ok(lista.datos.some((p) => p.id === idPedido));
  assert.ok(lista.datos.find((p) => p.id === idPedido).detalles.length >= 2);

  const estadoInvalido = await llamar("PUT", `/api/pedidos/${idPedido}/estado`, { estado: "volando" }, tokAdmin);
  assert.equal(estadoInvalido.estado, 400);

  const actualizado = await llamar("PUT", `/api/pedidos/${idPedido}/estado`, { estado: "listo" }, tokAdmin);
  assert.equal(actualizado.estado, 200);
  assert.equal(actualizado.datos.estado, "listo");

  assert.equal((await llamar("PUT", "/api/pedidos/99999/estado", { estado: "listo" }, tokAdmin)).estado, 404);
  assert.equal((await llamar("GET", "/api/pedidos/99999", null, tokAdmin)).estado, 404);
});
