const pool = require("../config/db");

// Cuándo cambió de etapa cada pedido y cuántas veces Pixelito lo recordó.
// Es lo que permite avisar "el pedido #12 lleva 3 horas en el horno" sin
// tocar la tabla de pedidos. Si la tabla aún no existe en la base (falta
// correr `npm run actualizar-base`), nada de esto rompe un pedido: quien llama
// atrapa el error y el recordatorio simplemente no sale.
class Seguimiento {
  // Pedido nuevo o cambio de estado: el reloj de esa etapa vuelve a cero.
  static async registrarCambio(pedidoId, estado) {
    await pool.query(
      `INSERT INTO pedido_seguimiento (pedido_id, estado, cambiado_en, recordado_en, recordatorios)
       VALUES (?, ?, NOW(), NULL, 0)
       ON DUPLICATE KEY UPDATE estado = VALUES(estado), cambiado_en = NOW(), recordado_en = NULL, recordatorios = 0`,
      [pedidoId, estado]
    );
  }

  // Pedidos en marcha que llevan `horas` sin moverse desde el cambio de etapa
  // (o desde el último recordatorio), con un tope de recordatorios por etapa
  // para que un pedido olvidado no escriba toda la semana.
  static async pendientesDeRecordar({ horas = 2, maximo = 3, limite = 20 } = {}) {
    const [filas] = await pool.query(
      `SELECT p.id, p.cliente_nombre, p.estado,
              TIMESTAMPDIFF(MINUTE, s.cambiado_en, NOW()) AS minutos,
              (SELECT COALESCE(SUM(d.cantidad), 0) FROM pedido_detalles d WHERE d.pedido_id = p.id) AS galletas
         FROM pedido_seguimiento s
         JOIN pedidos p ON p.id = s.pedido_id
        WHERE p.estado IN ('pendiente', 'en_preparacion', 'listo')
          AND p.estado = s.estado
          AND COALESCE(s.recordado_en, s.cambiado_en) <= NOW() - INTERVAL ? HOUR
          AND s.recordatorios < ?
        ORDER BY s.cambiado_en ASC
        LIMIT ?`,
      [horas, maximo, limite]
    );
    return filas.map((f) => ({ ...f, minutos: Number(f.minutos), galletas: Number(f.galletas) }));
  }

  static async marcarRecordado(pedidoId) {
    await pool.query(
      "UPDATE pedido_seguimiento SET recordado_en = NOW(), recordatorios = recordatorios + 1 WHERE pedido_id = ?",
      [pedidoId]
    );
  }
}

module.exports = Seguimiento;
