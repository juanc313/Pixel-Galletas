const pool = require("../config/db");

class Pedido {
  // Las respuestas usan snake_case, igual que productos y usuarios.
  constructor({ id, usuario_id, cliente_nombre, cliente_telefono, direccion, notas, total, estado, creado_en, detalles }) {
    this.id = id;
    this.usuario_id = usuario_id;
    this.cliente_nombre = cliente_nombre;
    this.cliente_telefono = cliente_telefono;
    this.direccion = direccion;
    this.notas = notas;
    this.total = Number(total);
    this.estado = estado;
    this.creado_en = creado_en;
    this.detalles = detalles || [];
  }

  // Crea el pedido y su detalle en una sola transacción: o se guarda todo, o no se guarda nada.
  // items: [{ producto_id, nombre_sabor, precio_unitario, cantidad }] (precios ya validados por el controller).
  static async crear({ usuario_id, cliente_nombre, cliente_telefono, direccion, notas, total, items }) {
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      const [resultado] = await conexion.query(
        "INSERT INTO pedidos (usuario_id, cliente_nombre, cliente_telefono, direccion, notas, total) VALUES (?, ?, ?, ?, ?, ?)",
        [usuario_id ?? null, cliente_nombre, cliente_telefono, direccion ?? null, notas ?? null, total]
      );
      const pedidoId = resultado.insertId;
      for (const item of items) {
        await conexion.query(
          "INSERT INTO pedido_detalles (pedido_id, producto_id, nombre_sabor, precio_unitario, cantidad) VALUES (?, ?, ?, ?, ?)",
          [pedidoId, item.producto_id ?? null, item.nombre_sabor, item.precio_unitario, item.cantidad]
        );
      }
      await conexion.commit();
      return this.buscarPorId(pedidoId);
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }

  static async buscarPorId(id) {
    const [filas] = await pool.query("SELECT * FROM pedidos WHERE id = ?", [id]);
    if (!filas.length) return null;
    const [detalles] = await pool.query(
      "SELECT producto_id, nombre_sabor, precio_unitario, cantidad FROM pedido_detalles WHERE pedido_id = ? ORDER BY id ASC",
      [id]
    );
    return new Pedido({ ...filas[0], detalles: detalles.map(({ pedido_id, ...resto }) => resto) });
  }

  static async listarTodos() {
    const [pedidos] = await pool.query("SELECT * FROM pedidos ORDER BY id DESC");
    const [detalles] = await pool.query(
      "SELECT pedido_id, producto_id, nombre_sabor, precio_unitario, cantidad FROM pedido_detalles ORDER BY id ASC"
    );
    return pedidos.map((p) => new Pedido({
      ...p,
      detalles: detalles.filter((d) => d.pedido_id === p.id).map(({ pedido_id, ...resto }) => resto),
    }));
  }

  static async actualizarEstado(id, estado) {
    const [resultado] = await pool.query("UPDATE pedidos SET estado = ? WHERE id = ?", [estado, id]);
    return resultado.affectedRows > 0;
  }
}

module.exports = Pedido;
