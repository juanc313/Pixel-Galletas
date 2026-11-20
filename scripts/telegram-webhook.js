// Conecta los botones del aviso de Telegram con la tienda publicada.
//
// Telegram necesita saber a qué dirección avisar cuando tocas un botón. Esto se
// hace UNA vez (o cuando cambie el dominio o la clave):
//
//   npm run telegram-webhook            registra https://<SITIO_URL>/api/telegram/webhook
//   npm run telegram-webhook -- --ver   muestra cómo está registrado
//   npm run telegram-webhook -- --quitar  desconecta los botones
//
// Lee de .env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET y SITIO_URL. La misma
// TELEGRAM_WEBHOOK_SECRET tiene que estar en las variables de Vercel.
// Ojo: con el webhook puesto, la página .../getUpdates deja de funcionar (el
// chat id ya lo tienes en TELEGRAM_CHAT_ID, así que no hace falta).
require("dotenv").config();
const { llamarTelegram } = require("../src/config/telegram");

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en .env");
  const accion = process.argv.includes("--quitar") ? "quitar" : process.argv.includes("--ver") ? "ver" : "poner";

  if (accion === "ver") {
    const r = await llamarTelegram("getWebhookInfo", {}, { token });
    const info = r.datos?.result || {};
    console.log(info.url ? `Conectado a: ${info.url}` : "No hay webhook conectado.");
    if (info.pending_update_count) console.log(`Toques en espera: ${info.pending_update_count}`);
    if (info.last_error_message) console.log(`Último error de Telegram: ${info.last_error_message}`);
    return;
  }
  if (accion === "quitar") {
    const r = await llamarTelegram("deleteWebhook", {}, { token });
    console.log(r.ok ? "Listo: los botones quedaron desconectados." : `No se pudo: ${r.motivo}`);
    return;
  }

  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const sitio = String(process.env.SITIO_URL || "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_-]{24,256}$/.test(secreto)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET debe tener al menos 24 caracteres, solo letras, números, _ o -");
  }
  if (!/^https:\/\//.test(sitio)) throw new Error("SITIO_URL debe ser la dirección pública con https:// (Telegram lo exige)");

  const url = `${sitio}/api/telegram/webhook`;
  const r = await llamarTelegram("setWebhook", {
    url,
    secret_token: secreto,
    allowed_updates: ["callback_query"],
    drop_pending_updates: true,
  }, { token });
  if (!r.ok) throw new Error(`Telegram no aceptó el webhook: ${r.datos?.description || r.motivo}`);
  console.log(`Listo: los botones de Pixelito avisan a ${url}`);
}

main().catch((error) => {
  console.error("\n" + error.message);
  process.exitCode = 1;
});
