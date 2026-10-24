// Pruebas de la API del carrito guardado en la cuenta.
process.env.JWT_SECRET = "clave-solo-para-pruebas-carrito-1234567890";
process.env.CRON_SECRET = "secreto-cron-de-prueba-carrito-1234567890";
for (const clave of ["LIMITE_API_MAX", "LIMITE_LOGIN_MAX", "LIMITE_REGISTRO_MAX", "LIMITE_PEDIDOS_MAX", "LIMITE_ESTADO_MAX"]) {
  process.env[clave] = "100000";
}

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { instalarDbFalsa } = require("./helpers/dbFalsa");
const db = instalarDbFalsa();
const app = require("../src/app");

let servidor, base, tokA, tokB, idGalleta, idAgotada, idLimitada;

async function llamar(metodo, ruta, cuerpo, cabeceras = {}) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...cabeceras },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: r.status, cabeceras: r.headers, datos: await r.json().catch(() => null) };
}
const conToken = (token) => ({ Authorization: "Bearer " + token });

before(async () => {
  servidor = app.listen(0);
  base = "http://127.0.0.1:" + servidor.address().port;
  db.agregarUsuario("Admin", "admin-carrito@x.com", await bcrypt.hash("adminpass", 10), "admin");
  db.agregarUsuario("Ana", "ana-carrito@x.com", await bcrypt.hash("anapass123", 10), "cliente");
  db.agregarUsuario("Beto", "beto-carrito@x.com", await bcrypt.hash("betopass123", 10), "cliente");
  const tokAdmin = (await llamar("POST", "/api/usuarios/login", { correo: "admin-carrito@x.com", contrasena: "adminpass" })).datos.token;
  tokA = (await llamar("POST", "/api/usuarios/login", { correo: "ana-carrito@x.com", contrasena: "anapass123" })).datos.token;
  tokB = (await llamar("POST", "/api/usuarios/login", { correo: "beto-carrito@x.com", contrasena: "betopass123" })).datos.token;

  idGalleta = (await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Monster", precio_venta: 6000 }, conToken(tokAdmin))).datos.id;
  idAgotada = (await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Agotada", precio_venta: 6000, cantidad_disponible: 0 }, conToken(tokAdmin))).datos.id;
  idLimitada = (await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Limitada", precio_venta: 7000, cantidad_disponible: 3 }, conToken(tokAdmin))).datos.id;
});
after(() => servidor.close());

test("Carrito: sin sesión responde 401 en GET y PUT", async () => {
  assert.equal((await llamar("GET", "/api/carrito")).estado, 401);
  assert.equal((await llamar("PUT", "/api/carrito", { items: [] })).estado, 401);
});

test("Carrito: la respuesta no se guarda en caché", async () => {
  const r = await llamar("GET", "/api/carrito", null, conToken(tokA));
  assert.equal(r.estado, 200);
  assert.match(r.cabeceras.get("cache-control"), /no-store/);
});

test("Carrito: guarda y devuelve las líneas con precio y nombre del catálogo", async () => {
  const put = await llamar("PUT", "/api/carrito", { items: [{ producto_id: idGalleta, cantidad: 2 }] }, conToken(tokA));
  assert.equal(put.estado, 200);
  assert.equal(put.datos.length, 1);
  assert.equal(put.datos[0].producto_id, idGalleta);
  assert.equal(put.datos[0].nombre_sabor, "Pixel Monster");
  assert.equal(Number(put.datos[0].precio_venta), 6000);
  assert.equal(put.datos[0].cantidad, 2);
});

test("Carrito: cada cuenta ve solo su carrito", async () => {
  const r = await llamar("GET", "/api/carrito", null, conToken(tokB));
  assert.equal(r.estado, 200);
  assert.deepEqual(r.datos, []);
});

test("Carrito: PUT reemplaza el carrito entero", async () => {
  const r = await llamar("PUT", "/api/carrito", { items: [{ producto_id: idLimitada, cantidad: 1 }] }, conToken(tokA));
  assert.equal(r.datos.length, 1);
  assert.equal(r.datos[0].producto_id, idLimitada);
});

test("Carrito: descarta sabores agotados y recorta al inventario disponible", async () => {
  const r = await llamar("PUT", "/api/carrito", {
    items: [
      { producto_id: idAgotada, cantidad: 1 },
      { producto_id: idLimitada, cantidad: 10 },
      { producto_id: 999999, cantidad: 1 },
    ],
  }, conToken(tokA));
  assert.equal(r.estado, 200);
  assert.deepEqual(r.datos.map((l) => [l.producto_id, l.cantidad]), [[idLimitada, 3]]);
});

test("Carrito: suma cantidades repetidas del mismo sabor", async () => {
  const r = await llamar("PUT", "/api/carrito", {
    items: [{ producto_id: idGalleta, cantidad: 1 }, { producto_id: idGalleta, cantidad: 2 }],
  }, conToken(tokA));
  assert.equal(r.datos[0].cantidad, 3);
});

test("Carrito: rechaza cuerpos inválidos (400)", async () => {
  const casos = [
    {},
    { items: "no es lista" },
    { items: [{ producto_id: "abc", cantidad: 1 }] },
    { items: [{ producto_id: idGalleta, cantidad: 0 }] },
    { items: [{ producto_id: idGalleta, cantidad: 1.5 }] },
    { items: [{ producto_id: { $ne: null }, cantidad: 1 }] },
    { items: Array.from({ length: 51 }, () => ({ producto_id: idGalleta, cantidad: 1 })) },
  ];
  for (const cuerpo of casos) {
    const r = await llamar("PUT", "/api/carrito", cuerpo, conToken(tokA));
    assert.equal(r.estado, 400, JSON.stringify(cuerpo).slice(0, 80));
  }
});
