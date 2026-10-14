// Arranque de la página: se carga en el <head> (sin defer) para ejecutarse antes
// del primer pintado. Es un archivo externo porque la CSP no permite scripts
// inline.

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

// Sustituye el antiguo onerror inline de efectos.js (la CSP lo bloquearía): si
// el módulo no carga, se muestra la página sin animaciones.
// (El <script> de efectos.js está en el <body>, aún sin parsear aquí; el error de
// carga no burbujea, así que se escucha en captura desde el documento.)
document.addEventListener("error", function (e) {
  if (e.target && e.target.src && e.target.src.indexOf("/js/efectos.js") !== -1) {
    document.documentElement.classList.remove("js-anim", "velado");
  }
}, true);
