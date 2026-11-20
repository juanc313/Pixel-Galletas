// Aviso de pedido nuevo al obrador por Telegram.
//
// Por qué Telegram y no correo: es una sola llave (el bot), no necesita dominio
// propio ni registros SPF/DKIM, es gratis y el aviso llega al teléfono en
// segundos. Se configura con dos variables del archivo .env:
//
//   TELEGRAM_BOT_TOKEN=123456:ABC...   (lo entrega @BotFather al crear el bot)
//   TELEGRAM_CHAT_ID=123456789        (el chat del obrador; se ve en
//                                      https://api.telegram.org/bot<token>/getUpdates
//                                      después de escribirle "hola" al bot)
//
// Sin esas dos variables el aviso simplemente no se envía y todo lo demás
// funciona igual: el pedido del cliente ya quedó guardado en MySQL.

const URL_API = "https://api.telegram.org";
const { ENTREGAS, ENVIO_GRATIS_DESDE } = require("./envio");

const pesos = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

// Texto plano del pedido para Telegram. A propósito NO se usa Markdown: el
// nombre, las notas o la dirección del cliente pueden traer asteriscos o
// guiones bajos y Telegram rechazaría el mensaje entero por "can't parse
// entities". Un aviso simple es preferible a un aviso que no llega.
function textoPedido(pedido) {
  const lineas = [
    `🍪 Pixelito: ¡nuevo pedido #${pedido.id}! — ${pesos(pedido.total)}`,
    "",
    `Cliente: ${pedido.clienteNombre ?? pedido.cliente_nombre}`,
    `Teléfono: ${pedido.clienteTelefono ?? pedido.cliente_telefono}`,
  ];
  if (pedido.direccion) lineas.push(`Dirección: ${pedido.direccion}`);
  // Cómo se entrega y cuánto costó el envío: sin esto, el obrador no sabe si
  // el pedido va a la calle o lo vienen a buscar. El costo ya viene calculado
  // del servidor (pedido.envio), no se vuelve a adivinar aquí.
  const zona = ENTREGAS[pedido.entrega];
  if (zona) {
    const costo = Number(pedido.envio) || 0;
    lineas.push(
      `Entrega: ${zona.nombre} — ${costo > 0 ? pesos(costo) : "gratis"}` +
        (costo === 0 && zona.costo > 0 ? ` (desde ${ENVIO_GRATIS_DESDE} galletas)` : "")
    );
  }
  if (pedido.notas) lineas.push(`Notas: ${pedido.notas}`);
  lineas.push("", "Galletas:");
  const detalles = pedido.detalles || [];
  for (const d of detalles) {
    const nombre = d.nombre ?? d.nombre_sabor;
    const precio = Number(d.precio ?? d.precio_unitario);
    lineas.push(`- ${d.cantidad} × ${nombre} — ${pesos(precio * d.cantidad)}`);
  }
  const unidades = detalles.reduce((suma, d) => suma + Number(d.cantidad), 0);
  lineas.push("", `${unidades} ${unidades === 1 ? "galleta" : "galletas"} en total`);
  if (pedido.descuento > 0) {
    lineas.push(`Subtotal: ${pesos(pedido.total + pedido.descuento)}`);
    lineas.push(`Descuento por volumen: -${pesos(pedido.descuento)}`);
  }
  lineas.push(`Total: ${pesos(pedido.total)}`);
  return lineas.join("\n");
}

// ============================================================================
// La misión del pedido desde Telegram
// ----------------------------------------------------------------------------
// Cada aviso lleva UN botón: el de la etapa que sigue. Tocarlo avanza el pedido
// una etapa (lo mismo que cambiar el estado en el panel) y el botón pasa a la
// siguiente. El dato del botón lleva también la etapa en la que estaba
// ("av:12:pendiente"): si el pedido ya se movió (dos toques seguidos, o lo
// cambiaste en el panel), el botón viejo no se salta etapas, solo se pone al día.
// Cancelar NO va en Telegram a propósito: un toque sin querer devolvería el
// inventario y apagaría la misión del cliente. Eso se hace en el panel.
// ============================================================================
const SIGUIENTE = { pendiente: "en_preparacion", en_preparacion: "listo", listo: "entregado" };
const BOTONES = {
  pendiente: "🔥 Tomar pedido: al horno",
  en_preparacion: "🎁 Ya está listo",
  listo: "🏆 Ya se entregó",
};
const ETAPAS = {
  pendiente: "📜 Pedido recibido",
  en_preparacion: "🔥 En el horno",
  listo: "🎁 Listo",
  entregado: "🏆 Entregado. ¡Misión cumplida!",
  cancelado: "❌ Cancelado",
};

// Teclado de Telegram con el botón de la etapa siguiente; sin botón si ya terminó.
function botonesPedido(id, estado) {
  const texto = BOTONES[estado];
  return { inline_keyboard: texto ? [[{ text: texto, callback_data: `av:${id}:${estado}` }]] : [] };
}

// "av:12:pendiente" → { id: 12, desde: "pendiente" }; cualquier otra cosa → null.
function leerBoton(dato) {
  const m = /^av:(\d{1,10}):([a-z_]{1,20})$/.exec(String(dato ?? ""));
  if (!m || !SIGUIENTE[m[2]]) return null;
  return { id: Number(m[1]), desde: m[2] };
}

// El aviso con su estado al pie. Se quita el pie anterior para no apilarlos.
const PIE = "\n\n🎮 Estado: ";
function textoConEstado(textoOriginal, estado) {
  const base = String(textoOriginal ?? "").split(PIE)[0];
  return `${base}${PIE}${ETAPAS[estado] || estado}`;
}

// Recordatorio de un pedido quieto. Va con el mismo botón, para resolverlo ahí.
function textoRecordatorio({ id, cliente_nombre, galletas, estado, minutos }) {
  const horas = Math.floor(minutos / 60);
  const tiempo = horas >= 1 ? `${horas} ${horas === 1 ? "hora" : "horas"}` : `${minutos} minutos`;
  const pregunta = { pendiente: "¿Ya lo empezaste?", en_preparacion: "¿Ya salió del horno?", listo: "¿Ya lo entregaste?" }[estado] || "";
  return `⏰ Pixelito: el pedido #${id} (${cliente_nombre}, ${galletas} ${Number(galletas) === 1 ? "galleta" : "galletas"}) lleva ${tiempo} en «${ETAPAS[estado] || estado}». ${pregunta}`.trim();
}

// Llamada genérica a la API del bot. Como notificarPedido, NUNCA lanza:
// devuelve { ok, datos, motivo }.
async function llamarTelegram(metodo, cuerpo, opciones = {}) {
  const { fetchImpl = globalThis.fetch, token = process.env.TELEGRAM_BOT_TOKEN, timeoutMs = 5000 } = opciones;
  if (!token) return { ok: false, motivo: "sin configurar" };
  if (typeof fetchImpl !== "function") return { ok: false, motivo: "sin fetch disponible" };
  try {
    const respuesta = await fetchImpl(`${URL_API}/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const datos = typeof respuesta.json === "function" ? await respuesta.json().catch(() => null) : null;
    if (!respuesta.ok) {
      console.warn(`[telegram] ${metodo} falló (HTTP ${respuesta.status})`);
      return { ok: false, datos, motivo: `telegram ${respuesta.status}` };
    }
    return { ok: true, datos, motivo: null };
  } catch (error) {
    console.warn(`[telegram] ${metodo} falló:`, error.message);
    return { ok: false, motivo: "error de red" };
  }
}

// Envía el aviso. NUNCA lanza una excepción: si Telegram está caído, sin
// configurar o la red falla, el pedido del cliente se atiende igual. Devuelve
// { enviado, motivo } para que quede en los registros y se pueda probar.
async function notificarPedido(pedido, opciones = {}) {
  const {
    fetchImpl = globalThis.fetch,
    token = process.env.TELEGRAM_BOT_TOKEN,
    chatId = process.env.TELEGRAM_CHAT_ID,
    timeoutMs = 5000,
  } = opciones;

  if (!token || !chatId) return { enviado: false, motivo: "sin configurar" };
  if (typeof fetchImpl !== "function") return { enviado: false, motivo: "sin fetch disponible" };

  try {
    const respuesta = await fetchImpl(`${URL_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: textoPedido(pedido),
        disable_web_page_preview: true,
        // El botón para avanzar la misión del pedido sin abrir el panel.
        reply_markup: botonesPedido(pedido.id, pedido.estado || "pendiente"),
      }),
      // Sin límite de tiempo, un Telegram lento dejaría al cliente esperando
      // con el pedido ya guardado.
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!respuesta.ok) {
      console.warn(`[telegram] el aviso del pedido no se envió (HTTP ${respuesta.status})`);
      return { enviado: false, motivo: `telegram ${respuesta.status}` };
    }
    return { enviado: true, motivo: null };
  } catch (error) {
    console.warn("[telegram] el aviso del pedido no se envió:", error.message);
    return { enviado: false, motivo: "error de red" };
  }
}

module.exports = {
  textoPedido, notificarPedido, botonesPedido, leerBoton, textoConEstado, textoRecordatorio,
  llamarTelegram, SIGUIENTE, ETAPAS,
};
