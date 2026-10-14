const { rateLimit } = require("express-rate-limit");

// Límites de tasa por IP. Sin ellos, el login es un campo libre para la fuerza
// bruta y POST /api/pedidos una máquina de spam que llena la base y dispara
// avisos a Telegram. Los topes se pueden ajustar por variables de entorno
// (útil en pruebas y si el tráfico legítimo crece) sin tocar código.
//
//   LIMITE_LOGIN_MAX      intentos de login por ventana  (defecto 10)
//   LIMITE_REGISTRO_MAX   altas por ventana              (defecto 5)
//   LIMITE_PEDIDOS_MAX    pedidos creados por ventana    (defecto 20)
//   LIMITE_ESTADO_MAX     consultas de estado por ventana(defecto 30)
//   LIMITE_API_MAX        peticiones a /api por ventana  (defecto 300)

const entero = (clave, defecto) => {
  const n = Number(process.env[clave]);
  return Number.isInteger(n) && n > 0 ? n : defecto;
};

const fabrica = (defecto, mensaje, ventanaMs) =>
  rateLimit({
    windowMs: ventanaMs,
    limit: entero(defecto.clave, defecto.valor),
    standardHeaders: true, // RateLimit-* (draft-6)
    legacyHeaders: false,
    message: { error: mensaje },
  });

module.exports = {
  // Fuerza bruta contra credenciales: pocas oportunidades por cuarto de hora.
  limiteLogin: fabrica(
    { clave: "LIMITE_LOGIN_MAX", valor: 10 },
    "Demasiados intentos de acceso. Espera unos minutos e inténtalo de nuevo.",
    15 * 60 * 1000
  ),
  // Crear cuentas a lo loco tampoco debe ser gratis.
  limiteRegistro: fabrica(
    { clave: "LIMITE_REGISTRO_MAX", valor: 5 },
    "Demasiados registros desde esta conexión. Espera unos minutos.",
    60 * 60 * 1000
  ),
  // Pedidos falsos: ensucian el panel del obrador y disparan el aviso a Telegram.
  limitePedidos: fabrica(
    { clave: "LIMITE_PEDIDOS_MAX", valor: 20 },
    "Estás haciendo muchos pedidos muy seguidos. Espera un momento y vuelve a intentar.",
    60 * 60 * 1000
  ),
  // La consulta de estado se valida con número + teléfono: sin límite se puede
  // adivinar a fuerza bruta.
  limiteEstado: fabrica(
    { clave: "LIMITE_ESTADO_MAX", valor: 30 },
    "Demasiadas consultas de estado. Espera unos minutos.",
    15 * 60 * 1000
  ),
  // Red de seguridad para todo lo demás de la API (incluye la medición).
  limiteApi: fabrica(
    { clave: "LIMITE_API_MAX", valor: 300 },
    "Demasiadas peticiones desde esta conexión. Espera un momento.",
    15 * 60 * 1000
  ),
};
