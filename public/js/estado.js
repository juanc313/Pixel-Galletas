import { ApiClient } from "./api.js";
import { ENTREGAS, ESTADOS, pesos } from "./pedidos.js";

// ============================================================================
// Estado del pedido, público
// ----------------------------------------------------------------------------
// El cliente pone el número de pedido y el teléfono con el que lo hizo: no
// necesita cuenta ni registro. El servidor exige los dos datos y devuelve solo
// el estado, la fecha, el total y lo pedido (nunca el nombre, la dirección ni
// el teléfono de quien pidió), así que adivinar el número no sirve de nada.
// ============================================================================
// Se exporta para poder probar el pintado sin navegador.
export class EstadoVista {
  constructor(servicio = new ApiClient()) {
    this.servicio = servicio;
    this.$ = (id) => document.getElementById(id);
    this.$("form-estado").addEventListener("submit", (e) => this.consultar(e));
    // El enlace puede llegar con el número ya puesto (#estado o ?pedido=12),
    // que es como se comparte desde la confirmación del pedido.
    const param = new URLSearchParams(globalThis.location?.search ?? "").get("pedido");
    if (param) {
      const campo = this.$("estado-id");
      campo.value = String(param).replace(/\D/g, "");
      this.$("form-estado").requestSubmit();
    }
  }

  mensaje(texto, esError = true) {
    const p = this.$("mensaje-estado");
    p.textContent = texto;
    p.classList.toggle("ok", !esError);
  }

  async consultar(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const id = String(f.get("id") || "").trim();
    const telefono = String(f.get("telefono") || "").trim();
    this.$("estado-resultado").hidden = true;
    if (!id || !telefono) return this.mensaje("Pon el número de pedido y el teléfono con el que pediste.");
    try {
      // POST con los datos en el cuerpo: si el teléfono fuera un parámetro de
      // la URL, quedaría en el historial del navegador y en los registros del
      // servidor. Aquí solo viaja en la petición.
      const pedido = await this.servicio.post("/pedidos/estado", { id, telefono });
      this.mensaje("", false);
      this.pintar(pedido);
    } catch (error) {
      this.mensaje(error.message);
    }
  }

  pintar(pedido) {
    const caja = this.$("estado-resultado");
    caja.replaceChildren();

    const titulo = document.createElement("p");
    titulo.className = "estado-nombre";
    const estado = ESTADOS[pedido.estado] || pedido.estado;
    titulo.textContent = `Pedido #${pedido.id} · ${estado}`;
    caja.append(titulo);

    const meta = document.createElement("p");
    meta.className = "estado-meta";
    const fecha = new Date(pedido.creado_en).toLocaleString("es-CO");
    const unidades = pedido.detalles.reduce((suma, d) => suma + d.cantidad, 0);
    // Cómo llega el pedido (recoger o domicilio, y cuánto costó el envío): el
    // cliente lo ve sin tener que preguntar por WhatsApp. La etiqueta corta no
    // repite datos de nadie: aquí no puede colarse ni un nombre ni una dirección.
    const partes = [fecha, `${unidades} ${unidades === 1 ? "galleta" : "galletas"}`, pesos(pedido.total)];
    const zona = ENTREGAS[pedido.entrega];
    if (zona) partes.push(pedido.envio > 0 ? `${zona.corto} · envío ${pesos(pedido.envio)}` : zona.corto);
    meta.textContent = partes.join(" · ");
    caja.append(meta);

    const lista = document.createElement("ul");
    for (const detalle of pedido.detalles) {
      const li = document.createElement("li");
      li.textContent = `${detalle.cantidad} × ${detalle.nombre_sabor}`;
      lista.append(li);
    }
    caja.append(lista);

    // Lo siguiente según el estado: el cliente siempre sabe qué viene ahora.
    const siguiente = {
      pendiente: "Estamos revisando tu pedido; te escribimos por WhatsApp para confirmar.",
      en_preparacion: "Ya está en el horno. Te avisamos cuando esté listo para la entrega.",
      listo: "Listo para entregar: te contactamos para acordar la hora.",
      entregado: "¡Ya lo entregamos! Gracias por pedir con nosotros.",
      cancelado: "Este pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp.",
    }[pedido.estado] || "";
    const nota = document.createElement("p");
    nota.className = "estado-siguiente";
    nota.textContent = siguiente;
    caja.append(nota);

    caja.hidden = false;
  }
}

// Solo arrancan cuando existe la página (así el módulo se puede probar sin navegador).
if (typeof document !== "undefined") new EstadoVista();
