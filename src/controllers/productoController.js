const Producto = require("../models/Producto");

class ProductoController {
  static async crear(req, res) {
    try {
      const { nombre_sabor, descripcion, precio_venta } = req.body;
      if (!nombre_sabor) return res.status(400).json({ error: "nombre_sabor es obligatorio" });
      const nuevoProducto = await Producto.crear({ nombre_sabor, descripcion, precio_venta });
      return res.status(201).json(nuevoProducto);
    } catch (error) {
      return res.status(500).json({ error: "Error al crear producto", detalle: error.message });
    }
  }

  static async listar(req, res) {
    try {
      const productos = await Producto.listarTodos();
      return res.json(productos);
    } catch (error) {
      return res.status(500).json({ error: "Error al listar productos", detalle: error.message });
    }
  }

  static async obtener(req, res) {
    try {
      const producto = await Producto.buscarPorId(req.params.id);
      if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
      return res.json(producto);
    } catch (error) {
      return res.status(500).json({ error: "Error al consultar producto", detalle: error.message });
    }
  }

  static async actualizar(req, res) {
    try {
      const existente = await Producto.buscarPorId(req.params.id);
      if (!existente) return res.status(404).json({ error: "Producto no encontrado" });
      const actualizado = await Producto.actualizar(req.params.id, req.body);
      return res.json(actualizado);
    } catch (error) {
      return res.status(500).json({ error: "Error al actualizar producto", detalle: error.message });
    }
  }

  static async eliminar(req, res) {
    try {
      const eliminado = await Producto.eliminar(req.params.id);
      if (!eliminado) return res.status(404).json({ error: "Producto no encontrado" });
      return res.json({ mensaje: "Producto eliminado correctamente" });
    } catch (error) {
      return res.status(500).json({ error: "Error al eliminar producto", detalle: error.message });
    }
  }
}

module.exports = ProductoController;