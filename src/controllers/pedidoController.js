const Pedido = require("../models/Pedido");
const errorInterno = require("../util/errorInterno");
const Producto = require("../models/Producto");
const { descuentoDe, COMBOS } = require("../config/descuentos");
const { ENTREGAS, envioDe } = require("../config/envio");
const { notificarPedido } = require("../config/telegram");
const { cargoDeRango, RANGOS_DISTANCIA } = require("../config/distancia");
const { telefonoValido } = require("../util/telefono");

const ESTADOS_VALIDOS = ["pendiente", "en_preparacion", "listo", "entregado", "cancelado"];

const NOMBRE_SPECIAL = "Pixel Special Edition";

// Busca cuántos combos trae el pedido. Cada combo es `especiales` Special y
// `normales` galletas normales. Si el pedido trae exactamente esas galletas
// (ni más ni menos), devuelve los combos, sus unidades y el precio total de
// los combos. Si no, devuelve null y el pedido se cobra por sabor.
function detectarCombo(detalle) {
  const especiales = detalle.filter((d) => d.nombre_sabor === NOMBRE_SPECIAL);
  const normales = detalle.filter((d) => d.nombre_sabor !== NOMBRE_SPECIAL);
  const numEspeciales = especiales.reduce((s, d) => s + d.cantidad, 0);
  const numNormales = normales.reduce((s, d) => s + d.cantidad, 0);
  if (numEspeciales === 0) return null;

  // Mejor combo para el conjunto: el de mayor precio que cabe exactamente.
  // Con 3 Special y 3 normales se cobra el combo x3, no tres combos x1.
  let mejor = null;
  for (const combo of COMBOS) {
    if (numEspeciales % combo.especiales !== 0) continue;
    const veces = numEspeciales / combo.especiales;
    if (numNormales !== veces * combo.normales) continue;
    if (!mejor || combo.precio > mejor.precio) mejor = combo;
  }
  if (!mejor) return null;

  const veces = numEspeciales / mejor.especiales;
  const subtotalDetalle = especiales.reduce((s, d) => s + d.precio_unitario * d.cantidad, 0)
    + normales.reduce((s, d) => s + d.precio_unitario * d.cantidad, 0);
  return {
    precio: veces * mejor.precio,
    unidades: numEspeciales + numNormales,
    subtotalDetalle,
  };
}

class PedidoController {
  // Tabla de rangos de distancia, para que el formulario la muestre.
  static tarifasDistancia(req, res) {
    return res.json(
      Object.entries(RANGOS_DISTANCIA).map(([clave, r]) => ({ clave, etiqueta: r.etiqueta, costo: r.costo })),
    );
  }

  // Crear un pedido (público: cualquier cliente puede pedir sin cuenta).
  // El total SIEMPRE se calcula aquí con los precios vigentes del catálogo,
  // nunca se acepta el precio que envíe el navegador.
  static async crear(req, res) {
    try {
      const { cliente_nombre, cliente_telefono, direccion, entrega, notas, items, distancia } = req.body;
      // Visita anónima que cierra el embudo de la medición propia (misma forma
      // que valida el controlador de eventos). Si no viene, el pedido se guarda
      // igual: la medición nunca puede impedir una compra.
      const visita = /^[A-Za-z0-9]{8,16}$/.test(String(req.body.visita ?? "")) ? String(req.body.visita) : null;

      // Solo texto en los campos del cliente: un objeto o una lista llegaría como "[object Object]" o se guardaría mal.
      if ([cliente_nombre, cliente_telefono, direccion, notas, entrega].some((v) => v !== undefined && v !== null && typeof v !== "string")) {
        return res.status(400).json({ error: "Los datos del pedido deben ser texto" });
      }
      if (!cliente_nombre || !String(cliente_nombre).trim()) {
        return res.status(400).json({ error: "cliente_nombre es obligatorio" });
      }
      if (!telefonoValido(cliente_telefono)) {
        return res.status(400).json({ error: "cliente_telefono debe ser un número de contacto válido (7 a 15 dígitos)" });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "El pedido debe incluir al menos un producto (items)" });
      }
      // Forma de entrega: una de las tres que hay. Si el cliente no elige
      // (clientes viejos, o alguien que llama por teléfono), se asume
      // "recoger", que es gratis y no cambia el total.
      const formaEntrega = entrega ?? "recoger";
      if (!ENTREGAS[formaEntrega]) {
        return res.status(400).json({ error: `entrega debe ser una de: ${Object.keys(ENTREGAS).join(", ")}` });
      }
      // Un domicilio sin dirección no se puede servir, así que se pide aquí y
      // no cuando ya el obrador tenga las galletas horneadas.
      if (formaEntrega !== "recoger" && !(direccion && String(direccion).trim())) {
        return res.status(400).json({ error: "Para el domicilio necesitamos la dirección de entrega" });
      }
      if (items.length > 30) {
        return res.status(400).json({ error: "El pedido no puede tener más de 30 líneas distintas" });
      }

      // Valida cada línea y arma el detalle con los precios reales del catálogo.
      const detalle = [];
      let subtotal = 0;
      for (const item of items) {
        const cantidad = Number(item?.cantidad);
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) {
          return res.status(400).json({ error: "La cantidad de cada producto debe ser un entero entre 1 y 100" });
        }
        // Un entero de verdad: Number() convertiría true en 1, "1e2" en 100 o
        // [5] en 5, y el pedido saldría con un sabor que nadie eligió.
        const productoId = typeof item.producto_id === "string" && /^[0-9]+$/.test(item.producto_id)
          ? Number(item.producto_id)
          : item.producto_id;
        if (!Number.isSafeInteger(productoId) || productoId < 1) {
          return res.status(400).json({ error: "producto_id debe ser un entero positivo" });
        }
        const producto = await Producto.buscarPorId(productoId);
        if (!producto) {
          return res.status(400).json({ error: `El producto con id ${item?.producto_id} no existe en el catálogo` });
        }
        // Inventario: un sabor agotado (0 unidades) no se puede pedir, y no se
        // puede pedir más de lo que queda. El modelo vuelve a comprobarlo
        // dentro de la transacción, porque entre esta validación y el INSERT
        // otro cliente puede haber comprado las últimas unidades.
        if (!producto.disponible) {
          return res.status(409).json({ error: `El sabor ${producto.nombre_sabor} está agotado por ahora` });
        }
        if (producto.cantidad_disponible !== null && cantidad > producto.cantidad_disponible) {
          const quedan = producto.cantidad_disponible;
          return res.status(409).json({
            error: `De ${producto.nombre_sabor} solo quedan ${quedan} ${quedan === 1 ? "unidad" : "unidades"}`,
          });
        }
        const precio = Number(producto.precio_venta);
        subtotal += precio * cantidad;
        detalle.push({
          producto_id: producto.id,
          nombre_sabor: producto.nombre_sabor,
          precio_unitario: precio,
          cantidad,
        });
      }

      // El descuento por volumen se aplica aquí, sobre la cantidad total de
      // galletas del pedido, y no en el navegador: el cliente puede calcularlo
      // mal (o saltárselo) y el pedido guardado tiene que ser el correcto.
      const unidades = detalle.reduce((suma, d) => suma + d.cantidad, 0);
      // Combos Pixel Special Edition: el combo cobra su precio fijo y no entra
      // al descuento por volumen. Solo se aplica si las galletas del pedido
      // coinciden exactamente con un combo (la Special y las normales).
      const combo = detectarCombo(detalle);
      const subtotalSueltas = combo ? subtotal - combo.subtotalDetalle : subtotal;
      const unidadesSueltas = combo ? unidades - combo.unidades : unidades;
      const { porcentaje, valor: descuentoSueltas, total: totalSueltas } = descuentoDe(unidadesSueltas, subtotalSueltas);
      const descuento = descuentoSueltas;
      const totalGalletas = totalSueltas + (combo ? combo.precio : 0);

      // El domicilio también se calcula aquí y nunca se acepta el precio que
      // mande el navegador: recoger es gratis siempre, cada zona tiene su
      // costo y desde 12 galletas el envío sale gratis (ver
      // src/config/envio.js, que es la misma tabla que usa el carrito).
      // Con domicilio y sin galletas gratis, se suma el cargo del rango de
      // distancia que eligió el cliente (src/config/distancia.js).
      const envioZona = envioDe(unidades, formaEntrega);
      let envioDistancia = 0;
      if (formaEntrega !== "recoger" && envioZona > 0) {
        const costoRango = cargoDeRango(distancia);
        if (costoRango === null) {
          return res.status(400).json({ error: "Elige la distancia del domicilio" });
        }
        envioDistancia = costoRango;
      }
      const envio = envioZona + envioDistancia;
      const total = totalGalletas + envio;

      const pedido = await Pedido.crear({
        usuario_id: req.usuario?.id ?? null,
        cliente_nombre: String(cliente_nombre).trim().slice(0, 100),
        cliente_telefono: String(cliente_telefono).trim(),
        direccion: direccion ? String(direccion).trim().slice(0, 255) : null,
        entrega: formaEntrega,
        envio,
        notas: notas ? String(notas).trim().slice(0, 500) : null,
        total,
        descuento,
        visita,
        items: detalle,
      });
      // El aviso al obrador va después de guardar el pedido y nunca puede
      // tumbarlo: notificarPedido no lanza (si Telegram falla, queda en los
      // registros del servidor y el cliente igual recibe su pedido).
      await notificarPedido(pedido);
      return res.status(201).json({ ...pedido, descuento, descuento_porcentaje: porcentaje, envio });
    } catch (error) {
      // El inventario se agotó entre la validación y el guardado: se le
      // explica al cliente con precisión en vez de un error genérico.
      if (error.codigo === "SIN_CUPO") {
        return res.status(409).json({
          error: `Alguien se adelantó con ${error.producto}: ya no quedan unidades suficientes. Revisa tu carrito e inténtalo de nuevo.`,
        });
      }
      return errorInterno(res, "Error al crear el pedido", error);
    }
  }

  // Consulta pública del estado del pedido: sin cuenta, con el número del
  // pedido y el teléfono con el que se hizo. Va en POST con los datos en el
  // cuerpo (nunca en la URL: el teléfono no tiene por qué quedar en el
  // historial del navegador ni en los registros del servidor).
  static async consultarEstado(req, res) {
    const id = Number(req.body.id);
    const telefono = String(req.body.telefono ?? "");
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Falta el número de pedido" });
    }
    if (!telefonoValido(telefono)) {
      return res.status(400).json({ error: "telefono debe ser un número de contacto válido (7 a 15 dígitos)" });
    }
    try {
      const pedido = await Pedido.buscarPublico(id, telefono);
      // Mismo mensaje con y sin coincidencia: no se revela si el número existe.
      if (!pedido) {
        return res.status(404).json({
          error: "No encontramos un pedido con ese número y teléfono. Revisa el número de pedido y el teléfono con el que pediste.",
        });
      }
      return res.json(pedido);
    } catch (error) {
      return errorInterno(res, "Error al consultar el pedido", error);
    }
  }

  // Listado completo (con detalle) para el panel del administrador.
  static async listar(req, res) {
    try {
      // ?pagina=1&limite=50 (límite máximo 100). Valores no válidos vuelven al predeterminado.
      const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
      const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 50));
      const pedidos = await Pedido.listarTodos({ limite, pagina });
      return res.json(pedidos);
    } catch (error) {
      return errorInterno(res, "Error al listar pedidos", error);
    }
  }

  static async obtener(req, res) {
    try {
      const pedido = await Pedido.buscarPorId(req.params.id);
      if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
      return res.json(pedido);
    } catch (error) {
      return errorInterno(res, "Error al consultar pedido", error);
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
      // Reactivar un pedido cancelado reserva otra vez sus galletas: si el
      // obrador ya vendió esas unidades, el cambio de estado no se aplica.
      if (error.codigo === "SIN_CUPO") {
        return res.status(409).json({
          error: `No se puede reactivar: ya no quedan unidades suficientes de ${error.producto}`,
        });
      }
      return errorInterno(res, "Error al actualizar el estado del pedido", error);
    }
  }
}

module.exports = PedidoController;
