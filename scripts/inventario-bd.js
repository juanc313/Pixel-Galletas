// Inventario de solo lectura de la base de datos.
//
// Muestra las bases de datos del servidor y, para la base actual (DB_NAME),
// cada tabla con su número de filas. No lee el contenido de ninguna tabla ni
// nombres de columnas: solo ejecuta SHOW y SELECT COUNT(*).
//
// Uso:  npm run inventario-bd     (o)     node scripts/inventario-bd.js
// Toma la conexión de .env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL…).

const pool = require("../src/config/db");

// Candado: cualquier consulta que no empiece por SELECT o SHOW se rechaza antes
// de enviarse al servidor. Así el script no puede modificar nada aunque alguien
// lo edite por error más adelante.
async function consultar(sql, parametros = []) {
  const limpia = sql.trim();
  if (!/^(SELECT|SHOW)\s/i.test(limpia) || limpia.includes(";")) {
    throw new Error(`Consulta bloqueada (solo se permite SELECT o SHOW): ${limpia}`);
  }
  const [filas] = await pool.query(limpia, parametros);
  return filas;
}

// Los nombres de tabla vienen del propio servidor, pero se escapan igual.
function citar(nombre) {
  return "`" + String(nombre).replace(/`/g, "``") + "`";
}

async function main() {
  console.log("\n== Bases de datos del servidor ==");
  const bases = await consultar("SHOW DATABASES");
  for (const fila of bases) console.log("  - " + Object.values(fila)[0]);

  const [{ actual }] = await consultar("SELECT DATABASE() AS actual");
  if (!actual) {
    console.log("\nNo hay base actual (DB_NAME vacío). Fin.");
    return;
  }

  console.log(`\n== Tablas de "${actual}" y número de filas ==`);
  const tablas = await consultar("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  if (tablas.length === 0) {
    console.log("  (sin tablas)");
    return;
  }

  let total = 0;
  for (const fila of tablas) {
    const nombre = Object.values(fila)[0];
    const [{ filas }] = await consultar(`SELECT COUNT(*) AS filas FROM ${citar(nombre)}`);
    total += Number(filas);
    console.log(`  ${nombre.padEnd(32)} ${String(filas).padStart(10)}`);
  }
  console.log(`  ${"TOTAL".padEnd(32)} ${String(total).padStart(10)}\n`);
}

main()
  .catch((error) => {
    // Solo el mensaje: nunca se imprimen la contraseña ni las opciones de conexión.
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
