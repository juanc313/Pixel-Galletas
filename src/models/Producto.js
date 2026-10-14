const pool = require("../config/db");

class Producto {
  // Inventario del obrador: cantidad_disponible es NULL cuando el sabor se
  // hornea bajo pedido (no se lleva cuenta), 0 cuando está agotado y N cuando
  // quedan unidades. `disponible` es la pregunta que hace el resto del sistema
  // ("¿se puede pedir?"), que es distinta de "¿cuántas quedan?".
  constructor({ id, nombre_sabor, descripcion, precio_venta, cantidad_disponible, creado_en }) {
    this.id = id;
    this.nombre_sabor = nombre_sabor;
    this.descripcion = descripcion;
    this.precio_venta = precio_venta;
    this.cantidad_disponible =
      cantidad_disponible === null || cantidad_disponible === undefined ? null : Number(cantidad_disponible);
    this.disponible = this.cantidad_disponible === null || this.cantidad_disponible > 0;
    this.creado_en = creado_en;
  }

  static async crear({ nombre_sabor, descripcion, precio_venta, cantidad_disponible }) {
    const [result] = await pool.query(
      "INSERT INTO productos (nombre_sabor, descripcion, precio_venta, cantidad_disponible) VALUES (?, ?, ?, ?)",
      [nombre_sabor, descripcion || null, precio_venta || 4500, cantidad_disponible ?? null]
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

  // Cambia solo el inventario: lo usa el panel para dejar un sabor agotado
  // (0), con unidades contadas (N) o sin control de inventario (null). Va
  // aparte de `actualizar` para que una edición del precio no toque el
  // inventario por accidente, y devuelve el producto ya actualizado.
  static async actualizarDisponibilidad(id, cantidad) {
    await pool.query("UPDATE productos SET cantidad_disponible = ? WHERE id = ?", [cantidad, id]);
    return this.buscarPorId(id);
  }

  static async eliminar(id) {
    const [result] = await pool.query("DELETE FROM productos WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Producto;