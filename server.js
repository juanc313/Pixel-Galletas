require("dotenv").config();

// Sin clave secreta no se pueden firmar ni verificar tokens: mejor no arrancar.
if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en el archivo .env. El servidor no puede iniciar sin ese valor.");
  process.exit(1);
}

const app = require("./src/app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor de la API Pixel Galletas corriendo en http://localhost:${PORT}`);
});
