// Guarda y recupera la sesión (token + datos del usuario) en el navegador.
export class Sesion {
  static #CLAVE = "pixel_galletas_sesion";
  static #CLAVE_VENCIDA = "pixel_galletas_sesion_vencida";
  static guardar(token, usuario) { localStorage.setItem(Sesion.#CLAVE, JSON.stringify({ token, usuario })); }
  static obtener() { try { return JSON.parse(localStorage.getItem(Sesion.#CLAVE)); } catch { return null; } }
  static limpiar() {
    localStorage.removeItem(Sesion.#CLAVE);
    localStorage.removeItem(Sesion.#CLAVE_VENCIDA);
  }
  // Vencer no es salir: la marca avisa al carrito de que el cliente no se fue
  // por su cuenta, para que no borre lo que tenía.
  static vencer() {
    Sesion.limpiar();
    try { localStorage.setItem(Sesion.#CLAVE_VENCIDA, "1"); } catch { /* modo privado */ }
  }
  static vencio() { try { return localStorage.getItem(Sesion.#CLAVE_VENCIDA) !== null; } catch { return false; } }
  static olvidarVencida() { try { localStorage.removeItem(Sesion.#CLAVE_VENCIDA); } catch { /* modo privado */ } }
}

// Único lugar del frontend que habla con la API.
export class ApiClient {
  constructor(base = "/api") { this.base = base; }

  async #pedir(metodo, ruta, cuerpo) {
    const sesion = Sesion.obtener();
    const cabeceras = { "Content-Type": "application/json" };
    if (sesion?.token) cabeceras.Authorization = `Bearer ${sesion.token}`;

    let respuesta;
    try {
      respuesta = await fetch(this.base + ruta, {
        method: metodo, headers: cabeceras, body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } catch {
      throw new Error("No se pudo conectar con el servidor.");
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      if (respuesta.status === 401 && sesion) Sesion.vencer(); // sesión vencida
      throw new Error(datos.error || "Ocurrió un error inesperado.");
    }
    return datos;
  }

  get(ruta) { return this.#pedir("GET", ruta); }
  post(ruta, cuerpo) { return this.#pedir("POST", ruta, cuerpo); }
  put(ruta, cuerpo) { return this.#pedir("PUT", ruta, cuerpo); }
  eliminar(ruta) { return this.#pedir("DELETE", ruta); }

  registrar(nombre, correo, contrasena) {
    return this.post("/usuarios/registro", { nombre, correo, contrasena });
  }
  async iniciarSesion(correo, contrasena) {
    const datos = await this.post("/usuarios/login", { correo, contrasena });
    Sesion.guardar(datos.token, datos.usuario);
    return datos.usuario;
  }
}
