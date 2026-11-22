import { ApiClient, Sesion } from "./api.js";
import { escucharGlobal } from "./registro-global.js";

// Modelo: un usuario registrado.
export class Usuario {
  constructor({ id, nombre, correo, rol, creado_en }) {
    this.id = id; this.nombre = nombre; this.correo = correo; this.rol = rol; this.creadoEn = creado_en;
  }
  get desde() { return new Date(this.creadoEn).toLocaleDateString("es-CO"); }
}

// Servicio: gestión de usuarios contra la API (solo responde si eres administrador).
export class UsuarioServicio {
  constructor(api) { this.api = api; }
  async listar() { return (await this.api.get("/usuarios")).map((u) => new Usuario(u)); }
  cambiarRol(id, rol) { return this.api.put(`/usuarios/${id}`, { rol }); }
  eliminar(id) { return this.api.eliminar(`/usuarios/${id}`); }
}

// Vista: lista de usuarios con cambio de rol y eliminación (solo visible para el admin).
class UsuariosVista {
  constructor(servicio) {
    this.servicio = servicio;
    this.usuarios = [];
    this.$ = (id) => document.getElementById(id);
    this.$("lista-usuarios").addEventListener("click", (e) => this.eliminar(e));
    this.$("lista-usuarios").addEventListener("change", (e) => this.cambiarRol(e));
    escucharGlobal("usuarios:sesion", "sesion-cambio", () => this.alCambiarSesion());
    this.alCambiarSesion();
  }

  get yo() { return Sesion.obtener()?.usuario; }
  get esAdmin() { return this.yo?.rol === "admin"; }

  mensaje(texto, esError = true) {
    const p = this.$("mensaje-usuarios");
    p.textContent = texto;
    p.classList.toggle("ok", !esError);
  }

  alCambiarSesion() {
    this.$("seccion-usuarios").hidden = !this.esAdmin;
    if (this.esAdmin) { this.cargar(); return; }
    this.usuarios = [];
    this.$("lista-usuarios").replaceChildren();
    this.mensaje("");
  }

  async cargar() {
    const habiaSesion = !!Sesion.obtener();
    try { this.usuarios = await this.servicio.listar(); this.pintar(); }
    catch (error) {
      this.mensaje(error.message);
      // Token vencido (dura 2 h): api.js ya borró la sesión; se avisa para que
      // la cabecera pida entrar de nuevo en vez de dejar el panel con el error.
      if (habiaSesion && !Sesion.obtener()) window.dispatchEvent(new Event("sesion-vencida"));
    }
  }

  pintar() {
    const lista = this.$("lista-usuarios");
    lista.replaceChildren();
    for (const u of this.usuarios) {
      const soyYo = u.id === this.yo?.id;
      const li = document.createElement("li");
      li.className = "producto";
      const info = document.createElement("div");
      const nombre = document.createElement("strong");
      nombre.textContent = soyYo ? `${u.nombre} (tú)` : u.nombre;
      const datos = document.createElement("small");
      datos.textContent = `${u.correo} · desde ${u.desde}`;
      info.append(nombre, document.createElement("br"), datos);

      const acciones = document.createElement("div");
      acciones.className = "acciones";
      const rol = document.createElement("select");
      rol.dataset.id = u.id; rol.disabled = soyYo;
      rol.setAttribute("aria-label", `Rol de ${u.nombre}`);
      for (const opcion of ["cliente", "admin"]) {
        const o = document.createElement("option");
        o.value = opcion; o.textContent = opcion; o.selected = u.rol === opcion;
        rol.append(o);
      }
      const borrar = document.createElement("button");
      borrar.type = "button"; borrar.textContent = "Eliminar";
      borrar.dataset.accion = "eliminar"; borrar.dataset.id = u.id; borrar.disabled = soyYo;
      acciones.append(rol, borrar);
      li.append(info, acciones);
      lista.append(li);
    }
  }

  async ejecutar(operacion, textoOk) {
    const habiaSesion = !!Sesion.obtener();
    try {
      await operacion();
      this.mensaje(textoOk, false);
      await this.cargar();
    } catch (error) {
      this.mensaje(error.message);
      if (habiaSesion && !Sesion.obtener()) window.dispatchEvent(new Event("sesion-vencida"));
      else await this.cargar(); // vuelve a mostrar el estado real
    }
  }

  cambiarRol(e) {
    const select = e.target.closest("select[data-id]");
    if (select) this.ejecutar(() => this.servicio.cambiarRol(Number(select.dataset.id), select.value), "Rol actualizado.");
  }

  eliminar(e) {
    const boton = e.target.closest("button[data-accion='eliminar']");
    const usuario = boton && this.usuarios.find((u) => u.id === Number(boton.dataset.id));
    if (usuario && confirm(`¿Eliminar la cuenta de ${usuario.nombre} (${usuario.correo})?`)) {
      this.ejecutar(() => this.servicio.eliminar(usuario.id), "Usuario eliminado.");
    }
  }
}

// Solo arranca cuando existe la página (así los módulos también se pueden probar sin navegador).
if (typeof document !== "undefined") new UsuariosVista(new UsuarioServicio(new ApiClient()));
