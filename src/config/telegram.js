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
    `Nuevo pedido #${pedido.id} — ${pesos(pedido.total)}`,
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
      body: JSON.stringify({ chat_id: chatId, text: textoPedido(pedido), disable_web_page_preview: true }),
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

module.exports = { textoPedido, notificarPedido };
