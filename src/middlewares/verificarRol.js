const Usuario = require("../models/Usuario");

// Autorización: deja pasar solo a los usuarios cuyo rol esté permitido.
// Debe usarse DESPUÉS de verificarToken. El rol se consulta en la base de datos en cada
// petición, así un cambio de rol (o una cuenta eliminada) surte efecto de inmediato,
// sin esperar a que venza el token.
function verificarRol(...rolesPermitidos) {
  return async (req, res, next) => {
    try {
      const actual = req.usuario ? await Usuario.buscarPorId(req.usuario.id) : null;
      if (!actual || !rolesPermitidos.includes(actual.rol)) {
        return res.status(403).json({ error: "No tienes permisos para realizar esta acción" });
      }
      req.usuario.rol = actual.rol;
      next();
    } catch (error) {
      return res.status(500).json({ error: "No se pudo verificar el rol del usuario" });
    }
  };
}

module.exports = verificarRol;
