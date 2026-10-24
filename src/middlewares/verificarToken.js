const jwt = require("jsonwebtoken");

// Autenticación: comprueba que la petición traiga un token JWT válido.
function verificarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token no proporcionado. Inicia sesión primero." });
  }

  // algorithms fijado a HS256: el servidor nunca acepta otro tipo de firma.
  jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] }, (err, decoded) => {
    // 401 = sesión inválida o vencida; 403 queda reservado para "sin permisos".
    if (err) return res.status(401).json({ error: "Token inválido o expirado" });
    req.usuario = decoded;
    next();
  });
}

module.exports = verificarToken;
