const fs = require("fs");
const mysql = require("mysql2/promise");
require("dotenv").config();

// Las bases de datos en la nube (Aiven, PlanetScale…) exigen conexión cifrada
// con TLS. DB_SSL=true activa TLS; DB_SSL_CA apunta al archivo ca.pem que
// entrega el proveedor; DB_SSL_VERIFY=false omite verificar el certificado
// solo si el proveedor lo pide y no tienes el ca.pem.
function construirSSL() {
  if (process.env.DB_SSL !== "true") return undefined;
  const ssl = { rejectUnauthorized: process.env.DB_SSL_VERIFY !== "false" };
  // En Vercel no hay archivos locales: el certificado puede llegar como texto en DB_SSL_CA_PEM.
  if (process.env.DB_SSL_CA_PEM) {
    // Vercel guarda el PEM en una sola línea: los \n literales se convierten en saltos reales.
    ssl.ca = process.env.DB_SSL_CA_PEM.replace(/\\n/g, "\n");
  } else if (process.env.DB_SSL_CA && fs.existsSync(process.env.DB_SSL_CA)) {
    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA);
  }
  return ssl;
}

const opciones = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pixel_galletas_api",
  waitForConnections: true,
  connectionLimit: 10,
};

const ssl = construirSSL();
if (ssl) opciones.ssl = ssl;

const pool = mysql.createPool(opciones);

module.exports = pool;