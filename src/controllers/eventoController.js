const Evento = require("../models/Evento");
const errorInterno = require("../util/errorInterno");
const Producto = require("../models/Producto");

// Identificador de visita que manda el navegador. Se acepta solo si tiene la
// forma esperada: es un dato de medición, no una puerta de entrada para texto
// arbitrario.
const VISITA = /^[A-Za-z0-9]{8,16}$/;
const normalizarVisita = (valor) => (VISITA.test(String(valor ?? "")) ? String(valor) : null);

// Compara el secreto del cron en tiempo constante: una comparación normal
// filtra, por tiempos de respuesta, cuántos caracteres del secreto son correctos.
const crypto = require("crypto");
function secretoCoincide(cabecera, secreto) {
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(String(cabecera ?? ""));
  return recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado);
}

class EventoController {
  // Registrar un evento es público (el sitio mide sin pedir cuenta) y nunca
  // debe romperle la compra a nadie, pero tampoco acepta cualquier cosa: una
  // lista blanca de eventos y un tope de datos evitan que la tabla se ensucie.
  static async registrar(req, res) {
    try {
      const { evento, producto_id, cantidad } = req.body || {};
      if (!Evento.validos.includes(evento)) {
        return res.status(400).json({ error: `evento debe ser uno de: ${Evento.validos.join(", ")}` });
      }

      // Un sabor que no existe no puede tumbar la medición: se registra el
      // evento sin la referencia en vez de romper el INSERT por la llave.
      let idProducto = Number(producto_id);
      idProducto = Number.isInteger(idProducto) && idProducto > 0 ? idProducto : null;
      if (idProducto && !(await Producto.buscarPorId(idProducto))) idProducto = null;

      const n = Number(cantidad);
      await Evento.registrar({
        evento,
        visita: normalizarVisita(req.body?.visita),
        producto_id: idProducto,
        cantidad: Number.isInteger(n) && n > 0 && n <= 100 ? n : null,
      });
      return res.status(201).json({ registrado: true });
    } catch (error) {
      return errorInterno(res, "Error al registrar el evento", error);
    }
  }

  // Purga de retención llamada por el cron de Vercel (en Node normal lo hace
  // server.js). Solo responde con el secreto CRON_SECRET: sin él, no existe.
  static async purgarAntiguos(req, res) {
    const secreto = process.env.CRON_SECRET;
    if (!secreto || !secretoCoincide(req.headers.authorization, secreto)) {
      return res.status(404).json({ error: "Ruta no encontrada" });
    }
    try {
      const borrados = await Evento.purgarAntiguos(180);
      return res.json({ borrados });
    } catch (error) {
      return errorInterno(res, "Error al purgar eventos", error);
    }
  }

  // El resumen es del obrador, como el resto de la gestión.
  static async resumen(req, res) {
    try {
      const dias = Math.min(365, Math.max(1, Number(req.query.dias) || 30));
      return res.json(await Evento.resumen(dias));
    } catch (error) {
      return errorInterno(res, "Error al calcular el resumen", error);
    }
  }
}

module.exports = EventoController;
