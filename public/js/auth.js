import { ApiClient, Sesion } from "./api.js";

// Controla la pantalla de acceso (login, registro y panel de sesión).
class AuthVista {
  constructor(api) {
    this.api = api;
    this.$ = (id) => document.getElementById(id);
    this.enlazarEventos();
    this.mostrarSegunSesion();
  }

  enlazarEventos() {
    this.$("tab-login").addEventListener("click", () => this.cambiarPestana("login"));
    this.$("tab-registro").addEventListener("click", () => this.cambiarPestana("registro"));
    this.$("form-login").addEventListener("submit", (e) => this.iniciarSesion(e));
    this.$("form-registro").addEventListener("submit", (e) => this.registrar(e));
    this.$("btn-salir").addEventListener("click", () => this.cerrarSesion());
    this.$("btn-acceso").addEventListener("click", () => this.alternarAcceso());
    window.addEventListener("sesion-vencida", () => {
      this.mostrarSegunSesion();
      this.alternarAcceso(true);
      this.mensaje("Tu sesión venció. Inicia sesión de nuevo.");
    });
  }

  // Muestra u oculta el cuadro de acceso (por defecto, lo contrario de como está).
  alternarAcceso(abrir = this.$("acceso").hidden) {
    this.$("acceso").hidden = !abrir;
    this.$("btn-acceso").setAttribute("aria-expanded", String(abrir));
  }

  cambiarPestana(cual) {
    const esLogin = cual === "login";
    this.$("form-login").hidden = !esLogin;
    this.$("form-registro").hidden = esLogin;
    this.$("tab-login").classList.toggle("activa", esLogin);
    this.$("tab-registro").classList.toggle("activa", !esLogin);
    this.mensaje("");
  }

  // textContent (no innerHTML): el texto nunca se interpreta como HTML.
  mensaje(texto, esError = true) {
    const p = this.$("mensaje");
    p.textContent = texto;
    p.classList.toggle("ok", !esError);
  }

  async iniciarSesion(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await this.api.iniciarSesion(f.get("correo").trim(), f.get("contrasena"));
      e.target.reset();
      this.mostrarSegunSesion();
      this.alternarAcceso(false);
    } catch (error) { this.mensaje(error.message); }
  }

  async registrar(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const [nombre, correo, contrasena] = [f.get("nombre").trim(), f.get("correo").trim(), f.get("contrasena")];
    try {
      await this.api.registrar(nombre, correo, contrasena);
      await this.api.iniciarSesion(correo, contrasena);
      e.target.reset();
      this.mostrarSegunSesion();
      this.alternarAcceso(false);
    } catch (error) { this.mensaje(error.message); }
  }

  cerrarSesion() { Sesion.limpiar(); this.mostrarSegunSesion(); this.alternarAcceso(false); }

  mostrarSegunSesion() {
    const s = Sesion.obtener();
    this.$("btn-acceso").textContent = s ? s.usuario.nombre : "Acceso";
    this.$("vista-acceso").hidden = !!s;
    this.$("vista-panel").hidden = !s;
    if (s) {
      this.$("panel-nombre").textContent = s.usuario.nombre;
      this.$("panel-rol").textContent = s.usuario.rol;
    }
    this.mensaje("");
    window.dispatchEvent(new Event("sesion-cambio")); // la vista de productos se redibuja
  }
}

// Solo arranca cuando existe la página (así los módulos también se pueden probar sin navegador).
if (typeof document !== "undefined") new AuthVista(new ApiClient());
