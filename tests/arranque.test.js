// Pruebas de la entrada de Vercel: con JWT_SECRET mal puesto rechaza con un
// mensaje claro, sin tumbar el proceso; con la clave bien, entrega la app.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { instalarDbFalsa } = require("./helpers/dbFalsa");
const { problemaDeJwtSecret } = require("../src/config/jwtSecreto");

instalarDbFalsa();

// api/index.js carga dotenv: se sustituye para que la prueba no lea el .env del proyecto.
const rutaDotenv = require.resolve("dotenv");
require.cache[rutaDotenv] = { id: rutaDotenv, filename: rutaDotenv, loaded: true, exports: { config() { return {}; } } };

const rutaEntrada = require.resolve("../api/index.js");
const CLAVE_LARGA = "x".repeat(32);
const original = { JWT_SECRET: process.env.JWT_SECRET, NODE_ENV: process.env.NODE_ENV };
const errorOriginal = console.error;
let registros;

function cargarEntrada({ secreto, entorno }) {
  process.env.JWT_SECRET = secreto;
  process.env.NODE_ENV = entorno;
  delete require.cache[rutaEntrada];
  return require("../api/index.js");
}

function llamarFuncion(funcion) {
  const res = {
    statusCode: 200, cabeceras: {}, cuerpo: "",
    setHeader(nombre, valor) { this.cabeceras[nombre.toLowerCase()] = valor; },
    end(texto) { this.cuerpo = texto; },
  };
  funcion({}, res);
  return res;
}

beforeEach(() => {
  registros = [];
  console.error = (...partes) => registros.push(partes.join(" "));
});
afterEach(() => {
  console.error = errorOriginal;
  for (const [clave, valor] of Object.entries(original)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

test("Vercel: sin JWT_SECRET responde 503 con código claro y deja el motivo en el log", () => {
  const res = llamarFuncion(cargarEntrada({ secreto: "", entorno: "production" }));
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(res.cuerpo).codigo, "JWT_SECRET_INVALIDO");
  assert.match(res.cabeceras["content-type"], /application\/json/);
  assert.match(registros.join(), /Falta JWT_SECRET/);
});

test("Vercel: una clave corta en producción también se rechaza, y no se revela en la respuesta", () => {
  const corta = "clave-corta-de-prueba";
  const res = llamarFuncion(cargarEntrada({ secreto: corta, entorno: "production" }));
  assert.equal(res.statusCode, 503);
  assert.ok(!res.cuerpo.includes(corta));
  assert.ok(!registros.join().includes(corta));
  assert.match(registros.join(), /al menos 32 caracteres/);
});

test("Vercel: con una clave válida entrega la app de Express", () => {
  const entrada = cargarEntrada({ secreto: CLAVE_LARGA, entorno: "production" });
  assert.equal(entrada, require("../src/app"));
  assert.deepEqual(registros, []);
});

test("JWT_SECRET: fuera de producción basta con que exista", () => {
  assert.equal(problemaDeJwtSecret({ JWT_SECRET: "corta", NODE_ENV: "test" }), null);
  assert.match(problemaDeJwtSecret({ NODE_ENV: "test" }), /Falta JWT_SECRET/);
  assert.equal(problemaDeJwtSecret({ JWT_SECRET: CLAVE_LARGA, NODE_ENV: "production" }), null);
});
