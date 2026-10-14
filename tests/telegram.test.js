// Pruebas del aviso de pedido nuevo al obrador por Telegram.
// Lo importante no es solo que el mensaje salga bien: es que un fallo de
// Telegram (caído, mal configurado, sin red) no pueda tumbar el pedido del
// cliente, que ya está guardado en MySQL cuando se envía el aviso.
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.TELEGRAM_CHAT_ID = "";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { notificarPedido, textoPedido } = require("../src/config/telegram");

const pedido = {
  id: 12,
  clienteNombre: "Ana Pérez",
  clienteTelefono: "3001112233",
  direccion: "Ceiba 2",
  notas: "Sin nueces",
  total: 259200,
  descuento: 28800,
  detalles: [{ nombre: "Pixel Monster", precio: 6000, cantidad: 48 }],
};

test("Telegram: sin llaves configuradas no se envía nada y no falla", async () => {
  const resultado = await notificarPedido(pedido, {
    token: "",
    chatId: "",
    fetchImpl: () => { throw new Error("no debería llamarse a Telegram"); },
  });
  assert.deepEqual(resultado, { enviado: false, motivo: "sin configurar" });
});

test("Telegram: con llaves, el aviso llega al chat del obrador con el pedido completo", async () => {
  const llamadas = [];
  const fetchFalso = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return { ok: true, status: 200 };
  };
  const resultado = await notificarPedido(pedido, { token: "TOKEN123", chatId: "999", fetchImpl: fetchFalso });

  assert.equal(resultado.enviado, true);
  assert.equal(llamadas.length, 1);
  assert.ok(llamadas[0].url.endsWith("/botTOKEN123/sendMessage"), "usa el bot configurado");
  const cuerpo = JSON.parse(llamadas[0].opciones.body);
  assert.equal(cuerpo.chat_id, "999");
  assert.ok(cuerpo.text.includes("#12"));
  assert.ok(cuerpo.text.includes("Ana Pérez"));
  assert.ok(cuerpo.text.includes("3001112233"));
  assert.ok(cuerpo.text.includes("Pixel Monster"));
  assert.equal(cuerpo.parse_mode, undefined, "sin Markdown: un asterisco del cliente no puede romper el aviso");
});

test("Telegram: si Telegram responde con error, el pedido no se cae", async () => {
  const resultado = await notificarPedido(pedido, {
    token: "T", chatId: "1", fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  assert.equal(resultado.enviado, false);
  assert.equal(resultado.motivo, "telegram 401");
});

test("Telegram: si la red falla, el pedido no se cae", async () => {
  const resultado = await notificarPedido(pedido, {
    token: "T", chatId: "1", fetchImpl: async () => { throw new Error("red caída"); },
  });
  assert.deepEqual(resultado, { enviado: false, motivo: "error de red" });
});

test("Telegram: el texto resume el pedido, con subtotal y descuento cuando los hay", () => {
  const texto = textoPedido(pedido);
  assert.ok(texto.includes("48 galletas en total"));
  assert.ok(texto.includes("Notas: Sin nueces"));
  assert.ok(texto.includes("Pixel Monster"));
  assert.ok(texto.includes("Descuento por volumen"));
  assert.ok(texto.includes("259.200"), "el total va en pesos colombianos");
  // Un pedido pequeño no habla de descuentos.
  const pequeño = textoPedido({
    ...pedido, id: 13, total: 6000, descuento: 0,
    detalles: [{ nombre: "Pixel Monster", precio: 6000, cantidad: 1 }],
  });
  assert.ok(!pequeño.includes("Descuento"));
  assert.ok(pequeño.includes("1 galleta en total"));
});
