const Producto = require("../models/Producto");
const errorInterno = require("../util/errorInterno");

// Lee el inventario que llega del panel: "" o null = sin control de inventario
// (el sabor se hornea bajo pedido), 0 = agotado, N = unidades que quedan.
// `undefined` significa que la petición no habla del inventario (por ejemplo,
// una edición que solo cambia el precio) y entonces no se toca nada.
function leerDisponibilidad(valor) {
  if (valor === undefined) return { definido: false };
  if (valor === null || valor === "") return { definido: true, valor: null };
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0 || numero > 9999) return { definido: true, invalido: true };
  return { definido: true, valor: numero };
}

// El precio lo fija el obrador, pero un valor negativo, vacío o texto rompería
// el total de los pedidos. Se acepta solo un número positivo y razonable.
const PRECIO_INVALIDO = "precio_venta debe ser un número mayor que 0 y menor de 1.000.000";
function precioValido(valor) {
  if (typeof valor !== "number" && typeof valor !== "string") return false;
  const n = Number(valor);
  return valor !== "" && Number.isFinite(n) && n > 0 && n < 1000000;
}

const ERROR_DISPONIBILIDAD =
  "cantidad_disponible debe ser un entero entre 0 y 9999, o vacío para no llevar inventario";

class ProductoController {
  static async crear(req, res) {
    try {
      const { nombre_sabor, descripcion, precio_venta } = req.body;
      if (!nombre_sabor || typeof nombre_sabor !== "string") return res.status(400).json({ error: "nombre_sabor es obligatorio y debe ser texto" });
      if (!precioValido(precio_venta)) return res.status(400).json({ error: PRECIO_INVALIDO });
      const disponible = leerDisponibilidad(req.body.cantidad_disponible);
      if (disponible.invalido) return res.status(400).json({ error: ERROR_DISPONIBILIDAD });
      const nuevoProducto = await Producto.crear({
        nombre_sabor, descripcion, precio_venta, cantidad_disponible: disponible.valor,
      });
      return res.status(201).json(nuevoProducto);
    } catch (error) {
      return errorInterno(res, "Error al crear producto", error);
    }
  }

  static async listar(req, res) {
    try {
      const productos = await Producto.listarTodos();
      return res.json(productos);
    } catch (error) {
      return errorInterno(res, "Error al listar productos", error);
    }
  }

  static async obtener(req, res) {
    try {
      const producto = await Producto.buscarPorId(req.params.id);
      if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
      return res.json(producto);
    } catch (error) {
      return errorInterno(res, "Error al consultar producto", error);
    }
  }

  static async actualizar(req, res) {
    try {
      const existente = await Producto.buscarPorId(req.params.id);
      if (!existente) return res.status(404).json({ error: "Producto no encontrado" });
      const disponible = leerDisponibilidad(req.body.cantidad_disponible);
      if (disponible.invalido) return res.status(400).json({ error: ERROR_DISPONIBILIDAD });
      if (req.body.nombre_sabor !== undefined && typeof req.body.nombre_sabor !== "string") {
        return res.status(400).json({ error: "nombre_sabor debe ser texto" });
      }
      if (req.body.precio_venta !== undefined && !precioValido(req.body.precio_venta)) {
        return res.status(400).json({ error: PRECIO_INVALIDO });
      }
      const actualizado = await Producto.actualizar(req.params.id, req.body);
      // El inventario va en su propia consulta: así una edición del precio no
      // borra las unidades que el obrador tenía contadas.
      if (disponible.definido) {
        return res.json(await Producto.actualizarDisponibilidad(req.params.id, disponible.valor));
      }
      return res.json(actualizado);
    } catch (error) {
      return errorInterno(res, "Error al actualizar producto", error);
    }
  }

  static async eliminar(req, res) {
    try {
      const eliminado = await Producto.eliminar(req.params.id);
      if (!eliminado) return res.status(404).json({ error: "Producto no encontrado" });
      return res.json({ mensaje: "Producto eliminado correctamente" });
    } catch (error) {
      return errorInterno(res, "Error al eliminar producto", error);
    }
  }
}

module.exports = ProductoController;