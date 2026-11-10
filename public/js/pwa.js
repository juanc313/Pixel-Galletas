// Registra el service worker para que la web sea instalable como app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Aviso de versión nueva. Android deja la app abierta en memoria con la versión
// con la que se abrió: sin esto, el cliente seguiría viendo precios o combos
// viejos hasta cerrarla del todo. Se compara la versión publicada (/api/version)
// al abrir, al volver a la app y cada 15 minutos. Nunca recarga sola: el
// cliente decide, así no pierde lo que esté escribiendo.
(function () {
  if (window.__versionIniciada || !window.fetch) return;
  window.__versionIniciada = true;
  var MIN_ENTRE_CONSULTAS = 60000;
  var CADA = 15 * 60000;
  var CLAVE_LUEGO = "pixel_galletas_version_luego";
  var inicial = null;
  var ultima = 0;
  var aviso = null;

  function pospuesta() {
    try { return sessionStorage.getItem(CLAVE_LUEGO); } catch (e) { return null; }
  }
  function mostrar(version) {
    if (aviso) return;
    aviso = document.createElement("aside");
    aviso.className = "actualizar-aviso";
    aviso.setAttribute("role", "status");
    var parrafo = document.createElement("p");
    var fuerte = document.createElement("b");
    fuerte.textContent = "¡Nueva versión disponible! 🎮";
    parrafo.append(fuerte, document.createTextNode(" Actualiza para ver lo último de Pixel Galletas."));
    var acciones = document.createElement("div");
    acciones.className = "actualizar-acciones";
    var si = document.createElement("button");
    si.type = "button";
    si.className = "actualizar-si";
    si.textContent = "Actualizar";
    si.addEventListener("click", function () { location.reload(); });
    var no = document.createElement("button");
    no.type = "button";
    no.className = "actualizar-no";
    no.textContent = "Luego";
    no.addEventListener("click", function () {
      try { sessionStorage.setItem(CLAVE_LUEGO, version); } catch (e) { /* sin almacenamiento */ }
      aviso.remove();
      aviso = null;
    });
    acciones.append(si, no);
    aviso.append(parrafo, acciones);
    document.body.append(aviso);
  }
  function consultar() {
    if (aviso || Date.now() - ultima < MIN_ENTRE_CONSULTAS) return;
    ultima = Date.now();
    fetch("/api/version", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (datos) {
        if (!datos || !datos.version) return;
        if (inicial === null) { inicial = datos.version; return; }
        if (datos.version !== inicial && pospuesta() !== datos.version) mostrar(datos.version);
      })
      .catch(function () { /* sin red: se vuelve a intentar después */ });
  }

  consultar();
  document.addEventListener("visibilitychange", function () { if (!document.hidden) consultar(); });
  window.addEventListener("online", consultar);
  setInterval(function () { if (!document.hidden) consultar(); }, CADA);
})();

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
