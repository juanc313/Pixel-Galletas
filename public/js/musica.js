// Pixel Radio: el navegador puede exigir un gesto antes de permitir sonido.
const audio = document.querySelector("#musica-audio");
const panelMusica = document.querySelector("#musica-panel");
const botonesMusica = () => [...document.querySelectorAll(".musica-boton")];
const canciones = [...document.querySelectorAll(".musica-lista [data-pista]")];
const volumen = document.querySelector("#musica-volumen");
const progreso = document.querySelector("#musica-progreso");
const estadoMusica = document.querySelector("#musica-estado");
const tituloMusica = document.querySelector("#musica-titulo");
const artistaMusica = document.querySelector("#musica-artista");
const tiempoMusica = document.querySelector("#musica-tiempo");
const duracionMusica = document.querySelector("#musica-duracion");
const reproducirMusica = document.querySelector("#musica-reproducir");

if (!window.__musicaIniciada && audio && panelMusica && botonesMusica().length && canciones.length && volumen && progreso && estadoMusica && tituloMusica && artistaMusica && tiempoMusica && duracionMusica && reproducirMusica) {
window.__musicaIniciada = true;
  const CLAVE_SILENCIO = "pixel_galletas_musica_apagada";
  let apagada = false;
  try { apagada = localStorage.getItem(CLAVE_SILENCIO) === "1"; } catch { /* sin almacenamiento */ }
  let reintentar = false;
  let inicioPendiente = !apagada;
  let reproduciendo = false;
  let iniciando = false;
  let intento = 0;
  let indice = 0;
  let botonApertura = null;
  audio.volume = Number(volumen.value);

  function actualizarBotones() {
    const activa = reproduciendo || iniciando;
    botonesMusica().forEach((boton) => {
      boton.dataset.sonando = String(activa);
      boton.setAttribute("aria-expanded", String(!panelMusica.hidden));
    });
    reproducirMusica.textContent = activa ? "❚❚" : "▶";
    const etiqueta = activa ? "Pausar música" : "Reproducir música";
    reproducirMusica.setAttribute("aria-label", etiqueta);
    reproducirMusica.title = etiqueta;
  }

  function guardarPreferencia() {
    try { localStorage.setItem(CLAVE_SILENCIO, apagada ? "1" : "0"); } catch { /* sin almacenamiento */ }
  }

  function fuenteCompatible(ruta) {
    if (ruta.endsWith(".ogg") && !audio.canPlayType("audio/ogg; codecs=vorbis")) {
      return ruta.replace(/\.ogg$/, ".mp3");
    }
    return ruta;
  }

  function reproducir() {
    if (apagada) return;
    const actual = ++intento;
    inicioPendiente = false;
    reintentar = false;
    iniciando = true;
    actualizarBotones();
    audio.play().then(() => {
      if (apagada) audio.pause();
    }).catch((error) => {
      if (actual !== intento || apagada || error.name === "AbortError") return;
      iniciando = false;
      reproduciendo = false;
      actualizarBotones();
      if (error.name === "NotAllowedError") {
        reintentar = true;
        estadoMusica.textContent = "Pulsa ▶ para escuchar música.";
      } else {
        estadoMusica.textContent = "No se pudo reproducir la música. Revisa tu conexión e inténtalo de nuevo.";
      }
    });
  }

  function pausar() {
    apagada = true;
    inicioPendiente = false;
    reintentar = false;
    intento++;
    audio.pause();
    iniciando = false;
    reproduciendo = false;
    estadoMusica.textContent = "";
    guardarPreferencia();
    actualizarBotones();
  }

  function mostrarPanel(mostrar, devolverFoco = false) {
    panelMusica.hidden = !mostrar;
    actualizarBotones();
    if (devolverFoco) {
      const boton = botonApertura?.isConnected ? botonApertura : botonesMusica().find((item) => item.isConnected);
      boton?.focus();
    }
  }

  // Delegado en document: los botones ♫ cambian al navegar sin recargar la página.
  document.addEventListener("click", (evento) => {
    const boton = evento.target.closest?.(".musica-boton");
    if (!boton) return;
    botonApertura = boton;
    mostrarPanel(panelMusica.hidden);
  });
  document.querySelector("#musica-cerrar").addEventListener("click", () => mostrarPanel(false, true));
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !panelMusica.hidden) {
      evento.stopPropagation();
      mostrarPanel(false, true);
    }
  }, true);

  reproducirMusica.addEventListener("click", () => {
    if (reproduciendo || iniciando) pausar();
    else {
      apagada = false;
      estadoMusica.textContent = "";
      guardarPreferencia();
      reproducir();
    }
  });

  // El reintento automático no invade los controles de la radio ni enciende
  // de nuevo la música cuando el visitante ya la pausó.
  function trasInteraccion(evento) {
    if ((!reintentar && !inicioPendiente) || apagada || evento.target.closest?.(".musica-boton, .musica-panel")) return;
    if (evento.type === "keydown" && (evento.repeat || evento.ctrlKey || evento.altKey || evento.metaKey)) return;
    reproducir();
  }
  document.addEventListener("pointerdown", trasInteraccion, true);
  document.addEventListener("keydown", trasInteraccion, true);

  function formatearTiempo(segundos) {
    if (!Number.isFinite(segundos) || segundos < 0) return "--:--";
    const total = Math.floor(segundos);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function actualizarProgreso() {
    const disponible = Number.isFinite(audio.duration) && audio.duration > 0;
    progreso.disabled = !disponible;
    progreso.max = disponible ? String(audio.duration) : "0";
    progreso.value = disponible ? String(audio.currentTime || 0) : "0";
    tiempoMusica.textContent = formatearTiempo(audio.currentTime || 0);
    duracionMusica.textContent = formatearTiempo(audio.duration);
  }

  function cambiarPista(nuevoIndice, iniciar) {
    indice = (nuevoIndice + canciones.length) % canciones.length;
    const cancion = canciones[indice];
    intento++;
    audio.src = fuenteCompatible(cancion.dataset.pista);
    tituloMusica.textContent = cancion.querySelector("span").textContent;
    artistaMusica.textContent = cancion.dataset.artista;
    canciones.forEach((item, i) => {
      if (i === indice) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
    estadoMusica.textContent = "";
    actualizarProgreso();
    if (iniciar) {
      apagada = false;
      guardarPreferencia();
      reproducir();
    } else {
      iniciando = false;
      reproduciendo = false;
      actualizarBotones();
    }
  }

  canciones.forEach((cancion, i) => cancion.addEventListener("click", () => cambiarPista(i, true)));
  document.querySelector("#musica-anterior").addEventListener("click", () => cambiarPista(indice - 1, reproduciendo || iniciando));
  document.querySelector("#musica-siguiente").addEventListener("click", () => cambiarPista(indice + 1, reproduciendo || iniciando));
  function saltar(segundos) {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + segundos));
    }
  }
  document.querySelector("#musica-retroceder").addEventListener("click", () => saltar(-10));
  document.querySelector("#musica-adelantar").addEventListener("click", () => saltar(10));
  progreso.addEventListener("input", () => { if (!progreso.disabled) audio.currentTime = Number(progreso.value); });
  volumen.addEventListener("input", () => { audio.volume = Number(volumen.value); });
  audio.addEventListener("loadedmetadata", actualizarProgreso);
  audio.addEventListener("durationchange", actualizarProgreso);
  audio.addEventListener("timeupdate", actualizarProgreso);
  audio.addEventListener("playing", () => {
    if (apagada) { audio.pause(); return; }
    iniciando = false;
    reproduciendo = true;
    reintentar = false;
    estadoMusica.textContent = "";
    actualizarBotones();
  });
  audio.addEventListener("pause", () => {
    reproduciendo = false;
    actualizarBotones();
  });
  audio.addEventListener("ended", () => {
    if (!apagada) cambiarPista(indice + 1, true);
  });
  audio.addEventListener("error", () => {
    if (!apagada) estadoMusica.textContent = "No se pudo cargar la pista. Revisa tu conexión e inténtalo de nuevo.";
  });

  // Al cambiar de página el documento se recarga y el audio se pierde. Guardamos
  // pista, posición y si sonaba, y al llegar a la página siguiente se retoma.
  const CLAVE_SESION = "pixel_galletas_musica_sesion";
  function guardarSesion() {
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify({
        indice,
        posicion: audio.currentTime || 0,
        sonaba: reproduciendo || iniciando,
      }));
    } catch { /* sin almacenamiento */ }
  }
  function restaurarSesion() {
    let guardado = null;
    try { guardado = JSON.parse(sessionStorage.getItem(CLAVE_SESION)); } catch { /* sin datos */ }
    if (!guardado || !Number.isInteger(guardado.indice)) return false;
    indice = (guardado.indice + canciones.length) % canciones.length;
    audio.src = fuenteCompatible(canciones[indice].dataset.pista);
    tituloMusica.textContent = canciones[indice].querySelector("span").textContent;
    artistaMusica.textContent = canciones[indice].dataset.artista;
    canciones.forEach((item, i) => {
      if (i === indice) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
    const posicion = Number(guardado.posicion) || 0;
    audio.addEventListener("loadedmetadata", () => {
      if (posicion > 0 && posicion < audio.duration) audio.currentTime = posicion;
    }, { once: true });
    return guardado.sonaba === true;
  }

  window.addEventListener("pagehide", guardarSesion);
  window.addEventListener("beforeunload", guardarSesion);
  setInterval(() => { if (reproduciendo) guardarSesion(); }, 1000);

  // Cada página nueva arranca con una pista al azar, distinta de la anterior.
  // Así no siempre suena "Still Life" y la música cambia al navegar.
  const haySesion = sessionStorage.getItem(CLAVE_SESION) !== null;
  let anterior = -1;
  if (haySesion) {
    try { anterior = JSON.parse(sessionStorage.getItem(CLAVE_SESION)).indice; } catch { /* sin datos */ }
  }
  let azar = Math.floor(Math.random() * canciones.length);
  if (canciones.length > 1 && azar === anterior) azar = (azar + 1) % canciones.length;
  sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ indice: azar, posicion: 0, sonaba: true }));
  inicioPendiente = restaurarSesion() && !apagada;
  actualizarBotones();
  actualizarProgreso();
  window.addEventListener("load", () => {
    const entrada = document.querySelector("#entrada");
    const demora = entrada && !entrada.hidden ? 2400 : 0;
    setTimeout(() => { if (!apagada && inicioPendiente) reproducir(); }, demora);
  });
}
