// La misión del pedido manejada desde Telegram:
//   * webhook: Telegram avisa aquí cada vez que el obrador toca un botón del
//     aviso de pedido ("🔥 Tomar pedido: al horno"…), y el pedido avanza.
//   * recordatorios: un reloj externo (GitHub Actions, cada 30 minutos) llama
//     aquí y Pixelito escribe por los pedidos que llevan rato sin moverse.
//
// Las dos funciones de trabajo (atenderBoton, enviarRecordatorios) reciben sus
// dependencias como parámetro para poder probarlas sin base ni Telegram.
const Pedido = require("../models/Pedido");
const Seguimiento = require("../models/Seguimiento");
const telegram = require("../config/telegram");
const { secretoIgual } = require("../util/secreto");

const DEPENDENCIAS = { Pedido, Seguimiento, telegram };

// Horas sin moverse antes de recordar (RECORDATORIO_HORAS, 2 por defecto) y
// horario en que Pixelito puede escribir, en hora de Colombia: de noche no.
function configRecordatorios() {
  const horas = Number(process.env.RECORDATORIO_HORAS);
  return {
    horas: Number.isFinite(horas) && horas >= 0.5 && horas <= 48 ? horas : 2,
    desde: 7,
    hasta: 21,
  };
}

function horaColombia(fecha = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(fecha));
}

// Un toque de botón. Devuelve lo que pasó (para los registros y las pruebas).
// Nunca lanza: Telegram reintenta lo que no responde 200 y un error repetido
// llenaría el chat de avisos.
async function atenderBoton(consulta, opciones = {}) {
  const { Pedido: modelo, Seguimiento: seguimiento, telegram: tg } = { ...DEPENDENCIAS, ...opciones };
  const chatPermitido = String(opciones.chatId ?? process.env.TELEGRAM_CHAT_ID ?? "");
  const responder = (texto) => tg.llamarTelegram("answerCallbackQuery", { callback_query_id: consulta.id, text: texto });

  const chat = String(consulta?.message?.chat?.id ?? "");
  if (!chatPermitido || chat !== chatPermitido) {
    await responder("Este botón no es de este chat.");
    return { resultado: "chat no permitido" };
  }
  const boton = tg.leerBoton(consulta.data);
  if (!boton) {
    await responder("Ese botón ya no sirve.");
    return { resultado: "botón desconocido" };
  }

  const pedido = await modelo.buscarPorId(boton.id);
  if (!pedido) {
    await responder(`No encontré el pedido #${boton.id}.`);
    return { resultado: "pedido no existe" };
  }

  let estado = pedido.estado;
  let aviso;
  if (estado === boton.desde) {
    // El caso normal: el pedido sigue donde decía el botón, avanza una etapa.
    estado = tg.SIGUIENTE[boton.desde];
    await modelo.actualizarEstado(boton.id, estado);
    try { await seguimiento.registrarCambio(boton.id, estado); }
    catch (error) { console.warn("[seguimiento] no se registró el cambio:", error.message); }
    aviso = `✅ Pedido #${boton.id}: ${tg.ETAPAS[estado]}`;
  } else {
    // Botón viejo: el pedido ya se movió. No se salta etapas, solo se pone al día.
    aviso = `El pedido #${boton.id} ya estaba en «${tg.ETAPAS[estado] || estado}».`;
  }

  await responder(aviso);
  await tg.llamarTelegram("editMessageText", {
    chat_id: consulta.message.chat.id,
    message_id: consulta.message.message_id,
    text: tg.textoConEstado(consulta.message.text, estado),
    disable_web_page_preview: true,
    reply_markup: tg.botonesPedido(boton.id, estado),
  });
  return { resultado: estado === pedido.estado ? "ya estaba" : "avanzó", estado };
}

// Una vuelta del reloj: un mensaje por cada pedido quieto, con su botón.
async function enviarRecordatorios(opciones = {}) {
  const { Seguimiento: seguimiento, telegram: tg } = { ...DEPENDENCIAS, ...opciones };
  const { horas, desde, hasta } = { ...configRecordatorios(), ...opciones.config };
  const chatId = opciones.chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return { enviados: 0, motivo: "sin configurar" };
  const hora = horaColombia(opciones.ahora);
  if (hora < desde || hora >= hasta) return { enviados: 0, motivo: "fuera de horario" };

  const pendientes = await seguimiento.pendientesDeRecordar({ horas });
  let enviados = 0;
  for (const pedido of pendientes) {
    const envio = await tg.llamarTelegram("sendMessage", {
      chat_id: chatId,
      text: tg.textoRecordatorio(pedido),
      reply_markup: tg.botonesPedido(pedido.id, pedido.estado),
    });
    if (!envio.ok) continue;
    await seguimiento.marcarRecordado(pedido.id);
    enviados++;
  }
  return { enviados, motivo: null };
}

class TelegramController {
  // POST /api/telegram/webhook. Telegram manda la clave que se le dio al
  // registrar el webhook (npm run telegram-webhook) en esta cabecera. Sin ella,
  // la ruta "no existe": nadie más puede mover pedidos fingiendo ser Telegram.
  static async webhook(req, res) {
    const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secreto || !secretoIgual(req.headers["x-telegram-bot-api-secret-token"], secreto)) {
      return res.status(404).json({ error: "Ruta no encontrada" });
    }
    try {
      const consulta = req.body?.callback_query;
      if (consulta) {
        const { resultado } = await atenderBoton(consulta);
        console.log(`[telegram] botón: ${resultado}`);
      }
    } catch (error) {
      console.error("[telegram] error atendiendo el botón:", error.message);
    }
    // Siempre 200: Telegram reintentaría y el obrador vería el toque repetido.
    return res.json({ ok: true });
  }

  // GET /api/pedidos/cron/recordatorios, con "Authorization: Bearer CRON_SECRET".
  static async recordatorios(req, res) {
    const secreto = process.env.CRON_SECRET;
    if (!secreto || !secretoIgual(req.headers.authorization, `Bearer ${secreto}`)) {
      return res.status(404).json({ error: "Ruta no encontrada" });
    }
    try {
      return res.json(await enviarRecordatorios());
    } catch (error) {
      // Lo más probable: falta la tabla pedido_seguimiento (npm run actualizar-base).
      console.error("[recordatorios] no se pudieron revisar los pedidos:", error.message);
      return res.status(500).json({ error: "No se pudieron revisar los pedidos" });
    }
  }
}

module.exports = { TelegramController, atenderBoton, enviarRecordatorios, horaColombia, configRecordatorios };
