// Pruebas de los límites de tasa con sus topes REALES: a diferencia del resto de
// las pruebas de la API, aquí no se suben a 100000, porque lo que se comprueba
// es justamente a qué rutas se aplica cada límite.
process.env.JWT_SECRET = "clave-solo-para-pruebas-limites-1234567890";
for (const clave of ["LIMITE_API_MAX", "LIMITE_LOGIN_MAX", "LIMITE_REGISTRO_MAX", "LIMITE_PEDIDOS_MAX", "LIMITE_ESTADO_MAX"]) {
  delete process.env[clave];
}

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { instalarDbFalsa } = require("./helpers/dbFalsa");
instalarDbFalsa();
const app = require("../src/app");

const TOPE_PEDIDOS = 20;
let servidor, base;

async function llamar(metodo, ruta, cuerpo) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  await r.text();
  return r.status;
}

before(() => {
  servidor = app.listen(0);
  base = "http://127.0.0.1:" + servidor.address().port;
});
after(() => servidor.close());

// El orden importa: las pruebas comparten los contadores del servidor.
test("Límites: leer las tarifas no gasta el cupo de pedidos", async () => {
  for (let i = 1; i <= TOPE_PEDIDOS + 1; i++) {
    assert.equal(await llamar("GET", "/api/pedidos/tarifas-distancia"), 200, `lectura ${i}`);
  }
});

test("Límites: crear pedidos se corta al pasar el tope", async () => {
  for (let i = 1; i <= TOPE_PEDIDOS; i++) {
    assert.equal(await llamar("POST", "/api/pedidos", {}), 400, `pedido ${i}`);
  }
  assert.equal(await llamar("POST", "/api/pedidos", {}), 429);
});

test("Límites: agotar el cupo de pedidos no bloquea la consulta de estado", async () => {
  assert.equal(await llamar("POST", "/api/pedidos/estado", {}), 400);
});
