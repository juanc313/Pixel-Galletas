require("dotenv").config();

// Sin clave secreta no se pueden firmar ni verificar tokens: mejor no arrancar.
// En producción la clave debe ser larga: una clave corta se adivina offline a partir de un token.
if (process.env.NODE_ENV === "production" && (process.env.JWT_SECRET || "").length < 32) {
  console.error("JWT_SECRET debe tener al menos 32 caracteres en producción.");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en el archivo .env. El servidor no puede iniciar sin ese valor.");
  process.exit(1);
}

const app = require("./src/app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor de la API Pixel Galletas corriendo en http://localhost:${PORT}`);
});

// Retención de la medición propia: al arrancar y cada 24 h se borran eventos de
// más de 180 días. unref() para que el temporizador no impida cerrar el proceso.
const Evento = require("./src/models/Evento");
const purgar = () =>
  Evento.purgarAntiguos(180).catch((error) => console.error("[retención] no se pudo purgar eventos:", error.message));
purgar();
setInterval(purgar, 24 * 60 * 60 * 1000).unref();
