// Pruebas de la lógica de pedidos del frontend: carrito, servicio, mensaje de WhatsApp y contacto.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const memoria = {};
globalThis.localStorage = {
  setItem: (k, v) => (memoria[k] = v),
  getItem: (k) => memoria[k] ?? null,
  removeItem: (k) => delete memoria[k],
};
globalThis.Event = class { constructor(tipo) { this.type = tipo; } };
globalThis.window = { dispatchEvent() {}, addEventListener() {} };

let llamadas = [], respuesta;
globalThis.fetch = async (url, opc) => {
  llamadas.push({ url, metodo: opc.method, cabeceras: opc.headers, cuerpo: opc.body });
  if (respuesta instanceof Error) throw respuesta;
  return { ok: respuesta.ok, status: respuesta.status, json: async () => respuesta.cuerpo };
};
const ok = (cuerpo) => ({ ok: true, status: 200, cuerpo });

const cargar = async () => ({
  ...(await import("../public/js/api.js")),
  ...(await import("../public/js/config.js")),
  ...(await import("../public/js/pedidos.js")),
  ...(await import("../public/js/contacto.js")),
});

beforeEach(() => { llamadas = []; respuesta = ok({}); delete memoria["pixel_galletas_carrito"]; });

test("Carrito: agrupa por producto, calcula total y persiste en el navegador", async () => {
  const { Carrito } = await cargar();
  const c = new Carrito();
  const galleta = { id: 7, nombre: "Pixel Monster", precio: 6000 };

  c.agregar(galleta);
  c.agregar(galleta);
  c.agregar({ id: 8, nombre: "Pixel Klim", precio: 6000 });
  assert.equal(c.cantidadTotal, 3);
  assert.equal(c.total, 18000);

  c.cambiarCantidad(7, 5);
  assert.equal(c.total, 6 * 6000);

  // Recuperado desde localStorage (misma página, nueva instancia).
  const deNuevo = new Carrito();
  assert.equal(deNuevo.cantidadTotal, 6);
  assert.deepEqual(deNuevo.paraApi(), [{ producto_id: 7, cantidad: 5 }, { producto_id: 8, cantidad: 1 }]);

  deNuevo.quitar(7);
  assert.equal(deNuevo.total, 6000);
  deNuevo.vaciar();
  assert.equal(deNuevo.total, 0);
  assert.equal(new Carrito().cantidadTotal, 0);
});

test("Carrito: la cantidad nunca baja de 1 ni pasa de 100", async () => {
  const { Carrito } = await cargar();
  const c = new Carrito();
  c.agregar({ id: 1, nombre: "A", precio: 6000 });
  c.cambiarCantidad(1, -5); // baja de 1 => se retira del carrito
  assert.equal(c.items.length, 0);
  c.agregar({ id: 1, nombre: "A", precio: 6000 });
  c.cambiarCantidad(1, 500);
  assert.equal(c.items[0].cantidad, 100);
});

test("PedidoServicio: usa método y ruta correctos", async () => {
  const { PedidoServicio, ApiClient } = await cargar();
  const s = new PedidoServicio(new ApiClient());
  respuesta = ok({ id: 1 });
  await s.crear({ cliente_nombre: "Ana" });
  await s.listar();
  await s.cambiarEstado(3, "listo");
  assert.deepEqual(
    llamadas.map((l) => `${l.metodo} ${l.url}`),
    ["POST /api/pedidos", "GET /api/pedidos", "PUT /api/pedidos/3/estado"]
  );
  assert.equal(llamadas[2].cuerpo, JSON.stringify({ estado: "listo" }));
});

test("textoPedido: arma el mensaje de WhatsApp con productos, total y datos", async () => {
  const { Pedido, textoPedido, pesos, urlWhatsApp } = await cargar();
  const pedido = new Pedido({
    id: 42,
    cliente_nombre: "Ana",
    cliente_telefono: "3001112233",
    direccion: "Ceiba 2",
    notas: "Sin nueces",
    total: "18000.00",
    estado: "pendiente",
    creado_en: new Date().toISOString(),
    detalles: [
      { nombre_sabor: "Pixel Monster", precio_unitario: "6000.00", cantidad: 2 },
      { nombre_sabor: "Pixel Klim", precio_unitario: "6000.00", cantidad: 1 },
    ],
  });
  const texto = textoPedido(pedido);
  assert.ok(texto.includes("#42"));
  assert.ok(texto.includes("2 × Pixel Monster"));
  assert.ok(texto.includes("1 × Pixel Klim"));
  assert.ok(texto.includes(pesos(18000)));
  assert.ok(texto.includes("Ceiba 2"));
  assert.ok(texto.includes("Sin nueces"));
  assert.equal(pedido.estadoTexto, "Pendiente");

  const enlace = urlWhatsApp(texto);
  assert.ok(enlace.startsWith("https://wa.me/573137839935?text="));
  assert.ok(enlace.includes(encodeURIComponent(texto)));
});

test("Contacto: enlaza WhatsApp, Instagram y ubicación del DYME", async () => {
  const { enlazarContacto, CONTACTO } = await cargar();
  const elementos = {};
  const doc = { getElementById: (id) => (elementos[id] ??= { id, href: "", textContent: "" }) };
  enlazarContacto(doc);
  assert.ok(elementos["link-whatsapp"].href.startsWith(`https://wa.me/${CONTACTO.whatsapp}?text=`));
  assert.ok(elementos["link-whatsapp-fijo"].href.includes("wa.me"));
  assert.equal(elementos["link-instagram"].href, CONTACTO.instagramUrl);
  assert.equal(elementos["link-instagram"].textContent, "@pixel_galletas");
  assert.ok(elementos["link-ubicacion"].href.includes("maps"));
  assert.ok(elementos["link-ubicacion"].textContent.includes("Ceiba 2"));
});
