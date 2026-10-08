import { ApiClient, Sesion } from "./api.js";

// Modelo: un producto del catálogo. Convierte el precio (la API lo envía como texto "4500.00").
export class Producto {
  constructor({ id, nombre_sabor, descripcion, precio_venta }) {
    this.id = id;
    this.nombre = nombre_sabor;
    this.descripcion = descripcion ?? "";
    this.precio = Number(precio_venta);
  }
  get precioTexto() {
    return this.precio.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  }
}

// Servicio: el CRUD de productos contra la API.
export class ProductoServicio {
  constructor(api) { this.api = api; }
  async listar() { return (await this.api.get("/productos")).map((p) => new Producto(p)); }
  crear(datos) { return this.api.post("/productos", datos); }
  actualizar(id, datos) { return this.api.put(`/productos/${id}`, datos); }
  eliminar(id) { return this.api.eliminar(`/productos/${id}`); }
}

// Vista: dibuja el catálogo (público) y el panel de administración (solo admin).
class ProductosVista {
  constructor(servicio) {
    this.servicio = servicio;
    this.productos = [];
    this.editandoId = null;
    this.$ = (id) => document.getElementById(id);
    this.$("form-producto").addEventListener("submit", (e) => this.guardar(e));
    this.$("btn-cancelar").addEventListener("click", () => this.limpiarForm());
    this.$("lista-productos").addEventListener("click", (e) => this.accion(e));
    window.addEventListener("sesion-cambio", () => this.pintar());
    this.cargar();
  }

  get esAdmin() { return Sesion.obtener()?.usuario?.rol === "admin"; }

  mensaje(texto, esError = true) {
    const p = this.$("mensaje-productos");
    p.textContent = texto;
    p.classList.toggle("ok", !esError);
  }

  async cargar() {
    try { this.productos = await this.servicio.listar(); this.pintar(); }
    catch (error) { this.mensaje(error.message); }
  }

  // Todo el texto entra con textContent: nunca se interpreta como HTML.
  pintar() {
    this.$("admin-productos").hidden = !this.esAdmin;
    const lista = this.$("lista-productos");
    lista.replaceChildren();
    for (const p of this.productos) {
      const li = document.createElement("li");
      li.className = "producto";
      const info = document.createElement("div");
      const nombre = document.createElement("strong");
      nombre.textContent = p.nombre;
      const desc = document.createElement("small");
      desc.textContent = p.descripcion;
      const precio = document.createElement("b");
      precio.textContent = p.precioTexto;
      info.append(nombre, document.createElement("br"), desc);
      li.append(info, precio);
      // Botón para agregar la galleta al carrito de pedidos (para todos).
      const agregar = document.createElement("button");
      agregar.type = "button";
      agregar.className = "btn-agregar";
      agregar.textContent = "＋ Carrito";
      agregar.title = `Agregar ${p.nombre} al carrito`;
      agregar.dataset.agregar = p.id;
      li.append(agregar);
      if (this.esAdmin) {
        const acciones = document.createElement("div");
        acciones.className = "acciones";
        for (const [accion, texto] of [["editar", "Editar"], ["eliminar", "Eliminar"]]) {
          const b = document.createElement("button");
          b.type = "button"; b.textContent = texto;
          b.dataset.accion = accion; b.dataset.id = p.id;
          acciones.append(b);
        }
        li.append(acciones);
      }
      lista.append(li);
    }
  }

  // Ejecuta una operación; si la API responde que la sesión venció, avisa a la vista de acceso.
  async ejecutar(operacion, textoOk) {
    const habiaSesion = !!Sesion.obtener();
    try {
      await operacion();
      this.mensaje(textoOk, false);
      await this.cargar();
      return true;
    } catch (error) {
      this.mensaje(error.message);
      if (habiaSesion && !Sesion.obtener()) window.dispatchEvent(new Event("sesion-vencida"));
      return false;
    }
  }

  async guardar(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = { nombre_sabor: f.get("nombre").trim(), descripcion: f.get("descripcion").trim(), precio_venta: Number(f.get("precio")) };
    const id = this.editandoId;
    const ok = await this.ejecutar(
      () => (id ? this.servicio.actualizar(id, datos) : this.servicio.crear(datos)),
      id ? "Producto actualizado." : "Producto creado."
    );
    if (ok) this.limpiarForm(false);
  }

  accion(e) {
    // Botón "＋ Carrito": avisa al módulo de pedidos que este producto se agrega.
    const agregar = e.target.closest("button[data-agregar]");
    if (agregar) {
      const producto = this.productos.find((p) => p.id === Number(agregar.dataset.agregar));
      if (producto) window.dispatchEvent(new CustomEvent("agregar-al-carrito", { detail: producto }));
      return;
    }
    const boton = e.target.closest("button[data-accion]");
    if (!boton) return;
    const producto = this.productos.find((p) => p.id === Number(boton.dataset.id));
    if (!producto) return;
    if (boton.dataset.accion === "editar") {
      const f = this.$("form-producto");
      f.nombre.value = producto.nombre;
      f.descripcion.value = producto.descripcion;
      f.precio.value = producto.precio;
      this.editandoId = producto.id;
      this.$("btn-guardar").textContent = "Guardar cambios";
      this.$("btn-cancelar").hidden = false;
      this.mensaje("");
      f.nombre.focus();
    } else if (confirm(`¿Eliminar "${producto.nombre}"?`)) {
      this.ejecutar(() => this.servicio.eliminar(producto.id), "Producto eliminado.");
    }
  }

  limpiarForm(borrarMensaje = true) {
    this.$("form-producto").reset();
    this.editandoId = null;
    this.$("btn-guardar").textContent = "Agregar galleta";
    this.$("btn-cancelar").hidden = true;
    if (borrarMensaje) this.mensaje("");
  }
}

// Solo arranca cuando existe la página (así los módulos también se pueden probar sin navegador).
if (typeof document !== "undefined") new ProductosVista(new ProductoServicio(new ApiClient()));
