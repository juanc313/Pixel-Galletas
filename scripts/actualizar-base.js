// Crea en la base de Aiven las tablas que le falten.
// Uso:  npm run actualizar-base
//
// Toma de database/schema.sql SOLO las sentencias CREATE TABLE IF NOT EXISTS y
// ejecuta las de las tablas que todavía no existen. Nunca borra, modifica ni
// rellena nada: los pedidos, productos y clientes no se tocan. Pide los datos
// de conexión igual que la copia de seguridad (npm run respaldo).
const fs = require("fs");
const path = require("path");
const { conectar } = require("./respaldo");

const ESQUEMA = path.join(__dirname, "..", "database", "schema.sql");

// Lista { nombre, sql } de las tablas del esquema, en su orden (que respeta las
// claves foráneas). Los comentarios se quitan: algunos llevan punto y coma.
function tablasDelEsquema(texto) {
  const limpio = texto.replace(/--[^\n]*/g, "");
  const sentencias = limpio.match(/CREATE TABLE IF NOT EXISTS\s+\w+\s*\([\s\S]*?\)\s*ENGINE=\w+\s*;/g) || [];
  return sentencias.map((sql) => ({
    nombre: sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/)[1],
    sql: sql.replace(/\s*;$/, ""),
  }));
}

async function main() {
  const tablas = tablasDelEsquema(fs.readFileSync(ESQUEMA, "utf8"));
  const { conexion } = await conectar();
  const creadas = [];
  try {
    const [filas] = await conexion.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    const existentes = new Set(filas.map((f) => Object.values(f)[0]));
    for (const { nombre, sql } of tablas) {
      if (existentes.has(nombre)) continue;
      await conexion.query(sql);
      creadas.push(nombre);
    }
  } finally {
    await conexion.end();
  }
  console.log(creadas.length
    ? `\nTablas creadas: ${creadas.join(", ")}`
    : "\nLa base ya estaba al día: no faltaba ninguna tabla.");
  console.log(`La base tiene las ${tablas.length} tablas de la tienda. No se tocó ningún dato.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\nNo se pudo actualizar la base:", error.code || "", error.message);
    process.exitCode = 1;
  });
}

module.exports = { tablasDelEsquema };
