const crypto = require("crypto");

// Compara un secreto en tiempo constante: no se puede adivinar letra por letra
// midiendo cuánto tarda la respuesta. Falso si falta cualquiera de los dos.
function secretoIgual(recibido, esperado) {
  if (!esperado) return false;
  const a = Buffer.from(String(recibido ?? ""));
  const b = Buffer.from(String(esperado));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { secretoIgual };
