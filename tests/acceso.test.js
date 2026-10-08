// Pruebas de la pantalla de acceso con una página simulada (sin navegador).
const { test } = require("node:test");
const assert = require("node:assert/strict");

const memoria = {}, manejadores = {}, elementos = {};
globalThis.localStorage = { setItem: (k, v) => (memoria[k] = v), getItem: (k) => memoria[k] ?? null, removeItem: (k) => delete memoria[k] };
const el = (id) => (elementos[id] ??= { id, hidden: false, textContent: "", atributos: {}, classList: { toggle() {} },
  setAttribute(k, v) { this.atributos[k] = v; }, addEventListener(t, f) { (manejadores[id + ":" + t] ??= []).push(f); } });
globalThis.document = { getElementById: el };
globalThis.window = { addEventListener: (t, f) => (manejadores["ventana:" + t] ??= []).push(f), dispatchEvent: (e) => (manejadores["ventana:" + e.type] || []).forEach((f) => f(e)) };
globalThis.Event = class { constructor(tipo) { this.type = tipo; } };
globalThis.FormData = class { constructor(f) { this.f = f; } get(k) { return this.f.valores[k]; } };
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ token: "T", usuario: { nombre: "Juan", rol: "admin" } }) });
el("acceso").hidden = true;

test("Pantalla de acceso: abrir, entrar, cerrar sesión y sesión vencida", async () => {
  await import("../public/js/auth.js");
  const E = elementos;
  assert.equal(E.acceso.hidden, true);
  assert.equal(E["btn-acceso"].textContent, "Acceso");

  manejadores["btn-acceso:click"][0]();
  assert.equal(E.acceso.hidden, false);
  assert.equal(E["btn-acceso"].atributos["aria-expanded"], "true");

  await manejadores["form-login:submit"][0]({ preventDefault() {}, target: { valores: { correo: "a@x.com", contrasena: "clave" }, reset() {} } });
  assert.equal(E.acceso.hidden, true);
  assert.equal(E["btn-acceso"].textContent, "Juan");
  assert.equal(E["panel-rol"].textContent, "admin");
  assert.equal(E["vista-panel"].hidden, false);

  manejadores["btn-salir:click"][0]();
  assert.equal(E["btn-acceso"].textContent, "Acceso");
  assert.equal(E["vista-acceso"].hidden, false);

  window.dispatchEvent(new Event("sesion-vencida"));
  assert.equal(E.acceso.hidden, false);
  assert.ok(E.mensaje.textContent.includes("venció"));
});
