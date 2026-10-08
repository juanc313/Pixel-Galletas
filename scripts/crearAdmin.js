// Crea el primer administrador (o promueve un correo existente a admin).
// Uso:  npm run crear-admin
require("dotenv").config();
const readline = require("readline");
const bcrypt = require("bcryptjs");
const pool = require("../src/config/db");

function preguntar(rl, texto) {
  return new Promise((resolve) => rl.question(texto, resolve));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const nombre = (await preguntar(rl, "Nombre del administrador: ")).trim();
    const correo = (await preguntar(rl, "Correo: ")).trim();
    const contrasena = await preguntar(rl, "Contraseña (mínimo 6 caracteres): ");

    if (!nombre || !correo || contrasena.length < 6) {
      console.error("Datos incompletos: revisa nombre, correo y que la contraseña tenga 6 o más caracteres.");
      process.exitCode = 1;
      return;
    }

    const [existe] = await pool.query("SELECT id FROM usuarios WHERE correo = ?", [correo]);
    if (existe.length) {
      await pool.query("UPDATE usuarios SET rol = 'admin' WHERE id = ?", [existe[0].id]);
      console.log("Ese correo ya existía: ahora tiene rol admin (su contraseña no cambió).");
    } else {
      const hash = await bcrypt.hash(contrasena, 10);
      await pool.query(
        "INSERT INTO usuarios (nombre, correo, contrasena, rol) VALUES (?, ?, ?, 'admin')",
        [nombre, correo, hash]
      );
      console.log("Administrador creado correctamente.");
    }
  } catch (error) {
    console.error("No se pudo completar la operación:", error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
