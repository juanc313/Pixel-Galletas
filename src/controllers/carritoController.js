const pool = require("../config/db");
const errorInterno = require("../util/errorInterno");
const Carrito = require("../models/Carrito");

const TOPE_LINEA = 100; // mismo tope que el resto de la API

class CarritoController {
  static async obtener(req, res) {
    try {
      const filas = await Carrito.obtenerPorUsuario(req.usuario.id);
      res.set("Cache-Control", "no-store"); // datos personales: nunca en caché
      return res.json(filas);
    } catch (error) {
      return errorInterno(res, "Error al obtener el carrito", error);
    }
  }

  // Cuerpo: { items: [{ producto_id, cantidad }] }. Reemplaza el carrito entero.
  static async reemplazar(req, res) {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length > 50) {
        return res.status(400).json({ error: "items debe ser una lista de hasta 50 sabores" });
      }

      // Se agrupa por sabor: si llega repetido, se suman las cantidades.
      const pedido = new Map();
      for (const item of items) {
        const id = Number(item?.producto_id);
        const cantidad = Number(item?.cantidad);
        if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(cantidad) || cantidad < 1) {
          return res.status(400).json({ error: "Cada sabor necesita producto_id y una cantidad entera mayor que 0" });
        }
        pedido.set(id, (pedido.get(id) || 0) + cantidad);
      }

      const lineas = [];
      for (const [producto_id, pedidoCantidad] of pedido) {
        const [filas] = await pool.query(
          "SELECT cantidad_disponible FROM productos WHERE id = ?",
          [producto_id]
        );
        if (!filas.length) continue; // sabor que ya no existe: se descarta
        const disponible = filas[0].cantidad_disponible;
        if (disponible === 0) continue; // agotado: no entra al carrito
        const tope = disponible === null ? TOPE_LINEA : Math.min(TOPE_LINEA, disponible);
        lineas.push({ producto_id, cantidad: Math.min(tope, pedidoCantidad) });
      }

      await Carrito.reemplazar(req.usuario.id, lineas);
      res.set("Cache-Control", "no-store");
      return CarritoController.obtener(req, res);
    } catch (error) {
      return errorInterno(res, "Error al guardar el carrito", error);
    }
  }
}

module.exports = CarritoController;
