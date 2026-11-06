// Arranque de la página: se carga en el <head> (sin defer) para ejecutarse antes
// del primer pintado. Es un archivo externo porque la CSP no permite scripts
// inline.

// Tema oscuro o claro: se aplica antes del primer pintado para que no parpadee.
// Por defecto es el oscuro (como siempre); solo cambia si el cliente eligió claro.
try {
  if (localStorage.getItem("pixel_galletas_tema") === "claro") document.documentElement.dataset.tema = "claro";
} catch (e) { /* sin almacenamiento: queda el oscuro */ }

// Activa las animaciones solo si efectos.js se carga (si falla, todo se ve).
document.documentElement.classList.add("js-anim");

// La sorpresa manda: si la entrada le toca verse en esta sesión (una vez por
// sesión y nunca con movimiento reducido —misma regla que usa efectos.js—), el
// sitio queda "velado" ANTES del primer pintado: el velo oculta la página y
// fuerza la escena a pesar del atributo hidden, para que ni por un fotograma se
// asome el catálogo antes que la entrada. efectos.js levanta el velo en cuanto
// el CRT termina de abrir; si el módulo no llega (o se queda a medias con la
// escena ya destapada), este mismo script retira el velo a los 4 s, apaga
// js-anim y saca la entrada del DOM, para que la página nunca quede tapada.
(function () {
  try {
    var reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Enlace directo (?directo=1): sin velo ni escena, se entra de una.
    var directo = /^1$/.test(new URLSearchParams(location.search).get("directo") || "");
    var vista = true;
    try { vista = sessionStorage.getItem("pixel_galletas_entrada") === "1"; } catch (e2) { /* sin sessionStorage */ }
    if (!reducido && !vista && !directo) document.documentElement.classList.add("velado");
  } catch (e) { /* sin matchMedia: sin velo (igual que hoy sin entrada) */ }
})();

setTimeout(function () {
  if (!window.__efectosListo) {
    document.documentElement.classList.remove("js-anim");
    document.documentElement.classList.remove("velado");
    // Si el módulo se quedó a medias DESPUÉS de destapar la escena, la escena se
    // saca del DOM: es lo único que podría dejar la página tapada para siempre.
    var escena = document.getElementById("entrada");
    if (escena) escena.remove();
  }
}, 4000);

// Selector de tema: cambia en tiempo real y lo recuerda en este navegador.
document.addEventListener("DOMContentLoaded", function () {
  var boton = document.getElementById("tema-boton");
  var panel = document.getElementById("tema-panel");
  if (!boton || !panel) return;
  var opciones = panel.querySelectorAll(".tema-op");
  function pintar() {
    var actual = document.documentElement.dataset.tema === "claro" ? "claro" : "oscuro";
    opciones.forEach(function (op) { op.setAttribute("aria-pressed", String(op.dataset.tema === actual)); });
  }
  function abrir(valor) {
    panel.hidden = !valor;
    boton.setAttribute("aria-expanded", String(valor));
  }
  boton.addEventListener("click", function (e) {
    e.stopPropagation();
    abrir(panel.hidden);
  });
  opciones.forEach(function (op) {
    op.addEventListener("click", function () {
      var claro = op.dataset.tema === "claro";
      if (claro) document.documentElement.dataset.tema = "claro";
      else delete document.documentElement.dataset.tema;
      try { localStorage.setItem("pixel_galletas_tema", claro ? "claro" : "oscuro"); } catch (e) { /* sin almacenamiento */ }
      pintar();
    });
  });
  document.addEventListener("click", function (e) {
    if (!panel.hidden && !e.target.closest(".tema-selector")) abrir(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) { abrir(false); boton.focus(); }
  });
  pintar();
});

// Sustituye el antiguo onerror inline de efectos.js (la CSP lo bloquearía): si
// el módulo no carga, se muestra la página sin animaciones.
// (El <script> de efectos.js está en el <body>, aún sin parsear aquí; el error de
// carga no burbujea, así que se escucha en captura desde el documento.)
document.addEventListener("error", function (e) {
  if (e.target && e.target.src && e.target.src.indexOf("/js/efectos.js") !== -1) {
    document.documentElement.classList.remove("js-anim", "velado");
  }
}, true);
