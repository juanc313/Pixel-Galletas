const pool = require("../config/db");

class Usuario {
  constructor({ id, nombre, correo, contrasena, rol, creado_en }) {
    this.id = id;
    this.nombre = nombre;
    this.correo = correo;
    this.contrasena = contrasena;
    this.rol = rol;
    this.creado_en = creado_en;
  }

  static async crear({ nombre, correo, contrasenaHasheada, rol }) {
    const [result] = await pool.query(
      "INSERT INTO usuarios (nombre, correo, contrasena, rol) VALUES (?, ?, ?, ?)",
      [nombre, correo, contrasenaHasheada, rol || "cliente"]
    );
    return this.buscarPorId(result.insertId);
  }

  static async listarTodos() {
    const [rows] = await pool.query(
      "SELECT id, nombre, correo, rol, creado_en FROM usuarios ORDER BY id ASC"
    );
    return rows.map((row) => new Usuario(row));
  }

  static async buscarPorId(id) {
    const [rows] = await pool.query(
      "SELECT id, nombre, correo, rol, creado_en FROM usuarios WHERE id = ?",
      [id]
    );
    return rows.length ? new Usuario(rows[0]) : null;
  }

  static async buscarPorCorreoConClave(correo) {
    const [rows] = await pool.query("SELECT * FROM usuarios WHERE correo = ?", [correo]);
    return rows.length ? new Usuario(rows[0]) : null;
  }

  static async actualizar(id, { nombre, correo, rol }) {
    await pool.query(
      "UPDATE usuarios SET nombre = COALESCE(?, nombre), correo = COALESCE(?, correo), rol = COALESCE(?, rol) WHERE id = ?",
      [nombre ?? null, correo ?? null, rol ?? null, id]
    );
    return this.buscarPorId(id);
  }

  static async eliminar(id) {
    const [result] = await pool.query("DELETE FROM usuarios WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Usuario;