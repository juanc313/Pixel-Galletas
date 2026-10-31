// Regresiones: (1) el INSERT de pedidos debe llevar las columnas entrega y envio,
// que la base de datos necesita; (2) una petición sin cuerpo no debe responder 500.
process.env.JWT_SECRET = "clave-solo-para-pruebas-regresion-1234567890abcdef";
for (const clave of ["LIMITE_API_MAX", "LIMITE_LOGIN_MAX", "LIMITE_REGISTRO_MAX", "LIMITE_PEDIDOS_MAX", "LIMITE_ESTADO_MAX"]) {
  process.env[clave] = "100000";
}

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { instalarDbFalsa } = require("./helpers/dbFalsa");
const db = instalarDbFalsa();
const app = require("../src/app");

let servidor, base;

before(async () => {
  servidor = app.listen(0);
  base = "http://127.0.0.1:" + servidor.address().port;
  db.agregarUsuario("Admin", "admin-reg@x.com", "x", "admin");
  await db.agregarProducto({ nombre_sabor: "Pixel Regresion", descripcion: "Prueba", precio_venta: 6000 });
});
after(() => servidor.close());

async function llamar(metodo, ruta, cuerpoCrudo) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: cuerpoCrudo === undefined ? {} : { "Content-Type": "application/json" },
    body: cuerpoCrudo,
  });
  return { estado: r.status, datos: await r.json().catch(() => null) };
}

test("Pedido a domicilio: guarda entrega y envío (columnas que la tabla pedidos necesita)", async () => {
  const r = await llamar(
    "POST",
    "/api/pedidos",
    JSON.stringify({
      cliente_nombre: "Regresion Entrega",
      cliente_telefono: "3001234567",
      entrega: "cucuta",
      direccion: "Calle 1 # 2-3",
      distancia: "0-3",
      items: [{ producto_id: 1, cantidad: 2 }],
    })
  );
  assert.equal(r.estado, 201, "el pedido debe crearse");
  assert.equal(r.datos.entrega, "cucuta");
  assert.equal(r.datos.envio, 7000, "envío = zona 5.000 + distancia 0-3 km 2.000");
});

test("Petición POST sin cuerpo: responde 400, no 500", async () => {
  const pedidos = await llamar("POST", "/api/pedidos");
  assert.equal(pedidos.estado, 400);
  const login = await llamar("POST", "/api/usuarios/login");
  assert.equal(login.estado, 400);
  const registro = await llamar("POST", "/api/usuarios/registro");
  assert.equal(registro.estado, 400);
});
