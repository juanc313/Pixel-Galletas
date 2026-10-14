const pool = require("../config/db");

class Pedido {
  // Las respuestas usan snake_case, igual que productos y usuarios.
  constructor({ id, usuario_id, cliente_nombre, cliente_telefono, direccion, entrega, envio, notas, total, descuento, visita, estado, creado_en, detalles }) {
    this.id = id;
    this.usuario_id = usuario_id;
    this.cliente_nombre = cliente_nombre;
    this.cliente_telefono = cliente_telefono;
    this.direccion = direccion;
    // Cómo se entrega y lo que costó el envío, calculado por el servidor. En
    // los pedidos antiguos a estas columnas les toca 'recoger' y 0 (ver el
    // esquema), que es justo lo que se cobró en su momento.
    this.entrega = entrega || "recoger";
    this.envio = Number(envio) || 0;
    this.notas = notas;
    this.total = Number(total);
    // Ahorro por volumen, calculado en el servidor. 0 en los pedidos pequeños
    // y en los que se guardaron antes de que existiera el descuento.
    this.descuento = Number(descuento) || 0;
    // Visita anónima que hizo el pedido: es lo que permite cerrar el embudo de
    // la medición (agregó al carrito y sí confirmó). Null en los pedidos hechos
    // sin medición o antes de que existiera.
    this.visita = visita ?? null;
    this.estado = estado;
    this.creado_en = creado_en;
    this.detalles = detalles || [];
  }

  // Crea el pedido y su detalle en una sola transacción: o se guarda todo, o no se guarda nada.
  // items: [{ producto_id, nombre_sabor, precio_unitario, cantidad }] (precios ya validados por el controller).
  static async crear({ usuario_id, cliente_nombre, cliente_telefono, direccion, entrega, envio, notas, total, descuento, visita, items }) {
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      const [resultado] = await conexion.query(
        "INSERT INTO pedidos (usuario_id, cliente_nombre, cliente_telefono, direccion, entrega, envio, notas, total, descuento, visita) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [usuario_id ?? null, cliente_nombre, cliente_telefono, direccion ?? null, entrega ?? "recoger", envio ?? 0, notas ?? null, total, descuento ?? 0, visita ?? null]
      );
      const pedidoId = resultado.insertId;
      for (const item of items) {
        await conexion.query(
          "INSERT INTO pedido_detalles (pedido_id, producto_id, nombre_sabor, precio_unitario, cantidad) VALUES (?, ?, ?, ?, ?)",
          [pedidoId, item.producto_id ?? null, item.nombre_sabor, item.precio_unitario, item.cantidad]
        );
      }
      // Reserva el inventario de cada sabor dentro de la MISMA transacción: si
      // un sabor se quedó sin unidades entre que el cliente armó el carrito y
      // confirmó, no se guarda nada (ni pedido ni reserva) en vez de vender lo
      // que ya no hay. Los sabores sin control de inventario pasan de largo.
      await this.#descontarStock(conexion, items);
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

  // Paginado: antes se traían TODOS los pedidos y TODOS sus detalles en cada
  // consulta del panel. Ahora solo la página pedida y sus detalles.
  static async listarTodos({ limite = 50, pagina = 1 } = {}) {
    const [pedidos] = await pool.query(
      "SELECT * FROM pedidos ORDER BY id DESC LIMIT ? OFFSET ?",
      [limite, (pagina - 1) * limite]
    );
    if (!pedidos.length) return [];
    const ids = pedidos.map((p) => p.id);
    const [detalles] = await pool.query(
      "SELECT pedido_id, producto_id, nombre_sabor, precio_unitario, cantidad FROM pedido_detalles WHERE pedido_id IN (?) ORDER BY id ASC",
      [ids]
    );
    return pedidos.map((p) => new Pedido({
      ...p,
      detalles: detalles.filter((d) => d.pedido_id === p.id).map(({ pedido_id, ...resto }) => resto),
    }));
  }

  // Consulta pública del estado: sin cuenta, con el número del pedido y el
  // teléfono con el que se hizo. Solo devuelve lo que el cliente necesita ver
  // (estado, fecha, total y lo pedido): ni el nombre, ni la dirección, ni el
  // teléfono, ni las notas — así un tercero que adivine el número no saca nada
  // del pedido de otra persona.
  static async buscarPublico(id, telefono) {
    const pedido = await this.buscarPorId(id);
    if (!pedido) return null;
    if (this.#normalizarTelefono(pedido.cliente_telefono) !== this.#normalizarTelefono(telefono)) return null;
    return {
      id: pedido.id,
      estado: pedido.estado,
      creado_en: pedido.creado_en,
      total: pedido.total,
      descuento: pedido.descuento,
      // La forma de entrega y el costo del envío son del pedido, no del
      // cliente: enseñarlos no espiá a nadie y le sirven para saber cómo
      // llegará lo que pidió.
      entrega: pedido.entrega,
      envio: pedido.envio,
      detalles: pedido.detalles.map((d) => ({ nombre_sabor: d.nombre_sabor, cantidad: d.cantidad })),
    };
  }

  // "313 783 9935", "+57 3137839935" y "573137839935" son el mismo número:
  // el cliente escribe como le da la gana y hay que reconocerlo igual.
  static #normalizarTelefono(valor) {
    const digitos = String(valor ?? "").replace(/\D/g, "");
    return digitos.length >= 11 && digitos.startsWith("57") ? digitos.slice(2) : digitos;
  }

  // Cambiar el estado también mueve el inventario: cancelar un pedido devuelve
  // las galletas al catálogo, y sacar un pedido de "cancelado" las vuelve a
  // reservar (si ya no alcanzan, el cambio se rechaza en vez de vender lo que
  // no hay). Todo dentro de una transacción, para que el estado y el
  // inventario no puedan quedar en desacuerdo.
  static async actualizarEstado(id, estado) {
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      const [filas] = await conexion.query("SELECT estado FROM pedidos WHERE id = ? FOR UPDATE", [id]);
      if (!filas.length) {
        await conexion.rollback();
        return false;
      }
      if (filas[0].estado !== estado) {
        const [items] = await conexion.query(
          "SELECT producto_id, cantidad, nombre_sabor FROM pedido_detalles WHERE pedido_id = ?",
          [id]
        );
        if (estado === "cancelado") await this.#devolverStock(conexion, items);
        else if (filas[0].estado === "cancelado") await this.#descontarStock(conexion, items);
      }
      await conexion.query("UPDATE pedidos SET estado = ? WHERE id = ?", [estado, id]);
      await conexion.commit();
      return true;
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }

  // Descuenta unidades del catálogo. Con un sabor sin control de inventario
  // (cantidad_disponible NULL) la consulta igual acierta la fila y no cambia
  // el número; si el sabor ya no tiene suficientes, no acierta ninguna fila y
  // aquí se corta todo con el error SIN_CUPO.
  static async #descontarStock(conexion, items) {
    for (const item of items) {
      if (item.producto_id == null) continue;
      const [movimiento] = await conexion.query(
        "UPDATE productos SET cantidad_disponible = IF(cantidad_disponible IS NULL, NULL, cantidad_disponible - ?) " +
          "WHERE id = ? AND (cantidad_disponible IS NULL OR cantidad_disponible >= ?)",
        [item.cantidad, item.producto_id, item.cantidad]
      );
      if (movimiento.affectedRows === 0) {
        const error = new Error(`Ya no quedan unidades suficientes de ${item.nombre_sabor}`);
        error.codigo = "SIN_CUPO";
        error.producto = item.nombre_sabor;
        throw error;
      }
    }
  }

  // Devuelve unidades al catálogo al cancelar un pedido. A un sabor sin control
  // de inventario no se le inventa un número: sigue horneándose bajo pedido.
  static async #devolverStock(conexion, items) {
    for (const item of items) {
      if (item.producto_id == null) continue;
      await conexion.query(
        "UPDATE productos SET cantidad_disponible = cantidad_disponible + ? WHERE id = ? AND cantidad_disponible IS NOT NULL",
        [item.cantidad, item.producto_id]
      );
    }
  }
}

module.exports = Pedido;
