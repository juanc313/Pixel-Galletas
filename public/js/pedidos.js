import { ApiClient, Sesion } from "./api.js";
import { CONTACTO, urlWhatsApp } from "./config.js";
import { idVisita } from "./analitica.js";

// Etiquetas legibles de los estados del pedido.
export const ESTADOS = {
  pendiente: "Pendiente",
  en_preparacion: "En preparación",
  listo: "Listo para entregar",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const pesos = (n) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// Descuentos por volumen: la misma escalera que aplica el servidor al guardar
// el pedido (src/config/descuentos.js). Aquí es solo para calcular el total en
// vivo; hay una prueba que compara las dos listas para que no se separen.
// Cuentan las galletas TOTALES del pedido, no las de cada sabor.
export const DESCUENTOS = [
  { desde: 12, porcentaje: 5 },
  { desde: 24, porcentaje: 8 },
  { desde: 48, porcentaje: 10 },
];

// Formas de entrega: la MISMA tabla que aplica el servidor al guardar el
// pedido (src/config/envio.js). El navegador la usa para mostrar el total antes
// de pedir; el que se guarda siempre lo calcula el servidor. Hay una prueba que
// compara las dos listas para que no se separen con el tiempo.
//
//   recoger    → recoger en Ceiba 2, gratis siempre
//   cucuta     → domicilio en Cúcuta, $5.000
//   municipios → Villa del Rosario, Los Patios o El Zulia, $7.000
// Y desde 12 galletas el domicilio sale gratis, en cualquier zona.
export const ENTREGAS = {
  recoger: { nombre: "Recoger en Ceiba 2", corto: "Recoges en el obrador", costo: 0 },
  cucuta: { nombre: "Domicilio en Cúcuta", corto: "Domicilio en Cúcuta", costo: 5000 },
  municipios: {
    nombre: "Domicilio en Villa del Rosario, Los Patios o El Zulia",
    corto: "Domicilio en Villa del Rosario, Los Patios o El Zulia",
    costo: 7000,
  },
};
export const ENVIO_GRATIS_DESDE = 12;

// Costo del envío de un pedido de `unidades` galletas con la forma de entrega
// `entrega`. Devuelve null si la forma de entrega no existe (igual que el
// servidor: nunca se adivina una zona).
export function envioDe(unidades, entrega) {
  const zona = ENTREGAS[entrega];
  if (!zona) return null;
  if (unidades >= ENVIO_GRATIS_DESDE) return 0;
  return zona.costo;
}

// Tramo que le toca a una cantidad de galletas, y el siguiente (para poder
// decir cuánto falta).
export function tramoDescuento(unidades) {
  let actual = null;
  let siguiente = null;
  for (const tramo of DESCUENTOS) {
    if (unidades >= tramo.desde) actual = tramo;
    else { siguiente = tramo; break; }
  }
  return { actual, siguiente };
}

// Descuento de un carrito: porcentaje aplicado, lo que se ahorra y el tramo
// siguiente. El redondeo es el mismo que hace el servidor (Math.round), así
// que el total que ve el cliente es exactamente el que se guarda.
export function descuentoPara(unidades, subtotal) {
  const { actual, siguiente } = tramoDescuento(unidades);
  const porcentaje = actual ? actual.porcentaje : 0;
  return { porcentaje, valor: Math.round((subtotal * porcentaje) / 100), siguiente };
}

// Carrito de compras: guarda en el navegador qué quiere comprar el cliente.
// Se persiste en localStorage para que no se pierda si recargan la página.
export class Carrito {
  static CLAVE = "pixel_galletas_carrito";

  constructor() {
    this.items = this.#recuperar();
    // Forma de entrega elegida en el formulario. Vive con el carrito porque el
    // total depende de ella, pero no se guarda en el navegador: cada visita
    // empieza con "recoger", que es gratis y no cambia nada por sí solo.
    this.entrega = "recoger";
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

  // Tope de una línea: el límite de la API (100) y, si el sabor lleva control
  // de inventario, lo que quede disponible. Las líneas guardadas antes de que
  // existiera el inventario no traen el dato y se quedan con el tope de 100.
  #tope(item) {
    return item.disponible === null || item.disponible === undefined
      ? 100
      : Math.min(100, item.disponible);
  }

  // producto: { id, nombre, precio, cantidadDisponible }
  // Devuelve false cuando no se pudo agregar (agotado o ya está el tope), para
  // que la vista se lo pueda decir al cliente en el momento.
  agregar(producto) {
    const disponible = producto.cantidadDisponible ?? null;
    if (disponible === 0) return false; // agotado: no entra al carrito
    const existente = this.items.find((i) => i.producto_id === producto.id);
    if (!existente) {
      this.items.push({
        producto_id: producto.id, nombre: producto.nombre, precio: producto.precio, disponible, cantidad: 1,
      });
      this.#guardar();
      return true;
    }
    existente.disponible = disponible; // el catálogo manda sobre lo guardado
    const tope = this.#tope(existente);
    // Si el obrador bajó las unidades por debajo de lo que ya había en el
    // carrito (o el sabor se agotó en otro teléfono), la línea se recorta aquí:
    // mejor que el cliente lo vea ahora y no al confirmar el pedido.
    if (existente.cantidad > tope) existente.cantidad = tope;
    if (existente.cantidad >= tope) {
      this.#guardar();
      return false;
    }
    existente.cantidad += 1;
    this.#guardar();
    return true;
  }

  cambiarCantidad(id, cantidad) {
    const item = this.items.find((i) => i.producto_id === id);
    if (!item) return;
    if (cantidad < 1) return this.quitar(id);
    // Al bajar la cantidad tampoco se sube del tope disponible.
    item.cantidad = Math.min(this.#tope(item), cantidad);
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

  // Precio de las galletas sin descuento.
  get subtotal() {
    return this.items.reduce((suma, i) => suma + i.precio * i.cantidad, 0);
  }

  get cantidadTotal() {
    return this.items.reduce((suma, i) => suma + i.cantidad, 0);
  }

  // Descuento por volumen que le toca al carrito ahora mismo.
  get descuento() {
    return descuentoPara(this.cantidadTotal, this.subtotal);
  }

  // Costo del domicilio según la zona elegida y lo que hay en el carrito.
  get envio() {
    return envioDe(this.cantidadTotal, this.entrega) ?? 0;
  }

  // Lo que se paga de verdad: subtotal menos el descuento por volumen y más el
  // envío. Es el mismo cálculo que hace el servidor al guardar el pedido.
  get total() {
    return this.subtotal - this.descuento.valor + this.envio;
  }

  // Formato que espera la API: [{ producto_id, cantidad }]
  paraApi() {
    return this.items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad }));
  }
}

// Modelo: un pedido recibido de la API.
export class Pedido {
  constructor({ id, cliente_nombre, cliente_telefono, direccion, entrega, envio, notas, total, descuento, estado, creado_en, detalles }) {
    this.id = id;
    this.clienteNombre = cliente_nombre;
    this.clienteTelefono = cliente_telefono;
    this.direccion = direccion;
    // Cómo llega el pedido y cuánto costó el envío (lo calculó el servidor).
    this.entrega = entrega || "recoger";
    this.envio = Number(envio) || 0;
    this.notas = notas;
    this.total = Number(total);
    this.descuento = Number(descuento) || 0;
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
  // Cómo se entrega y cuánto costó el envío: el obrador necesita saber si el
  // pedido va a la calle o lo vienen a buscar.
  const zona = ENTREGAS[pedido.entrega];
  if (zona) lineas.push(`*Entrega:* ${zona.nombre} — ${pedido.envio > 0 ? pesos(pedido.envio) : "gratis"}`);
  lineas.push("", "*Pedido:*");
  for (const d of pedido.detalles) lineas.push(`• ${d.cantidad} × ${d.nombre} — ${pesos(d.precio * d.cantidad)}`);
  // El descuento por volumen se enseña solo cuando existe, y se enseña el
  // subtotal para que el total no parezca un número salido de la nada.
  if (pedido.descuento > 0) {
    lineas.push("", `*Subtotal:* ${pesos(pedido.total + pedido.descuento)}`);
    lineas.push(`*Descuento por volumen:* −${pesos(pedido.descuento)}`);
  }
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
    // La forma de entrega cambia el total (el domicilio cuesta según la zona y
    // sale gratis desde 12 galletas): al elegirla se vuelve a pintar el carrito
    // para que el cliente vea el precio real antes de confirmar.
    this.$("form-pedido").addEventListener("change", (e) => {
      if (e.target?.name !== "entrega") return;
      this.carrito.entrega = e.target.value;
      this.pintarCarrito();
    });
    this.$("btn-vaciar-carrito").addEventListener("click", () => this.carrito.vaciar());
    this.$("lista-carrito").addEventListener("click", (e) => this.accionesCarrito(e));
    window.addEventListener("carrito-cambio", () => this.pintarCarrito());
    // El carrito responde si pudo agregar: cuando el sabor está agotado o ya se
    // llevó todas las unidades disponibles, el cliente se entera al instante en
    // vez de descubrirlo al confirmar el pedido.
    window.addEventListener("agregar-al-carrito", (e) => {
      if (this.carrito.agregar(e.detail)) return;
      this.mensaje(
        e.detail?.cantidadDisponible === 0
          ? `${e.detail?.nombre} está agotado por ahora.`
          : `Ya llevas todas las unidades disponibles de ${e.detail?.nombre}.`
      );
    });
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
      const menos = this.#boton("−", `Quitar uno de ${item.nombre}`, item.producto_id, "menos");
      const cantidad = document.createElement("span");
      cantidad.textContent = item.cantidad;
      // Para que un lector de pantalla diga "cantidad" y no un número suelto.
      cantidad.setAttribute("aria-label", `Cantidad: ${item.cantidad}`);
      const mas = this.#boton("+", `Agregar uno de ${item.nombre}`, item.producto_id, "mas");
      const fuera = this.#boton("×", `Quitar ${item.nombre} del carrito`, item.producto_id, "quitar");
      controles.append(menos, cantidad, mas, fuera);
      li.append(nombre, precio, controles);
      // Al llegar al tope disponible, el "+" se apaga y la línea lo dice: no se
      // deja armar un pedido que el servidor va a rechazar.
      if (item.disponible !== null && item.disponible !== undefined && item.cantidad >= item.disponible) {
        mas.disabled = true;
        mas.title = `Solo quedan ${item.disponible} de ${item.nombre}`;
        const quedan = document.createElement("span");
        quedan.className = "quedan";
        quedan.textContent = `quedan ${item.disponible}`;
        li.append(quedan);
      }
      lista.append(li);
    }
    // Desglose del descuento por volumen: solo aparece cuando hay algo que
    // descontar, para no ensuciar el carrito de una o dos galletas.
    const { porcentaje, valor, siguiente } = this.carrito.descuento;
    const unidades = this.carrito.cantidadTotal;
    const hayDescuento = porcentaje > 0;
    const envio = this.carrito.envio;
    const hayEnvio = this.carrito.entrega !== "recoger";
    // El desglose aparece cuando hay algo que explicar: descuento o domicilio.
    this.$("desglose").hidden = !hayDescuento && !hayEnvio;
    this.$("linea-descuento").hidden = !hayDescuento;
    this.$("linea-envio").hidden = !hayEnvio;
    // Los números se escriben siempre, aunque el bloque esté oculto: si alguien
    // baja de 12 galletas, el desglose no puede quedarse con las cuentas del
    // tramo anterior (0%, −$ 0, subtotal real).
    this.$("carrito-subtotal").textContent = pesos(this.carrito.subtotal);
    this.$("descuento-pct").textContent = String(porcentaje);
    this.$("carrito-descuento").textContent = `−${pesos(valor)}`;
    // Si el domicilio salió gratis por la cantidad, se dice en vez de dejar un
    // hueco: "¡Gratis!" es parte de lo que el cliente está comprando.
    this.$("carrito-envio").textContent = envio > 0 ? pesos(envio) : "¡Gratis!";
    // Aviso del tramo siguiente: es lo que empuja a subir la cantidad.
    const faltan = siguiente ? siguiente.desde - unidades : 0;
    const aviso = this.$("aviso-descuento");
    aviso.hidden = !this.carrito.items.length || !faltan;
    if (!aviso.hidden) {
      aviso.textContent = hayDescuento
        ? `Con ${siguiente.desde} galletas el descuento sube al ${siguiente.porcentaje}%: te faltan ${faltan}.`
        : `Suma ${faltan} galleta${faltan === 1 ? "" : "s"} más y el pedido lleva ${siguiente.porcentaje}% de descuento.`;
    }
    this.$("carrito-total").textContent = pesos(this.carrito.total);
    // Resumen flotante (chip fijo abajo a la izquierda): plural correcto y total.
    this.$("mini-carrito-resumen").textContent =
      `${unidades} ${unidades === 1 ? "galleta" : "galletas"} · ${pesos(this.carrito.total)}`;
    this.$("mini-carrito").classList.toggle("activo", this.carrito.items.length > 0);
    this.$("vacio").hidden = this.carrito.items.length > 0;
    this.$("btn-pedir").disabled = this.carrito.items.length === 0;
    // Sin galletas no hay nada que vaciar: el botón se apaga en vez de quedarse
    // ahí como una acción muerta al lado del aviso de carrito vacío.
    this.$("btn-vaciar-carrito").disabled = this.carrito.items.length === 0;
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
    // El domicilio sin dirección no se puede servir: se avisa aquí, en el
    // momento, en vez de dejar que el servidor lo rechace después.
    const entrega = String(f.get("entrega") || "recoger");
    const direccion = String(f.get("direccion") || "").trim();
    if (entrega !== "recoger" && !direccion) {
      return this.mensaje("Para el domicilio necesitamos la dirección de entrega.");
    }

    const datos = {
      cliente_nombre: String(f.get("nombre") || "").trim(),
      cliente_telefono: String(f.get("telefono") || "").trim(),
      entrega: String(f.get("entrega") || "recoger"),
      direccion: String(f.get("direccion") || "").trim() || undefined,
      notas: String(f.get("notas") || "").trim() || undefined,
      items: this.carrito.paraApi(),
    };
    // La visita anónima cierra el embudo de la medición: permite saber cuánta
    // gente agregó al carrito y no llegó a confirmar. Si el navegador no deja
    // guardarla, el pedido se manda igual, sin visita.
    const visita = idVisita();
    if (visita) datos.visita = visita;

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
      detalle.textContent =
        `${p.resumen} — ${p.clienteTelefono}${p.direccion ? " — " + p.direccion : ""}` +
        ` — ${ENTREGAS[p.entrega]?.nombre ?? p.entrega} — ${p.fecha}`;
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
