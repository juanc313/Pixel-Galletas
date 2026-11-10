// Secciones plegadas de la portada (pedidos grandes, estado del pedido, juego…).
// Para acortar la página en celular, sus formularios se abren al tocar. Cuando
// el cliente llega a una de esas secciones por un enlace ("#estado",
// "#pedidos-grandes", desde el carrito o desde Pixelito), se abre sola: nadie
// debería caer en una sección y encontrar el formulario cerrado.
export function abrirDesplegable(id) {
  if (typeof document === "undefined" || !id) return;
  const seccion = document.getElementById(id);
  const plegado = seccion?.matches("details.desplegable") ? seccion : seccion?.querySelector("details.desplegable");
  if (plegado) plegado.open = true;
}

if (typeof document !== "undefined" && !window.__desplegablesIniciados) {
  window.__desplegablesIniciados = true;
  const desdeHash = () => abrirDesplegable(decodeURIComponent(location.hash.slice(1)));
  window.addEventListener("hashchange", desdeHash);
  desdeHash();
  // Se abre antes de que la página baje, así el desplazamiento cae en el lugar justo.
  document.addEventListener("click", (e) => {
    const enlace = e.target.closest?.('a[href*="#"]');
    if (!enlace) return;
    const url = new URL(enlace.href, location.href);
    if (url.pathname === location.pathname) abrirDesplegable(url.hash.slice(1));
  }, true);
}
