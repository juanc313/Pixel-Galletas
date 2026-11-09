// Comprobación de JWT_SECRET, la misma en server.js (local) y en api/index.js
// (Vercel). Devuelve el motivo si la clave no sirve, o null si está bien.
//
// En producción la clave debe ser larga: una clave corta se adivina offline a
// partir de un token.
const MINIMO_EN_PRODUCCION = 32;

function problemaDeJwtSecret(entorno = process.env) {
  const secreto = entorno.JWT_SECRET || "";
  if (!secreto) return "Falta JWT_SECRET en las variables de entorno. El servidor no puede iniciar sin ese valor.";
  if (entorno.NODE_ENV === "production" && secreto.length < MINIMO_EN_PRODUCCION) {
    return `JWT_SECRET debe tener al menos ${MINIMO_EN_PRODUCCION} caracteres en producción.`;
  }
  return null;
}

module.exports = { problemaDeJwtSecret };
