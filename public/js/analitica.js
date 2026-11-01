import { ApiClient, Sesion } from "./api.js";
import { escucharGlobal } from "./registro-global.js";

// ============================================================================
// Medición propia del sitio
// ----------------------------------------------------------------------------
// El sitio cuenta sus propios eventos y los manda a esta misma API, que los
// guarda en la base del obrador. Sin cookies, sin servicios de terceros y sin
// datos de personas: `visita` es un número al azar que vive en sessionStorage
// (muere al cerrar la pestaña) y sirve solo para unir los pasos de UNA visita.
// Se mide: qué sabores se ven, cuáles se agregan al carrito, cuándo se empieza a
// llenar el pedido y —contra la tabla de pedidos, que es la que manda— dónde se
// abandona.
// ============================================================================
const CLAVE_VISITA = "pixel_galletas_visita";

const pesos = (n) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// Identificador de la visita en curso. Devuelve null si el navegador no deja
// recordarlo (sin almacén o en modo privado estricto): sin dónde guardarlo cada
// evento tendría un número distinto y no se podrían unir los pasos de una misma
// visita. Cuando eso pasa se pierde el dato, nunca la compra.
export function idVisita(almacen = globalThis.sessionStorage) {
  if (!almacen) return null;
  try {
    const guardada = almacen.getItem(CLAVE_VISITA);
    if (guardada) return guardada;
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
    const nueva = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    almacen.setItem(CLAVE_VISITA, nueva);
    return nueva;
  } catch {
    return null;
  }
}

export class Medicion {
  // Estos eventos se cuentan una sola vez por visita: una tarjeta que vuelve a
  // entrar en pantalla al filtrar, o un formulario que se toca cinco veces, no
  // son cinco visitas distintas.
  static #UNA_VEZ = new Set(["sabor_visto", "checkout_iniciado"]);

  constructor(cliente = new ApiClient()) {
    this.cliente = cliente;
    this.yaEnviados = new Set();
  }

  // Manda un evento. Nunca interrumpe la compra: si la API falla se pierde el
  // dato de medición y nada más (el catch vacío es la decisión, no un descuido).
  registrar(evento, datos = {}) {
    const clave = `${evento}:${datos.producto_id ?? ""}`;
    if (Medicion.#UNA_VEZ.has(evento) && this.yaEnviados.has(clave)) return;
    this.yaEnviados.add(clave);
    const visita = idVisita();
    const cuerpo = { evento, ...datos };
    if (visita) cuerpo.visita = visita;
    this.cliente.post("/eventos", cuerpo).catch(() => {});
  }
}

// Vista del panel: el resumen de lo que mira la gente (solo admin).
// Se exporta para poder probar el pintado sin navegador.
export class ResumenVista {
  constructor(cliente = new ApiClient()) {
    this.cliente = cliente;
    this.$ = (id) => document.getElementById(id);
    escucharGlobal("analitica:sesion", "sesion-cambio", () => this.actualizar());
    this.actualizar();
  }

  get esAdmin() {
    return Sesion.obtener()?.usuario?.rol === "admin";
  }

  async actualizar() {
    const seccion = this.$("seccion-analitica");
    if (!seccion) return; // en las pruebas del módulo no hay página
    seccion.hidden = !this.esAdmin;
    if (!this.esAdmin) return;
    try {
      this.pintar(await this.cliente.get("/eventos/resumen"));
    } catch (error) {
      this.$("mensaje-analitica").textContent = error.message;
    }
  }

  pintar(resumen) {
    this.$("mensaje-analitica").textContent = "";
    const e = resumen.embudo;
    this.$("resumen-analitica").textContent =
      `Últimos ${resumen.dias} días · ${e.visitas_que_agregaron} visitas agregaron al carrito · ` +
      `${e.visitas_que_confirmaron} confirmaron un pedido (abandono ${e.abandono}%) · ` +
      `${resumen.pedidos.cantidad} pedidos por ${pesos(resumen.pedidos.dinero)}`;

    const lista = this.$("lista-analitica");
    lista.replaceChildren();
    if (!resumen.sabores.length) {
      const vacio = document.createElement("li");
      vacio.className = "producto";
      vacio.textContent = "Todavía no hay medición: entra al catálogo y mira algunos sabores.";
      lista.append(vacio);
      return;
    }
    for (const sabor of resumen.sabores) {
      const li = document.createElement("li");
      li.className = "producto";
      const info = document.createElement("div");
      const nombre = document.createElement("strong");
      nombre.textContent = sabor.nombre;
      const detalle = document.createElement("small");
      detalle.textContent = `${sabor.vistos} ${sabor.vistos === 1 ? "visita" : "visitas"} lo vieron · ` +
        `${sabor.agregados} ${sabor.agregados === 1 ? "vez" : "veces"} al carrito`;
      info.append(nombre, document.createElement("br"), detalle);
      li.append(info);
      lista.append(li);
    }
  }
}

// Solo arrancan cuando existe la página (así el módulo se puede probar sin navegador).
if (typeof document !== "undefined") {
  const medicion = new Medicion();
  // Las tarjetas avisan cuando entran en pantalla (las revela productos.js).
  escucharGlobal("analitica:sabor-visto", "sabor-visto", (e) => medicion.registrar("sabor_visto", { producto_id: e.detail?.id }));
  // Agregar al carrito se cuenta cada vez: interesa cuánto se agrega, y el
  // embudo usa visitas distintas, así que no se infla por repetir clics.
  escucharGlobal("analitica:agregar-al-carrito", "agregar-al-carrito", (e) =>
    medicion.registrar("carrito_agregar", { producto_id: e.detail?.id, cantidad: 1 })
  );
  // Tocar los datos de entrega es la señal de que el pedido va en serio.
  document.getElementById("form-pedido")?.addEventListener("focusin", () => medicion.registrar("checkout_iniciado"));
  new ResumenVista();
}
