// Servidor de PRUEBAS para la colección de Postman: la API real (src/app.js)
// con una base de datos falsa en memoria (tests/helpers/dbFalsa.js).
//
// Por qué así: correr la colección contra el servidor normal crearía pedidos
// en tu base de datos y mandaría avisos REALES a Telegram. Aquí no hay MySQL,
// no se lee el .env y no sale nada a internet.
//
// Uso:   node scripts/servidor-pruebas-api.js        (puerto 3100)
// Datos: admin admin-pruebas@pixel.test / ClavePruebas123  (solo existen aquí)
//        3 sabores de prueba.

process.env.JWT_SECRET = "clave-solo-para-el-servidor-de-pruebas-de-postman-1234567890";
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.TELEGRAM_CHAT_ID = "";
process.env.TELEGRAM_WEBHOOK_SECRET = "";
for (const clave of ["LIMITE_API_MAX", "LIMITE_LOGIN_MAX", "LIMITE_REGISTRO_MAX", "LIMITE_PEDIDOS_MAX", "LIMITE_ESTADO_MAX"]) {
  process.env[clave] = "100000";
}
// Nada sale a internet desde este servidor (por si algún módulo lo intentara).
globalThis.fetch = async () => { throw new Error("Servidor de pruebas: sin acceso a internet"); };

const bcrypt = require("bcryptjs");
const { instalarDbFalsa } = require("../tests/helpers/dbFalsa");
const db = instalarDbFalsa();
const app = require("../src/app");

const PUERTO = Number(process.env.PUERTO_PRUEBAS) || 3100;

(async () => {
  db.agregarUsuario("Admin Pruebas", "admin-pruebas@pixel.test", bcrypt.hashSync("ClavePruebas123", 10), "admin");
  await db.agregarProducto({ nombre_sabor: "Pixel Monster", descripcion: "Sabor de prueba", precio_venta: 8000, cantidad_disponible: 50 });
  await db.agregarProducto({ nombre_sabor: "Pixel Red Velvet", descripcion: "Sabor de prueba", precio_venta: 8000 });
  await db.agregarProducto({ nombre_sabor: "Pixel Chocolate", descripcion: "Sabor de prueba", precio_venta: 7000 });
  app.listen(PUERTO, "127.0.0.1", () => {
    console.log(`Servidor de pruebas listo en http://127.0.0.1:${PUERTO} (base de datos falsa, sin Telegram)`);
  });
})();
