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

test("Pixel Radio: playlist, controles y silencio persistente", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");
  const espera = () => new Promise((resolver) => setImmediate(resolver));
  const crearElemento = () => ({
    eventos: {}, atributos: {}, dataset: {}, textContent: "", hidden: false,
    addEventListener(tipo, fn) { this.eventos[tipo] = fn; },
    setAttribute(nombre, valor) { this.atributos[nombre] = valor; },
    removeAttribute(nombre) { delete this.atributos[nombre]; },
    focus() {}, isConnected: true,
  });
  const botones = [crearElemento(), crearElemento()];
  const canciones = ["Still Life", "Lofi Hip Hop Loop", "Lucid"].map((titulo, i) => {
    const el = crearElemento();
    el.dataset = { pista: ["/audio/still-life.mp3", "/audio/lofi-hip-hop-loop.ogg", "/audio/lucid.mp3"][i], artista: "Artista" };
    el.querySelector = () => ({ textContent: titulo });
    return el;
  });
  const ids = ["musica-audio", "musica-panel", "musica-volumen", "musica-progreso", "musica-estado", "musica-titulo", "musica-artista", "musica-tiempo", "musica-duracion", "musica-reproducir", "musica-cerrar", "musica-anterior", "musica-retroceder", "musica-adelantar", "musica-siguiente"];
  const elementos = Object.fromEntries(ids.map((id) => [`#${id}`, crearElemento()]));
  const audio = elementos["#musica-audio"];
  audio.duration = 120; audio.currentTime = 30; audio.canPlayType = () => "";
  audio.play = () => { audio.eventos.playing(); return Promise.resolve(); };
  audio.pause = () => audio.eventos.pause();
  elementos["#musica-panel"].hidden = true;
  elementos["#musica-volumen"].value = "0.3";
  const eventosDocumento = {}, eventosVentana = {}, memoriaRadio = {};
  const document = {
    querySelector: (selector) => elementos[selector] || null,
    querySelectorAll: (selector) => selector === ".musica-boton" ? botones : canciones,
    addEventListener: (tipo, fn) => { eventosDocumento[tipo] = fn; },
  };
  const window = { addEventListener: (tipo, fn) => { eventosVentana[tipo] = fn; } };
  const localStorage = { getItem: (clave) => memoriaRadio[clave] ?? null, setItem: (clave, valor) => { memoriaRadio[clave] = valor; } };
  const memoriaSesion = {};
  const sessionStorage = { getItem: (clave) => memoriaSesion[clave] ?? null, setItem: (clave, valor) => { memoriaSesion[clave] = valor; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "public", "js", "musica.js"), "utf8"), { document, window, localStorage, sessionStorage, setTimeout, setInterval: () => 0 });

  // El clic llega al documento (delegado): así funcionan los ♫ tras navegar sin recargar.
  eventosDocumento.click({ target: { closest: (selector) => (selector === ".musica-boton" ? botones[0] : null) } });
  assert.equal(elementos["#musica-panel"].hidden, false);
  assert.equal(botones[1].atributos["aria-expanded"], "true");
  elementos["#musica-reproducir"].eventos.click();
  await espera();
  assert.equal(botones[0].dataset.sonando, "true");
  elementos["#musica-adelantar"].eventos.click();
  assert.equal(audio.currentTime, 40);
  elementos["#musica-retroceder"].eventos.click();
  assert.equal(audio.currentTime, 30);
  audio.currentTime = 115;
  elementos["#musica-adelantar"].eventos.click();
  assert.equal(audio.currentTime, 120);
  audio.eventos.loadedmetadata();
  assert.equal(elementos["#musica-duracion"].textContent, "2:00");
  elementos["#musica-progreso"].value = "15";
  elementos["#musica-progreso"].eventos.input();
  assert.equal(audio.currentTime, 15);
  elementos["#musica-volumen"].value = "0.5";
  elementos["#musica-volumen"].eventos.input();
  assert.equal(audio.volume, 0.5);
  canciones[1].eventos.click();
  await espera();
  assert.equal(audio.src, "/audio/lofi-hip-hop-loop.mp3");
  assert.equal(elementos["#musica-titulo"].textContent, "Lofi Hip Hop Loop");
  assert.equal(canciones[1].atributos["aria-current"], "true");
  audio.eventos.ended();
  await espera();
  assert.equal(elementos["#musica-titulo"].textContent, "Lucid");
  elementos["#musica-reproducir"].eventos.click();
  assert.equal(memoriaRadio.pixel_galletas_musica_apagada, "1");
  assert.equal(botones[0].dataset.sonando, "false");
  elementos["#musica-siguiente"].eventos.click();
  assert.equal(botones[0].dataset.sonando, "false", "cambiar de pista en pausa no debe activar música");
  elementos["#musica-cerrar"].eventos.click();
  assert.equal(elementos["#musica-panel"].hidden, true);
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
