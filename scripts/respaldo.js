// Copia de seguridad de la base de datos en un archivo .sql de este computador.
// Uso:  npm run respaldo
//
// Solo lee: abre una transacción de solo lectura con una foto consistente de
// la base, así que nunca modifica ni borra nada. No usa el archivo .env (que
// apunta a la base local): pide los datos de Aiven y recuerda los que no son
// secretos en respaldos/.conexion.json. La contraseña se escribe cada vez y no
// se guarda en ningún lado.
//
// La carpeta respaldos/ queda fuera de git: trae nombres y teléfonos de clientes.
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mysql = require("mysql2/promise");

const CARPETA = process.env.RESPALDO_DIR || path.join(__dirname, "..", "respaldos");
const CONEXION = path.join(CARPETA, ".conexion.json");
const CA_POR_DEFECTO = path.join(__dirname, "..", "..", "ca.pem");
const FILAS_POR_INSERT = 200;

const dos = (n) => String(n).padStart(2, "0");
function marcaDeTiempo(d = new Date()) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}`;
}

// Sentencias SQL de una tabla: su estructura y sus filas en INSERT por lotes.
function sentenciasDeTabla(tabla, crearTabla, filas) {
  const partes = [
    `-- Tabla ${tabla}: ${filas.length} ${filas.length === 1 ? "fila" : "filas"}`,
    `DROP TABLE IF EXISTS ${mysql.escapeId(tabla)};`,
    `${crearTabla};`,
  ];
  for (let i = 0; i < filas.length; i += FILAS_POR_INSERT) {
    const lote = filas.slice(i, i + FILAS_POR_INSERT);
    const columnas = Object.keys(lote[0]);
    partes.push(mysql.format(`INSERT INTO ?? (??) VALUES ?;`, [tabla, columnas, lote.map((f) => columnas.map((c) => f[c]))]));
  }
  return partes.join("\n") + "\n";
}

function encabezado(base, fecha) {
  return [
    "-- =====================================================",
    `-- Copia de seguridad de Pixel Galletas · base ${base}`,
    `-- Hecha el ${fecha.toLocaleString("es-CO")}`,
    "-- Restaurar SOLO en una base nueva y vacía (ver README).",
    "-- =====================================================",
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "",
  ].join("\n");
}

function preguntar(rl, texto, porDefecto) {
  const sufijo = porDefecto ? ` [${porDefecto}]` : "";
  return new Promise((ok) => rl.question(`${texto}${sufijo}: `, (r) => ok(r.trim() || porDefecto || "")));
}

// La contraseña no se muestra en pantalla mientras se escribe.
function preguntarOculto(rl, texto) {
  return new Promise((ok) => {
    const escribir = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(texto)) escribir.call(rl, s); };
    rl.question(`${texto}: `, (r) => {
      rl._writeToOutput = escribir;
      process.stdout.write("\n");
      ok(r);
    });
  });
}

async function pedirConexion() {
  let previa = {};
  try { previa = JSON.parse(fs.readFileSync(CONEXION, "utf8")); } catch { /* primera vez */ }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const datos = {
      host: process.env.DB_HOST || await preguntar(rl, "Host de Aiven", previa.host),
      port: Number(process.env.DB_PORT || await preguntar(rl, "Puerto", previa.port)),
      user: process.env.DB_USER || await preguntar(rl, "Usuario", previa.user || "avnadmin"),
      database: process.env.DB_NAME || await preguntar(rl, "Base de datos", previa.database || "defaultdb"),
      ca: process.env.DB_SSL_CA || await preguntar(rl, "Archivo ca.pem", previa.ca || CA_POR_DEFECTO),
    };
    const password = process.env.DB_PASSWORD ?? await preguntarOculto(rl, "Contraseña de Aiven (no se ve al escribir)");
    return { datos, password };
  } finally {
    rl.close();
  }
}

async function main() {
  fs.mkdirSync(CARPETA, { recursive: true });
  const { datos, password } = await pedirConexion();
  if (!datos.host || !datos.port || !datos.user || !datos.database) throw new Error("Faltan datos de conexión.");
  const ssl = process.env.DB_SSL === "false" ? undefined : { ca: fs.readFileSync(datos.ca), rejectUnauthorized: true };

  const conexion = await mysql.createConnection({
    host: datos.host, port: datos.port, user: datos.user, password, database: datos.database,
    ssl, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, connectTimeout: 20000,
  });
  // Los datos de conexión que no son secretos se recuerdan para el mes siguiente.
  fs.writeFileSync(CONEXION, JSON.stringify(datos, null, 2));

  const fecha = new Date();
  const archivo = path.join(CARPETA, `pixel-galletas-${marcaDeTiempo(fecha)}.sql`);
  const resumen = [];
  try {
    await conexion.query("SET SESSION TRANSACTION READ ONLY");
    await conexion.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const [tablas] = await conexion.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    let sql = encabezado(datos.database, fecha);
    for (const t of tablas) {
      const tabla = Object.values(t)[0];
      const [[crear]] = await conexion.query("SHOW CREATE TABLE ??", [tabla]);
      const [filas] = await conexion.query("SELECT * FROM ??", [tabla]);
      sql += "\n" + sentenciasDeTabla(tabla, crear["Create Table"], filas);
      resumen.push([tabla, filas.length]);
    }
    sql += "\nSET FOREIGN_KEY_CHECKS = 1;\n";
    await conexion.query("COMMIT");
    fs.writeFileSync(archivo, sql);
  } finally {
    await conexion.end();
  }

  console.log("\nCopia guardada en:", archivo);
  for (const [tabla, n] of resumen) console.log(`  ${tabla.padEnd(22)} ${n}`);
  console.log("Guárdala en un lugar seguro: contiene datos de tus clientes.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\nNo se pudo hacer la copia:", error.code || "", error.message);
    process.exitCode = 1;
  });
}

module.exports = { sentenciasDeTabla, marcaDeTiempo };
