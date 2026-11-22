import { ApiClient, Sesion } from "./api.js";
import { escucharGlobal } from "./registro-global.js";

// Controla la pantalla de acceso (login, registro y panel de sesión).
class AuthVista {
  constructor(api) {
    this.api = api;
    this.$ = (id) => document.getElementById(id);
    this.enlazarEventos();
    this.mostrarSegunSesion();
    this.abrirSiLoPiden();
  }

  enlazarEventos() {
    this.$("tab-login").addEventListener("click", () => this.cambiarPestana("login"));
    this.$("tab-registro").addEventListener("click", () => this.cambiarPestana("registro"));
    this.$("form-login").addEventListener("submit", (e) => this.iniciarSesion(e));
    this.$("form-registro").addEventListener("submit", (e) => this.registrar(e));
    this.$("btn-salir").addEventListener("click", () => this.cerrarSesion());
    // El botón vive en la cabecera, que sobrevive a la navegación sin recargar:
    // con addEventListener cada regreso a la portada le sumaba otro clic.
    escucharGlobal("auth:btn-acceso", "click", () => this.alPulsarAcceso(), this.$("btn-acceso"));
    escucharGlobal("auth:sesion-vencida", "sesion-vencida", () => {
      this.mostrarSegunSesion();
      this.alternarAcceso(true);
      this.mensaje("Tu sesión venció. Inicia sesión de nuevo.");
    });
  }

  // Muestra u oculta el cuadro de acceso (por defecto, lo contrario de como está).
  alternarAcceso(abrir = this.$("acceso")?.hidden) {
    // El cuadro de acceso solo está en la portada: desde otra página se va
    // allá con #acceso, y al llegar se abre solo (ver abrirSiLoPiden).
    if (!this.$("acceso")) { location.href = "/#acceso"; return; }
    this.$("acceso").hidden = !abrir;
    this.$("btn-acceso").setAttribute("aria-expanded", String(abrir));
    if (abrir) this.llevarAlAcceso();
  }

  // El cuadro está arriba de la página: si el cliente estaba más abajo (en el
  // carrito, por ejemplo), al abrirlo solo veía la página moverse. Ahora la
  // pantalla sube hasta el cuadro y el cursor queda listo en el primer campo.
  llevarAlAcceso() {
    const caja = this.$("acceso");
    const suave = !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    caja.scrollIntoView?.({ behavior: suave ? "smooth" : "auto", block: "start" });
    const campo = caja.querySelector?.("form:not([hidden]) input, #vista-panel:not([hidden]) button");
    campo?.focus?.({ preventScroll: true });
  }

  // Botón "Acceso": si el cuadro ya está abierto pero quedó fuera de la vista
  // (el cliente bajó), lo trae a la vista en vez de cerrarlo sin que lo note.
  alPulsarAcceso() {
    const caja = this.$("acceso");
    if (caja && !caja.hidden && !this.estaALaVista(caja)) { this.llevarAlAcceso(); return; }
    this.alternarAcceso();
  }

  estaALaVista(elemento) {
    const r = elemento.getBoundingClientRect?.();
    if (!r) return true;
    return r.bottom > 0 && r.top < (globalThis.innerHeight || 0);
  }

  // Llegó desde otra página con /#acceso: abre el cuadro.
  abrirSiLoPiden() {
    if (globalThis.location?.hash === "#acceso" && this.$("acceso")) this.alternarAcceso(true);
  }

  cambiarPestana(cual) {
    const esLogin = cual === "login";
    this.$("form-login").hidden = !esLogin;
    this.$("form-registro").hidden = esLogin;
    this.$("tab-login").classList.toggle("activa", esLogin);
    this.$("tab-registro").classList.toggle("activa", !esLogin);
    // role="tab": el estado activo se comunica con aria-selected, no solo con el color.
    this.$("tab-login").setAttribute("aria-selected", String(esLogin));
    this.$("tab-registro").setAttribute("aria-selected", String(!esLogin));
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
if (typeof document !== "undefined" && document.getElementById("btn-acceso")) new AuthVista(new ApiClient());
