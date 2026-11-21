// Sala de juegos: "Atrapa la galleta".
//
// Un minijuego de reflejos —no de suerte— con la caja de arena hecha de botones
// de verdad: se juega con ratón, con el dedo, con teclado y con lector de
// pantalla, sin un cursor propio que estorbe al resto de la página.
//
// Reglas:
//   · 30 segundos por ronda. Cada galleta atrapada vale 10 puntos y cada tres
//     seguidas suben el multiplicador de racha (×1 a ×4), como los combos de
//     arcade. Pulsar una casilla vacía rompe la racha.
//   · Con movimiento reducido no hay prisa ni reloj: las galletas esperan
//     quietas a que las atrapen y la ronda dura hasta cazar las doce. Este
//     modo no compite por el récord (sería comparar dos juegos distintos).
//   · El récord vive en el navegador (localStorage), nunca en el servidor.
//
// El bucle es un solo requestAnimationFrame con el tiempo entre fotogramas
// acotado: así la partida no se descuadra si el navegador se estrangula o si
// el jugador se va a otra pestaña, y el reloj se puede pausar sin cuentas
// raras. Si la sección sale de pantalla, la ronda se detiene y sigue al volver.

import { urlWhatsApp } from "./config.js";

export const DURACION_MS = 30000;
export const PUNTOS_POR_GALLETA = 10;
export const FILAS = 3;
export const COLUMNAS = 4;
export const VIDA_GALLETA = 1000;   // lo que tarda una galleta en esconderse
export const RITMO_INICIAL = 780;   // cada cuánto sale una galleta nueva

// Rangos por puntos: la escalera que se anuncia al final de la ronda. Los
// cortes salen de medir la ronda con un jugador automático perfecto (1.710
// puntos, el techo práctico) y de calcular a ojo lo que caza una persona en 30
// segundos: una partida floja (8-10 galletas) ronda los 100-150 puntos, una
// buena (18-20) los 400, y por encima de 750 hay que dominar la rejilla.
export const RANGOS = [
  { desde: 0, nombre: "Aprendiz de horno", nota: "Se te escaparon unas cuantas, pero ya tienes el ritmo." },
  { desde: 150, nombre: "Veloz", nota: "Reflejos de recreativa." },
  { desde: 400, nombre: "Cazador de sabores", nota: "Casi ninguna se te escapa." },
  { desde: 750, nombre: "Leyenda Pixel", nota: "Nivel legendario: te las sabes todas." },
];

// Rango que corresponde a una puntuación (el más alto que ya se alcanzó).
export function rangoPara(puntos) {
  let elegido = RANGOS[0];
  for (const rango of RANGOS) if (puntos >= rango.desde) elegido = rango;
  return elegido;
}

// Multiplicador de racha: ×1, ×2, ×3 y ×4 a los 9 aciertos seguidos.
export function multiplicadorDe(racha) {
  return Math.min(4, 1 + Math.floor(racha / 3));
}

// Índice de la casilla a la que lleva cada flecha, moviéndose por la rejilla
// (izquierda y derecha saltan de fila al llegar al borde, como en un menú).
export function huecoSiguiente(actual, tecla, filas = FILAS, columnas = COLUMNAS) {
  const total = filas * columnas;
  if (tecla === "ArrowRight") return actual % columnas === columnas - 1 ? actual - (columnas - 1) : actual + 1;
  if (tecla === "ArrowLeft") return actual % columnas === 0 ? actual + (columnas - 1) : actual - 1;
  if (tecla === "ArrowDown") return (actual + columnas) % total;
  if (tecla === "ArrowUp") return (actual - columnas + total) % total;
  if (tecla === "Home") return 0;
  if (tecla === "End") return total - 1;
  return actual;
}

const CLAVE_RECORD = "pixel_galletas_record";

function iniciarJuego(doc = document) {
  const panel = doc.getElementById("juego-panel");
  const arena = doc.getElementById("juego-arena");
  const boton = doc.getElementById("juego-empezar");
  if (!panel || !arena || !boton) return;

  const huecos = [...arena.querySelectorAll(".hueco")];
  if (!huecos.length) return;

  const $ = (id) => doc.getElementById(id);
  const marcador = {
    puntos: $("juego-puntos"),
    racha: $("juego-racha"),
    tiempo: $("juego-tiempo"),
    record: $("juego-record"),
    estado: $("juego-estado"),
    final: $("juego-final"),
    rango: $("juego-rango"),
    wa: $("juego-wa"),
  };

  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const vivas = new Map();   // casilla -> milisegundos que le quedan
  let puntos = 0, racha = 0, aciertos = 0, restante = DURACION_MS, espera = 0;
  let corriendo = false, raf = 0, ultimo = 0, visible = true;

  const leerRecord = () => {
    try { return Number(localStorage.getItem(CLAVE_RECORD)) || 0; } catch { return 0; }
  };
  const guardarRecord = (valor) => {
    try { localStorage.setItem(CLAVE_RECORD, String(valor)); } catch { /* modo privado */ }
  };
  let record = leerRecord();
  if (marcador.record) marcador.record.textContent = String(record);

  const decir = (texto) => { if (marcador.estado) marcador.estado.textContent = texto; };
  const pintarPuntos = () => {
    if (marcador.puntos) marcador.puntos.textContent = String(puntos);
    if (marcador.racha) marcador.racha.textContent = `×${multiplicadorDe(racha)}`;
  };
  const pintarTiempo = () => {
    if (!marcador.tiempo) return;
    marcador.tiempo.textContent = reducido ? "∞" : String(Math.max(0, Math.ceil(restante / 1000)));
  };

  // --- Casillas: salir del horno, atrapar y fallar ------------------------
  const esconder = (indice) => {
    vivas.delete(indice);
    huecos[indice].classList.remove("listo");
  };
  const limpiarArena = () => {
    vivas.clear();
    for (const hueco of huecos) hueco.classList.remove("listo", "atrapada", "fallo");
  };

  const lanzarGalleta = () => {
    const libres = huecos.map((_, i) => i).filter((i) => !vivas.has(i));
    if (!libres.length) return;
    const indice = libres[Math.floor(Math.random() * libres.length)];
    vivas.set(indice, VIDA_GALLETA);
    huecos[indice].classList.add("listo");
  };

  const atrapar = (indice) => {
    const hueco = huecos[indice];
    if (!corriendo) return;
    if (!vivas.has(indice)) {
      // Casilla vacía: se pierde la racha y la casilla lo acusa.
      if (racha > 0) decir("Se escapó la racha. Sigue así, que vuelve.");
      racha = 0;
      pintarPuntos();
      hueco.classList.add("fallo");
      setTimeout(() => hueco.classList.remove("fallo"), 300);
      return;
    }
    vivas.delete(indice);
    racha += 1;
    aciertos += 1;
    const ganados = PUNTOS_POR_GALLETA * multiplicadorDe(racha);
    puntos += ganados;
    hueco.classList.remove("listo");
    hueco.dataset.mas = `+${ganados}`;
    hueco.classList.add("atrapada");
    setTimeout(() => hueco.classList.remove("atrapada"), 620);
    pintarPuntos();
    decir(`${ganados > PUNTOS_POR_GALLETA ? `¡Combo ×${multiplicadorDe(racha)}! ` : ""}${puntos} puntos.`);
    if (reducido && aciertos >= huecos.length) terminar();
  };

  // --- Ronda ---------------------------------------------------------------
  const ritmo = () => Math.max(380, RITMO_INICIAL - puntos / 4);

  const bucle = (t) => {
    if (!corriendo) return;
    const dt = Math.min(t - ultimo, 120);   // acotado: ni pestañas dormidas ni tirones
    ultimo = t;
    if (!visible) { raf = requestAnimationFrame(bucle); return; }

    if (!reducido) {
      restante -= dt;
      pintarTiempo();
      for (const [indice, queda] of [...vivas]) {
        if (queda - dt <= 0) esconder(indice);
        else vivas.set(indice, queda - dt);
      }
      if (restante <= 0) { terminar(); return; }
    }
    espera -= dt;
    if (espera <= 0) { lanzarGalleta(); espera = ritmo(); }
    raf = requestAnimationFrame(bucle);
  };

  const empezar = () => {
    cancelAnimationFrame(raf);
    limpiarArena();
    puntos = 0; racha = 0; aciertos = 0; restante = DURACION_MS; espera = 0;
    corriendo = true;
    panel.classList.add("en-marcha");
    if (marcador.final) marcador.final.hidden = true;
    boton.textContent = "Reiniciar la ronda";
    pintarPuntos();
    pintarTiempo();
    decir(reducido
      ? "Sin prisa: las galletas esperan hasta que las atrapes. Atrapa las doce."
      : "¡A jugar! Atrapa las galletas antes de que se escondan.");
    ultimo = performance.now();
    raf = requestAnimationFrame(bucle);
  };

  const terminar = () => {
    corriendo = false;
    cancelAnimationFrame(raf);
    limpiarArena();
    panel.classList.remove("en-marcha");
    boton.textContent = "Otra ronda";
    const rango = rangoPara(puntos);
    doc.defaultView?.dispatchEvent(new CustomEvent("logro", { detail: "arcade" })); // logros.js
    const nuevoRecord = !reducido && puntos > record;
    if (nuevoRecord) { record = puntos; guardarRecord(record); if (marcador.record) marcador.record.textContent = String(record); }
    if (marcador.rango) {
      marcador.rango.replaceChildren();
      const fuerte = doc.createElement("b");
      fuerte.textContent = rango.nombre;
      marcador.rango.append("Rango: ", fuerte, ` · ${puntos} puntos`);
      if (nuevoRecord) marcador.rango.append(" · ¡nuevo récord!");
    }
    if (marcador.final) marcador.final.hidden = false;
    if (marcador.wa) {
      marcador.wa.href = urlWhatsApp(
        `¡Hola Pixel Galletas! Jugué «Atrapa la galleta» en su web y quedé en el rango ${rango.nombre} con ${puntos} puntos 🎮🍪`
      );
    }
    decir(`${rango.nota} Para volver a intentarlo, pulsa «Otra ronda».`);
  };

  // --- Interacción --------------------------------------------------------
  arena.addEventListener("click", (e) => {
    const hueco = e.target.closest(".hueco");
    if (!hueco) return;
    atrapar(huecos.indexOf(hueco));
  });

  // Rejilla con un solo tabulador: las flechas mueven el foco por las casillas
  // y con Enter o espacio se atrapa, como en cualquier menú del sitio.
  huecos.forEach((hueco, i) => hueco.setAttribute("tabindex", i === 0 ? "0" : "-1"));
  const enfocar = (indice) => {
    huecos.forEach((h, i) => h.setAttribute("tabindex", i === indice ? "0" : "-1"));
    huecos[indice].focus();
  };
  arena.addEventListener("keydown", (e) => {
    const hueco = e.target.closest(".hueco");
    if (!hueco) return;
    const actual = huecos.indexOf(hueco);
    const siguiente = huecoSiguiente(actual, e.key);
    if (siguiente !== actual) { e.preventDefault(); enfocar(siguiente); }
  });

  boton.addEventListener("click", empezar);
  panel.classList.add("juego-listo");

  // La ronda se detiene si el jugador se va a otra pestaña o se lleva la
  // sección fuera de pantalla: el reloj no corre a sus espaldas.
  doc.addEventListener("visibilitychange", () => { visible = !doc.hidden; ultimo = performance.now(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entrada]) => { visible = entrada.isIntersecting; ultimo = performance.now(); },
      { threshold: 0.15 }
    ).observe(panel);
  }
}

if (typeof document !== "undefined") iniciarJuego();
