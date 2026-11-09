// Registra el service worker para que la web sea instalable como app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Invitación a instalar: discreta, se puede cerrar y no vuelve a salir. Se retira
// sola para no tapar la tienda y sale una vez por visita. Nunca aparece dentro
// de la app ya instalada.
(function () {
  var CLAVE = "pixel_galletas_instalar_cerrado";
  var CLAVE_VISITA = "pixel_galletas_instalar_visto";
  var ESPERA_MS = 8000; // primero se deja ver la tienda
  var VISIBLE_MS = 15000; // luego se quita sola
  var aviso = null;
  var pendiente = null; // el evento beforeinstallprompt, para usarlo al pulsar

  function yaInstalada() {
    return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }
  function descartada() {
    try { return localStorage.getItem(CLAVE) === "1"; } catch (e) { return false; }
  }
  function vistaEnEstaVisita() {
    try { return sessionStorage.getItem(CLAVE_VISITA) === "1"; } catch (e) { return false; }
  }
  function recordar() {
    try { localStorage.setItem(CLAVE, "1"); } catch (e) { /* sin almacenamiento */ }
  }
  // Safari en iPhone o iPad no tiene beforeinstallprompt: se explica a mano.
  function enSafariIOS() {
    var ua = navigator.userAgent;
    var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return ios && /safari/i.test(ua) && !/crios|fxios|edgios|opios|gsa\//i.test(ua);
  }

  function quitar() {
    if (aviso) aviso.remove();
    aviso = null;
  }
  function boton(texto, clase, alPulsar) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = clase;
    b.textContent = texto;
    b.addEventListener("click", alPulsar);
    return b;
  }
  function mostrar(texto, conInstalar) {
    if (aviso || descartada() || vistaEnEstaVisita() || yaInstalada()) return;
    aviso = document.createElement("aside");
    aviso.className = "instalar-aviso";
    aviso.setAttribute("aria-label", "Instalar la app");
    var parrafo = document.createElement("p");
    parrafo.textContent = texto;
    var acciones = document.createElement("div");
    acciones.className = "instalar-acciones";
    if (conInstalar) acciones.append(boton("Instalar", "instalar-si", instalar));
    acciones.append(boton(conInstalar ? "Ahora no" : "Entendido", "instalar-no", function () {
      recordar();
      quitar();
    }));
    aviso.append(parrafo, acciones);
    document.body.append(aviso);
    try { sessionStorage.setItem(CLAVE_VISITA, "1"); } catch (e) { /* sin almacenamiento */ }
    var este = aviso;
    setTimeout(function () {
      if (aviso === este) quitar();
    }, VISIBLE_MS);
  }
  function instalar() {
    var evento = pendiente;
    pendiente = null;
    quitar();
    if (!evento) return;
    evento.prompt();
    Promise.resolve(evento.userChoice).then(function (eleccion) {
      if (eleccion && eleccion.outcome === "dismissed") recordar();
    }).catch(function () {});
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    pendiente = e;
    setTimeout(function () {
      mostrar("Lleva Pixel Galletas en tu pantalla de inicio.", true);
    }, ESPERA_MS);
  });
  window.addEventListener("appinstalled", function () {
    recordar();
    quitar();
  });
  if (enSafariIOS()) {
    setTimeout(function () {
      mostrar("Instala la app: Compartir > Añadir a pantalla de inicio.", false);
    }, ESPERA_MS);
  }
})();
