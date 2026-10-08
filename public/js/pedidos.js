import { ApiClient, Sesion } from "./api.js";
import { CONTACTO, urlWhatsApp } from "./config.js";

// Etiquetas legibles de los estados del pedido.
export const ESTADOS = {
  pendiente: "Pendiente",
  en_preparacion: "En preparación",
  listo: "Listo para entregar",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const pesos = (n) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// Carrito de compras: guarda en el navegador qué quiere comprar el cliente.
// Se persiste en localStorage para que no se pierda si recargan la página.
export class Carrito {
  static CLAVE = "pixel_galletas_carrito";

  constructor() {
    this.items = this.#recuperar();
  }

  #recuperar() {
    try {
      const datos = JSON.parse(localStorage.getItem(Carrito.CLAVE));
      return Array.isArray(datos) ? datos : [];
    } catch {
      return [];
    }
  }

  #guardar() {
    try {
      localStorage.setItem(Carrito.CLAVE, JSON.stringify(this.items));
    } catch {
      /* sin localStorage el carrito solo vive en memoria */
    }
    window.dispatchEvent(new Event("carrito-cambio"));
  }

  // producto: { id, nombre, precio }
  agregar(producto) {
    const existente = this.items.find((i) => i.producto_id === producto.id);
    if (existente) {
      if (existente.cantidad >= 100) return;
      existente.cantidad += 1;
    } else {
      this.items.push({ producto_id: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: 1 });
    }
    this.#guardar();
  }

  cambiarCantidad(id, cantidad) {
    const item = this.items.find((i) => i.producto_id === id);
    if (!item) return;
    if (cantidad < 1) return this.quitar(id);
    item.cantidad = Math.min(100, cantidad);
    this.#guardar();
  }

  quitar(id) {
    this.items = this.items.filter((i) => i.producto_id !== id);
    this.#guardar();
  }

  vaciar() {
    this.items = [];
    this.#guardar();
  }

  get total() {
    return this.items.reduce((suma, i) => suma + i.precio * i.cantidad, 0);
  }

  get cantidadTotal() {
    return this.items.reduce((suma, i) => suma + i.cantidad, 0);
  }

  // Formato que espera la API: [{ producto_id, cantidad }]
  paraApi() {
    return this.items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad }));
  }
}

// Modelo: un pedido recibido de la API.
export class Pedido {
  constructor({ id, cliente_nombre, cliente_telefono, direccion, notas, total, estado, creado_en, detalles }) {
    this.id = id;
    this.clienteNombre = cliente_nombre;
    this.clienteTelefono = cliente_telefono;
    this.direccion = direccion;
    this.notas = notas;
    this.total = Number(total);
    this.estado = estado;
    this.creadoEn = creado_en;
    this.detalles = (detalles || []).map((d) => ({
      nombre: d.nombre_sabor,
      precio: Number(d.precio_unitario),
      cantidad: d.cantidad,
    }));
  }
  get estadoTexto() { return ESTADOS[this.estado] || this.estado; }
  get fecha() { return new Date(this.creadoEn).toLocaleString("es-CO"); }
  get resumen() {
    return this.detalles.map((d) => `${d.cantidad} × ${d.nombre}`).join(", ");
  }
}

// Servicio: pedidos contra la API.
export class PedidoServicio {
  constructor(api) { this.api = api; }
  crear(datos) { return this.api.post("/pedidos", datos); }
  listar() { return this.api.get("/pedidos"); }
  cambiarEstado(id, estado) { return this.api.put(`/pedidos/${id}/estado`, { estado }); }
}

// Texto del pedido para enviarlo por WhatsApp.
export function textoPedido(pedido) {
  const lineas = [
    `*¡Nuevo pedido Pixel Galletas!* #${pedido.id}`,
    "",
    `*Cliente:* ${pedido.clienteNombre}`,
    `*Teléfono:* ${pedido.clienteTelefono}`,
  ];
  if (pedido.direccion) lineas.push(`*Dirección:* ${pedido.direccion}`);
  lineas.push("", "*Pedido:*");
  for (const d of pedido.detalles) lineas.push(`• ${d.cantidad} × ${d.nombre} — ${pesos(d.precio * d.cantidad)}`);
  lineas.push("", `*Total:* ${pesos(pedido.total)}`);
  if (pedido.notas) lineas.push(`*Notas:* ${pedido.notas}`);
  lineas.push("", "_Enviado desde la web de Pixel Galletas_");
  return lineas.join("\n");
}

// Vista del cliente: carrito, formulario de pedido y confirmación con WhatsApp.
class PedidoVista {
  constructor(servicio, carrito) {
    this.servicio = servicio;
    this.carrito = carrito;
    this.$ = (id) => document.getElementById(id);
    this.$("form-pedido").addEventListener("submit", (e) => this.enviar(e));
    this.$("btn-vaciar-carrito").addEventListener("click", () => this.carrito.vaciar());
    this.$("lista-carrito").addEventListener("click", (e) => this.accionesCarrito(e));
    window.addEventListener("carrito-cambio", () => this.pintarCarrito());
    window.addEventListener("agregar-al-carrito", (e) => this.carrito.agregar(e.detail));
    window.addEventListener("sesion-cambio", () => this.prefill());
    this.prefill();
    this.pintarCarrito();
  }

  mensaje(texto, esError = true) {
    const p = this.$("mensaje-pedido");
    p.textContent = texto;
    p.classList.toggle("ok", !esError);
  }

  // Si hay sesión iniciada, rellena nombre y teléfono del formulario.
  prefill() {
    const u = Sesion.obtener()?.usuario;
    if (u) {
      if (!this.$("pedido-nombre").value) this.$("pedido-nombre").value = u.nombre;
      if (u.correo && !this.$("pedido-telefono").value) this.$("pedido-telefono").placeholder = "Tu número con WhatsApp";
    }
  }

  pintarCarrito() {
    this.$("carrito-contador").textContent = this.carrito.cantidadTotal;
    const lista = this.$("lista-carrito");
    lista.replaceChildren();
    for (const item of this.carrito.items) {
      const li = document.createElement("li");
      li.className = "item-carrito";
      const nombre = document.createElement("strong");
      nombre.textContent = item.nombre;
      const precio = document.createElement("span");
      precio.textContent = pesos(item.precio * item.cantidad);
      const controles = document.createElement("div");
      controles.className = "controles";
      const menos = this.#boton("−", "Quitar uno", item.producto_id, "menos");
      const cantidad = document.createElement("span");
      cantidad.textContent = item.cantidad;
      const mas = this.#boton("+", "Agregar uno", item.producto_id, "mas");
      const fuera = this.#boton("×", "Quitar del carrito", item.producto_id, "quitar");
      controles.append(menos, cantidad, mas, fuera);
      li.append(nombre, precio, controles);
      lista.append(li);
    }
    this.$("carrito-total").textContent = pesos(this.carrito.total);
    this.$("vacio").hidden = this.carrito.items.length > 0;
    this.$("btn-pedir").disabled = this.carrito.items.length === 0;
  }

  #boton(texto, titulo, id, accion) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = texto;
    b.title = titulo;
    b.dataset.accion = accion;
    b.dataset.id = id;
    return b;
  }

  accionesCarrito(e) {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    const id = Number(b.dataset.id);
    const item = this.carrito.items.find((i) => i.producto_id === id);
    if (!item) return;
    if (b.dataset.accion === "mas") this.carrito.cambiarCantidad(id, item.cantidad + 1);
    else if (b.dataset.accion === "menos") this.carrito.cambiarCantidad(id, item.cantidad - 1);
    else if (b.dataset.accion === "quitar") this.carrito.quitar(id);
  }

  async enviar(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!this.carrito.items.length) return this.mensaje("Tu carrito está vacío: agrega galletas primero.");

    const datos = {
      cliente_nombre: String(f.get("nombre") || "").trim(),
      cliente_telefono: String(f.get("telefono") || "").trim(),
      direccion: String(f.get("direccion") || "").trim() || undefined,
      notas: String(f.get("notas") || "").trim() || undefined,
      items: this.carrito.paraApi(),
    };

    try {
      const pedido = await this.servicio.crear(datos);
      this.carrito.vaciar();
      e.target.reset();
      this.prefill();
      this.#confirmar(new Pedido(pedido));
    } catch (error) {
      this.mensaje(error.message);
      if (error.message.includes("Token")) window.dispatchEvent(new Event("sesion-vencida"));
    }
  }

  #confirmar(pedido) {
    this.mensaje(`¡Pedido #${pedido.id} registrado! Total ${pesos(pedido.total)}. Te esperamos.`, false);
    const enlace = this.$("btn-whatsapp-pedido");
    enlace.href = urlWhatsApp(textoPedido(pedido));
    this.$("confirmacion").hidden = false;
    this.$("confirmacion").scrollIntoView({ behavior: "smooth" });
  }
}

// Vista del administrador: lista de pedidos y cambio de estado.
class PedidosAdminVista {
  constructor(servicio) {
    this.servicio = servicio;
    this.pedidos = [];
    this.$ = (id) => document.getElementById(id);
    this.$("lista-pedidos").addEventListener("change", (e) => this.cambiarEstado(e));
    window.addEventListener("sesion-cambio", () => this.alCambiarSesion());
    this.alCambiarSesion();
  }

  get esAdmin() { return Sesion.obtener()?.usuario?.rol === "admin"; }

  mensaje(texto, esError = true) {
    const p = this.$("mensaje-pedidos");
    p.textContent = texto;
    p.classList.toggle("ok", !esError);
  }

  alCambiarSesion() {
    this.$("seccion-pedidos-admin").hidden = !this.esAdmin;
    if (this.esAdmin) this.cargar();
    else {
      this.pedidos = [];
      this.$("lista-pedidos").replaceChildren();
      this.mensaje("");
    }
  }

  async cargar() {
    try {
      this.pedidos = (await this.servicio.listar()).map((p) => new Pedido(p));
      this.pintar();
    } catch (error) { this.mensaje(error.message); }
  }

  pintar() {
    const lista = this.$("lista-pedidos");
    lista.replaceChildren();
    for (const p of this.pedidos) {
      const li = document.createElement("li");
      li.className = "producto";
      const info = document.createElement("div");
      const titulo = document.createElement("strong");
      titulo.textContent = `#${p.id} · ${p.clienteNombre} · ${pesos(p.total)}`;
      const detalle = document.createElement("small");
      detalle.textContent = `${p.resumen} — ${p.clienteTelefono}${p.direccion ? " — " + p.direccion : ""} — ${p.fecha}`;
      info.append(titulo, document.createElement("br"), detalle);

      const selector = document.createElement("select");
      selector.dataset.id = p.id;
      selector.setAttribute("aria-label", `Estado del pedido ${p.id}`);
      for (const [valor, texto] of Object.entries(ESTADOS)) {
        const o = document.createElement("option");
        o.value = valor;
        o.textContent = texto;
        o.selected = p.estado === valor;
        selector.append(o);
      }
      li.append(info, selector);
      lista.append(li);
    }
  }

  async cambiarEstado(e) {
    const select = e.target.closest("select[data-id]");
    if (!select) return;
    try {
      await this.servicio.cambiarEstado(Number(select.dataset.id), select.value);
      this.mensaje("Estado actualizado.", false);
      await this.cargar();
    } catch (error) {
      this.mensaje(error.message);
      await this.cargar();
    }
  }
}

// Solo arrancan cuando existe la página (así los módulos también se prueban sin navegador).
if (typeof document !== "undefined") {
  new PedidoVista(new PedidoServicio(new ApiClient()), new Carrito());
  new PedidosAdminVista(new PedidoServicio(new ApiClient()));
}
