// Tema guardado, aplicado antes del primer pintado.
// Las páginas 8-bit no cargan arranque.js (que además prepara la entrada y las
// animaciones), así que necesitan solo esto: sin este archivo enlazaban
// tema-claro.css pero el atributo data-tema nunca llegaba a ponerse.
try {
  if (localStorage.getItem("pixel_galletas_tema") === "claro") {
    document.documentElement.dataset.tema = "claro";
  }
} catch (e) { /* sin almacenamiento: queda el tema oscuro */ }
