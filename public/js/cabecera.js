// Cabecera en las páginas sueltas (historia, preguntas, términos…).
// Esas páginas traen la misma barra que la portada, pero no el cuadro de acceso
// ni el carrito (viven en la portada). Aquí solo se completa lo que la barra
// muestra: el nombre de quien inició sesión y cuántas galletas lleva.
// El menú móvil y el panel de tema ya los maneja arranque.js.
import { Sesion } from "./api.js";
import { escucharGlobal } from "./registro-global.js";

const CLAVE_CARRITO = "pixel_galletas_carrito"; // la misma de Carrito en pedidos.js

// Cuántas galletas hay en el carrito guardado (las líneas en 0 no cuentan).
export function contarCarrito(texto) {
  try {
    const datos = JSON.parse(texto);
    if (!Array.isArray(datos)) return 0;
    return datos.reduce((suma, i) => suma + (i && i.cantidad >= 1 ? i.cantidad : 0), 0);
  } catch {
    return 0;
  }
}

// En la portada manda auth.js: este archivo solo actúa donde no está #acceso.
if (typeof document !== "undefined" && document.getElementById("btn-acceso") && !document.getElementById("acceso")) {
  const boton = document.getElementById("btn-acceso");
  boton.textContent = Sesion.obtener()?.usuario?.nombre || "Acceso";
  // El cuadro de acceso está en la portada y se abre solo al llegar con #acceso.
  // Va con #acceso a una sección concreta: igual que navegacion.js, se marca
  // la entrada como vista para que la pantalla de título no lo detenga.
  escucharGlobal("cabecera:acceso", "click", () => {
    try { sessionStorage.setItem("pixel_galletas_entrada", "1"); } catch { /* sin sessionStorage */ }
    location.href = "/#acceso";
  }, boton);

  const contador = document.getElementById("carrito-contador");
  if (contador) {
    let guardado = null;
    try { guardado = localStorage.getItem(CLAVE_CARRITO); } catch { /* modo privado */ }
    contador.textContent = contarCarrito(guardado);
  }
}
