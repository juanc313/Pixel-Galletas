// Entrada de Vercel: cada petición /api/* y las rutas reescritas llegan aquí.
// Vercel sirve public/ directamente; esta función solo atiende la API y el
// sitemap. No llama a listen(): Vercel gestiona el servidor.
require("dotenv").config();
const { problemaDeJwtSecret } = require("../src/config/jwtSecreto");

// Con la clave mal puesta no se puede firmar ni verificar ningún token. Aquí no
// sirve process.exit(1) como en server.js (Vercel solo mostraría un error sin
// explicación): la función responde 503 con un código claro y el motivo queda
// en los registros.
const problema = problemaDeJwtSecret();
if (problema) {
  console.error(`[arranque] ${problema}`);
  module.exports = (req, res) => {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "La tienda no está disponible: falta configurar el servidor", codigo: "JWT_SECRET_INVALIDO" }));
  };
} else {
  module.exports = require("../src/app");
}
