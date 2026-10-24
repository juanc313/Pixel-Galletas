// Pruebas de seguridad de la API: validación de tipos, secreto del cron y cabeceras.
process.env.JWT_SECRET = "clave-solo-para-pruebas-seguridad-1234567890";
process.env.CRON_SECRET = "secreto-cron-de-prueba-1234567890";
for (const clave of ["LIMITE_API_MAX", "LIMITE_LOGIN_MAX", "LIMITE_REGISTRO_MAX", "LIMITE_PEDIDOS_MAX", "LIMITE_ESTADO_MAX"]) {
  process.env[clave] = "100000";
}

const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { instalarDbFalsa } = require("./helpers/dbFalsa");
const db = instalarDbFalsa();
const app = require("../src/app");

let servidor, base, tokAdmin;

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
  db.agregarUsuario("Admin", "admin-seg@x.com", await bcrypt.hash("adminpass", 10), "admin");
  tokAdmin = (await llamar("POST", "/api/usuarios/login", { correo: "admin-seg@x.com", contrasena: "adminpass" })).datos.token;
});
after(() => servidor.close());

test("Login: rechaza correo o contraseña que no son texto (400)", async () => {
  const objeto = await llamar("POST", "/api/usuarios/login", { correo: { $ne: null }, contrasena: "x" });
  assert.equal(objeto.estado, 400);
  const numero = await llamar("POST", "/api/usuarios/login", { correo: "admin-seg@x.com", contrasena: 12345678 });
  assert.equal(numero.estado, 400);
});

test("Registro: rechaza campos que no son texto y contraseñas fuera de 8-72 caracteres", async () => {
  const nombreObjeto = await llamar("POST", "/api/usuarios/registro", { nombre: { a: 1 }, correo: "o@x.com", contrasena: "secreto123" });
  assert.equal(nombreObjeto.estado, 400);
  const corta = await llamar("POST", "/api/usuarios/registro", { nombre: "B", correo: "b-seg@x.com", contrasena: "1234567" });
  assert.equal(corta.estado, 400);
  const larga = await llamar("POST", "/api/usuarios/registro", { nombre: "B", correo: "b-seg@x.com", contrasena: "a".repeat(73) });
  assert.equal(larga.estado, 400);
});

test("Usuarios: actualizar rechaza nombre o correo que no son texto (400)", async () => {
  const { datos } = await llamar("GET", "/api/usuarios", null, conToken(tokAdmin));
  const id = datos[0].id;
  const r = await llamar("PUT", `/api/usuarios/${id}`, { correo: { $ne: null } }, conToken(tokAdmin));
  assert.equal(r.estado, 400);
});

test("Productos: rechaza precios inválidos al crear (negativo, cero, texto, objeto)", async () => {
  for (const precio_venta of [-5, 0, "abc", "", { x: 1 }, undefined]) {
    const r = await llamar("POST", "/api/productos", { nombre_sabor: "Test", precio_venta }, conToken(tokAdmin));
    assert.equal(r.estado, 400, `precio ${JSON.stringify(precio_venta)} debería rechazarse`);
  }
});

test("Productos: rechaza precios inválidos y nombre no textual al editar", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Editable", precio_venta: 5000 }, conToken(tokAdmin));
  assert.equal(creado.estado, 201);
  const ruta = `/api/productos/${creado.datos.id}`;
  const precio = await llamar("PUT", ruta, { precio_venta: -1 }, conToken(tokAdmin));
  assert.equal(precio.estado, 400);
  const nombre = await llamar("PUT", ruta, { nombre_sabor: { x: 1 } }, conToken(tokAdmin));
  assert.equal(nombre.estado, 400);
});

test("Cron de purga: sin el secreto exacto responde 404", async () => {
  assert.equal((await llamar("GET", "/api/eventos/cron/purgar")).estado, 404);
  assert.equal((await llamar("GET", "/api/eventos/cron/purgar", null, { Authorization: "Bearer mal" })).estado, 404);
  assert.equal((await llamar("GET", "/api/eventos/cron/purgar", null, { Authorization: "Bearer " + process.env.CRON_SECRET + "x" })).estado, 404);
});

test("Pedidos: rechaza nombre, teléfono, notas o entrega que no son texto (400)", async () => {
  const base = { cliente_telefono: "3001234567", items: [{ producto_id: 1, cantidad: 1 }] };
  const nombre = await llamar("POST", "/api/pedidos", { ...base, cliente_nombre: { x: 1 } });
  assert.equal(nombre.estado, 400);
  const notas = await llamar("POST", "/api/pedidos", { ...base, cliente_nombre: "Ana", notas: ["a"] });
  assert.equal(notas.estado, 400);
  const entrega = await llamar("POST", "/api/pedidos", { ...base, cliente_nombre: "Ana", entrega: ["recoger"] });
  assert.equal(entrega.estado, 400);
});

test("Tokens: una firma con otro algoritmo o con otra clave se rechaza (401)", async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const payload = b64({ id: 1, rol: "admin", exp: Math.floor(Date.now() / 1000) + 3600 });
  const sinFirma = `${b64({ alg: "none", typ: "JWT" })}.${payload}.`;
  const otraClave = require("jsonwebtoken").sign({ id: 1, rol: "admin" }, "otra-clave-distinta-0123456789abcdef");
  for (const token of [sinFirma, otraClave]) {
    const r = await llamar("GET", "/api/usuarios", null, conToken(token));
    assert.equal(r.estado, 401);
  }
});

test("Login: correo inexistente y contraseña mal dan la misma respuesta (401)", async () => {
  const noExiste = await llamar("POST", "/api/usuarios/login", { correo: "nadie-seg@x.com", contrasena: "cualquiera1" });
  const malClave = await llamar("POST", "/api/usuarios/login", { correo: "admin-seg@x.com", contrasena: "mal-clave-123" });
  assert.equal(noExiste.estado, 401);
  assert.equal(malClave.estado, 401);
  assert.equal(noExiste.datos.error, malClave.datos.error);
});

test("Cabeceras: HSTS, COOP y X-Frame-Options en vercel.json", async () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  const cabeceras = vercel.headers.flatMap((h) => h.headers);
  const valor = (clave) => cabeceras.find((h) => h.key === clave)?.value;
  assert.match(valor("Strict-Transport-Security") || "", /max-age=\d{6,}/);
  assert.equal(valor("Cross-Origin-Opener-Policy"), "same-origin");
  assert.equal(valor("X-Frame-Options"), "DENY");
});

test("Cabeceras: Permissions-Policy desactiva cámara, micrófono, ubicación y pagos", async () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  const cabeceras = vercel.headers.flatMap((h) => h.headers);
  const politica = cabeceras.find((h) => h.key === "Permissions-Policy");
  assert.ok(politica, "vercel.json debe declarar Permissions-Policy");
  for (const permiso of ["camera=()", "microphone=()", "geolocation=()", "payment=()"]) {
    assert.ok(politica.value.includes(permiso), `falta ${permiso}`);
  }
});
