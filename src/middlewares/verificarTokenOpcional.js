const jwt = require("jsonwebtoken");

// Autenticación opcional: si la petición trae un token válido, adjunta req.usuario;
// si no trae token (o es inválido), la petición continúa igual. Útil en rutas que
// funcionan para invitados y también para usuarios con sesión iniciada.
function verificarTokenOpcional(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return next();

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (!err) req.usuario = decoded;
    next();
  });
}

module.exports = verificarTokenOpcional;
