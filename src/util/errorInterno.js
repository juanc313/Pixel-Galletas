// Respuesta de error interno: el detalle REAL va al log del servidor, nunca al
// cliente. Un error de MySQL (tipos de columna, nombres de tablas, fragmentos
// de consulta) es información de arquitectura que no le importa al cliente y le
// sirve a quien está tanteando la API.
function errorInterno(res, mensaje, error) {
  console.error(`[api] ${mensaje}:`, error);
  return res.status(500).json({ error: mensaje });
}

module.exports = errorInterno;
