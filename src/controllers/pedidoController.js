const Pedido = require("../models/Pedido");
const Producto = require("../models/Producto");

const ESTADOS_VALIDOS = ["pendiente", "en_preparacion", "listo", "entregado", "cancelado"];

class PedidoController {
  // Crear un pedido (público: cualquier cliente puede pedir sin cuenta).
  // El total SIEMPRE se calcula aquí con los precios vigentes del catálogo,
  // nunca se acepta el precio que envíe el navegador.
  static async crear(req, res) {
    try {
      const { cliente_nombre, cliente_telefono, direccion, notas, items } = req.body;

      if (!cliente_nombre || !String(cliente_nombre).trim()) {
        return res.status(400).json({ error: "cliente_nombre es obligatorio" });
      }
      if (!cliente_telefono || !/^[0-9+\s-]{7,20}$/.test(String(cliente_telefono))) {
        return res.status(400).json({ error: "cliente_telefono debe ser un número de contacto válido (7 a 20 dígitos)" });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "El pedido debe incluir al menos un producto (items)" });
      }
      if (items.length > 30) {
        return res.status(400).json({ error: "El pedido no puede tener más de 30 líneas distintas" });
      }

      // Valida cada línea y arma el detalle con los precios reales del catálogo.
      const detalle = [];
      let total = 0;
      for (const item of items) {
        const cantidad = Number(item?.cantidad);
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) {
          return res.status(400).json({ error: "La cantidad de cada producto debe ser un entero entre 1 y 100" });
        }
        const producto = await Producto.buscarPorId(Number(item.producto_id));
        if (!producto) {
          return res.status(400).json({ error: `El producto con id ${item?.producto_id} no existe en el catálogo` });
        }
        const precio = Number(producto.precio_venta);
        total += precio * cantidad;
        detalle.push({
          producto_id: producto.id,
          nombre_sabor: producto.nombre_sabor,
          precio_unitario: precio,
          cantidad,
        });
      }

      const pedido = await Pedido.crear({
        usuario_id: req.usuario?.id ?? null,
        cliente_nombre: String(cliente_nombre).trim().slice(0, 100),
        cliente_telefono: String(cliente_telefono).trim(),
        direccion: direccion ? String(direccion).trim().slice(0, 255) : null,
        notas: notas ? String(notas).trim().slice(0, 500) : null,
        total,
        items: detalle,
      });
      return res.status(201).json(pedido);
    } catch (error) {
      return res.status(500).json({ error: "Error al crear el pedido", detalle: error.message });
    }
  }

  // Listado completo (con detalle) para el panel del administrador.
  static async listar(req, res) {
    try {
      const pedidos = await Pedido.listarTodos();
      return res.json(pedidos);
    } catch (error) {
      return res.status(500).json({ error: "Error al listar pedidos", detalle: error.message });
    }
  }

  static async obtener(req, res) {
    try {
      const pedido = await Pedido.buscarPorId(req.params.id);
      if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
      return res.json(pedido);
    } catch (error) {
      return res.status(500).json({ error: "Error al consultar pedido", detalle: error.message });
    }
  }

  static async actualizarEstado(req, res) {
    try {
      const { estado } = req.body;
      if (!ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });
      }
      const actualizado = await Pedido.actualizarEstado(req.params.id, estado);
      if (!actualizado) return res.status(404).json({ error: "Pedido no encontrado" });
      return res.json(await Pedido.buscarPorId(req.params.id));
    } catch (error) {
      return res.status(500).json({ error: "Error al actualizar el estado del pedido", detalle: error.message });
    }
  }
}

module.exports = PedidoController;
