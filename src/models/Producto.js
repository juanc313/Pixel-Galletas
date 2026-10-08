const pool = require("../config/db");

class Producto {
  constructor({ id, nombre_sabor, descripcion, precio_venta, creado_en }) {
    this.id = id;
    this.nombre_sabor = nombre_sabor;
    this.descripcion = descripcion;
    this.precio_venta = precio_venta;
    this.creado_en = creado_en;
  }

  static async crear({ nombre_sabor, descripcion, precio_venta }) {
    const [result] = await pool.query(
      "INSERT INTO productos (nombre_sabor, descripcion, precio_venta) VALUES (?, ?, ?)",
      [nombre_sabor, descripcion || null, precio_venta || 4500]
    );
    return this.buscarPorId(result.insertId);
  }

  static async listarTodos() {
    const [rows] = await pool.query("SELECT * FROM productos ORDER BY id ASC");
    return rows.map((row) => new Producto(row));
  }

  static async buscarPorId(id) {
    const [rows] = await pool.query("SELECT * FROM productos WHERE id = ?", [id]);
    return rows.length ? new Producto(rows[0]) : null;
  }

  static async actualizar(id, { nombre_sabor, descripcion, precio_venta }) {
    await pool.query(
      "UPDATE productos SET nombre_sabor = COALESCE(?, nombre_sabor), descripcion = COALESCE(?, descripcion), precio_venta = COALESCE(?, precio_venta) WHERE id = ?",
      [nombre_sabor ?? null, descripcion ?? null, precio_venta ?? null, id]
    );
    return this.buscarPorId(id);
  }

  static async eliminar(id) {
    const [result] = await pool.query("DELETE FROM productos WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Producto;