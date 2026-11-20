// Pruebas de la misión del pedido manejada desde Telegram: el botón del aviso
// avanza el pedido una etapa, un botón viejo no se salta etapas, otro chat no
// puede mover nada, y los recordatorios respetan el horario y su tope.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const tg = require("../src/config/telegram");
const { atenderBoton, enviarRecordatorios, TelegramController } = require("../src/controllers/telegramController");

// Telegram de mentira: guarda cada llamada y responde que todo salió bien.
function telegramFalso() {
  const llamadas = [];
  return {
    llamadas,
    dep: { ...tg, llamarTelegram: async (metodo, cuerpo) => { llamadas.push({ metodo, cuerpo }); return { ok: true }; } },
  };
}

// Base de mentira con un pedido en el estado que se le diga.
function baseFalsa(estado) {
  const cambios = [];
  const seguidos = [];
  return {
    cambios, seguidos,
    Pedido: {
      buscarPorId: async (id) => (id === 12 ? { id: 12, estado } : null),
      actualizarEstado: async (id, nuevo) => { cambios.push([id, nuevo]); estado = nuevo; return true; },
    },
    Seguimiento: { registrarCambio: async (id, e) => { seguidos.push([id, e]); } },
  };
}

const consulta = (data, chat = 999) => ({
  id: "cb1",
  data,
  message: { chat: { id: chat }, message_id: 55, text: "🍪 Pixelito: ¡nuevo pedido #12! — $ 6.000" },
});

test("Botones: el aviso de pedido nuevo trae el botón para tomarlo", async () => {
  let cuerpo;
  await tg.notificarPedido({ id: 12, total: 6000, detalles: [] }, {
    token: "T", chatId: "999", fetchImpl: async (url, op) => { cuerpo = JSON.parse(op.body); return { ok: true }; },
  });
  assert.ok(cuerpo.text.startsWith("🍪 Pixelito"), "habla Pixelito");
  assert.deepEqual(cuerpo.reply_markup.inline_keyboard, [[{ text: "🔥 Tomar pedido: al horno", callback_data: "av:12:pendiente" }]]);
});

test("Botones: cada etapa tiene el suyo y al entregar ya no queda ninguno", () => {
  assert.equal(tg.botonesPedido(12, "en_preparacion").inline_keyboard[0][0].text, "🎁 Ya está listo");
  assert.equal(tg.botonesPedido(12, "listo").inline_keyboard[0][0].text, "🏆 Ya se entregó");
  assert.deepEqual(tg.botonesPedido(12, "entregado").inline_keyboard, []);
  assert.deepEqual(tg.botonesPedido(12, "cancelado").inline_keyboard, [], "cancelar se hace en el panel");
  assert.equal(tg.leerBoton("av:12:entregado"), null, "de entregado no se avanza");
  assert.equal(tg.leerBoton("av:12:pendiente; DROP"), null);
});

test("Botones: tocar 'al horno' pasa el pedido a En preparación y el botón cambia", async () => {
  const base = baseFalsa("pendiente");
  const { llamadas, dep } = telegramFalso();
  const r = await atenderBoton(consulta("av:12:pendiente"), { ...base, telegram: dep, chatId: "999" });
  assert.equal(r.resultado, "avanzó");
  assert.deepEqual(base.cambios, [[12, "en_preparacion"]]);
  assert.deepEqual(base.seguidos, [[12, "en_preparacion"]], "el reloj de recordatorios vuelve a cero");
  const editado = llamadas.find((l) => l.metodo === "editMessageText").cuerpo;
  assert.ok(editado.text.endsWith("🎮 Estado: 🔥 En el horno"));
  assert.equal(editado.reply_markup.inline_keyboard[0][0].callback_data, "av:12:en_preparacion");
  assert.ok(llamadas.some((l) => l.metodo === "answerCallbackQuery" && l.cuerpo.text.includes("En el horno")));
});

test("Botones: un botón viejo (doble toque) no se salta etapas", async () => {
  const base = baseFalsa("en_preparacion");
  const { llamadas, dep } = telegramFalso();
  const r = await atenderBoton(consulta("av:12:pendiente"), { ...base, telegram: dep, chatId: "999" });
  assert.equal(r.resultado, "ya estaba");
  assert.deepEqual(base.cambios, [], "no se mueve nada");
  const editado = llamadas.find((l) => l.metodo === "editMessageText").cuerpo;
  assert.equal(editado.reply_markup.inline_keyboard[0][0].callback_data, "av:12:en_preparacion", "el botón se pone al día");
});

test("Botones: desde otro chat no se mueve ningún pedido", async () => {
  const base = baseFalsa("pendiente");
  const { dep } = telegramFalso();
  const r = await atenderBoton(consulta("av:12:pendiente", 123), { ...base, telegram: dep, chatId: "999" });
  assert.equal(r.resultado, "chat no permitido");
  assert.deepEqual(base.cambios, []);
});

test("Webhook: sin la clave de Telegram la ruta no existe", async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "clave-de-prueba-larga-123456";
  const res = { codigo: 200, status(c) { this.codigo = c; return this; }, json(d) { this.datos = d; return this; } };
  await TelegramController.webhook({ headers: { "x-telegram-bot-api-secret-token": "otra" }, body: {} }, res);
  assert.equal(res.codigo, 404);
  await TelegramController.webhook({ headers: { "x-telegram-bot-api-secret-token": "clave-de-prueba-larga-123456" }, body: {} }, res);
  assert.deepEqual(res.datos, { ok: true }, "con la clave responde ok (aunque no haya botón)");
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

test("Recordatorios: Pixelito escribe por cada pedido quieto, con su botón", async () => {
  const marcados = [];
  const { llamadas, dep } = telegramFalso();
  const r = await enviarRecordatorios({
    telegram: dep, chatId: "999", ahora: new Date("2026-11-19T15:00:00Z"), // 10:00 en Colombia
    Seguimiento: {
      pendientesDeRecordar: async ({ horas }) => {
        assert.equal(horas, 2);
        return [{ id: 12, cliente_nombre: "Ana", galletas: 3, estado: "pendiente", minutos: 130 }];
      },
      marcarRecordado: async (id) => marcados.push(id),
    },
    config: { horas: 2 },
  });
  assert.equal(r.enviados, 1);
  assert.deepEqual(marcados, [12]);
  const msg = llamadas[0].cuerpo;
  assert.ok(msg.text.includes("#12") && msg.text.includes("2 horas") && msg.text.includes("¿Ya lo empezaste?"));
  assert.equal(msg.reply_markup.inline_keyboard[0][0].callback_data, "av:12:pendiente");
});

test("Recordatorios: de noche Pixelito no escribe", async () => {
  const r = await enviarRecordatorios({
    telegram: telegramFalso().dep, chatId: "999", ahora: new Date("2026-11-19T07:00:00Z"), // 2:00 en Colombia
    Seguimiento: { pendientesDeRecordar: async () => { throw new Error("no debería consultar"); } },
  });
  assert.deepEqual(r, { enviados: 0, motivo: "fuera de horario" });
});

test("Recordatorios: la ruta exige CRON_SECRET", async () => {
  delete process.env.CRON_SECRET;
  const res = { codigo: 200, status(c) { this.codigo = c; return this; }, json(d) { this.datos = d; return this; } };
  await TelegramController.recordatorios({ headers: { authorization: "Bearer x" } }, res);
  assert.equal(res.codigo, 404);
});
