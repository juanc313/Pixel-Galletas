const pool = require("../config/db");

// Carrito guardado en la cuenta. Todas las consultas van filtradas por el
// usuario autenticado; el id nunca viene del cliente.
class Carrito {
  // Devuelve las líneas con el precio y el inventario vigentes del catálogo.
  static async obtenerPorUsuario(usuarioId) {
    const [rows] = await pool.query(
      `SELECT c.producto_id, p.nombre_sabor, p.precio_venta, p.cantidad_disponible, c.cantidad
         FROM carrito_items c
         JOIN productos p ON p.id = c.producto_id
        WHERE c.usuario_id = ?
        ORDER BY p.id ASC`,
      [usuarioId]
    );
    return rows;
  }

  // Reemplaza el carrito completo en una transacción. Las cantidades ya vienen
  // recortadas por el controlador al inventario disponible.
  static async reemplazar(usuarioId, lineas) {
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      await conexion.query("DELETE FROM carrito_items WHERE usuario_id = ?", [usuarioId]);
      for (const { producto_id, cantidad } of lineas) {
        await conexion.query(
          "INSERT INTO carrito_items (usuario_id, producto_id, cantidad) VALUES (?, ?, ?)",
          [usuarioId, producto_id, cantidad]
        );
      }
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }
}

module.exports = Carrito;
