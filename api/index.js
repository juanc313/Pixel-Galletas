// Entrada de Vercel: cada petición /api/* y las rutas reescritas llegan aquí.
// Vercel sirve public/ directamente; esta función solo atiende la API y el
// sitemap. No llama a listen(): Vercel gestiona el servidor.
require("dotenv").config();
module.exports = require("../src/app");
