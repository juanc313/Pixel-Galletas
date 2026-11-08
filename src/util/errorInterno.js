// Respuesta de error interno: el detalle REAL va al log del servidor, nunca al
// cliente. Un error de MySQL (tipos de columna, nombres de tablas, fragmentos
// de consulta) es información de arquitectura que no le importa al cliente y le
// sirve a quien está tanteando la API.
function errorInterno(res, mensaje, error) {
  console.error(`[api] ${mensaje}:`, error);
  // El CÓDIGO de MySQL o de red sí vuelve al cliente. No revela usuario, host
  // ni SQL, pero distingue "contraseña incorrecta" (ER_ACCESS_DENIED_ERROR) de
  // "host bloqueado" (ETIMEDOUT / ECONNREFUSED / ENOTFOUND) o "base que no
  // existe" (ER_BAD_DB_ERROR). Sin él, un 500 genérico obliga a adivinar cuál
  // de las cinco variables de conexión está mal.
  const cuerpo = { error: mensaje };
  if (error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{2,39}$/.test(error.code)) {
    cuerpo.codigo = error.code;
  }
  return res.status(500).json(cuerpo);
}

module.exports = errorInterno;
