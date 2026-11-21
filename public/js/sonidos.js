// Efectos de sonido de 8 bits. No hay archivos: el navegador los toca nota por
// nota con osciladores (Web Audio), así que pesan 0 KB y suenan a consola retro.
//
// Reglas para que sumen y no espanten:
//   · Solo suenan cuando el cliente hace algo (agregar, subir de nivel, pedir,
//     hablar con Pixelito). Nada suena por su cuenta.
//   · El cliente los apaga en el panel de música ("Efectos de sonido") y la
//     tienda lo recuerda. El volumen sigue al deslizador de la música.
//   · Si en el mismo instante piden sonar dos efectos (la galleta que suma y el
//     LEVEL UP que provoca), suena solo el más importante.

const CLAVE = "pixel_galletas_sonidos";

// Nota → frecuencia (La4 = 440 Hz).
const NOTAS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
export function frecuencia(nota) {
  const m = /^([A-G])(#?)(\d)$/.exec(nota);
  if (!m) throw new Error(`Nota inválida: ${nota}`);
  const semitonos = NOTAS[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semitonos / 12);
}

// Cada efecto: prioridad y notas [nota | "ruido" | null (silencio), segundos, forma de onda].
// Todos son ORIGINALES: ninguno copia sonidos conocidos de videojuegos (hay
// una prueba que vigila, por ejemplo, que no vuelva la moneda de Mario: Si5 → Mi6).
export const EFECTOS = {
  clic:     { prioridad: 0, notas: [["A5", 0.03, "square"]], volumen: 0.5 },
  blip:     { prioridad: 0, notas: [["E5", 0.035, "triangle"]], volumen: 0.6 },
  dialogo:  { prioridad: 1, notas: [["C5", 0.05, "triangle"], ["G5", 0.08, "triangle"]] },
  // Agregar galleta: mordisco crujiente y un "bling" de sexta, la firma de Pixel Galletas.
  galleta:  { prioridad: 1, notas: [["ruido", 0.04], [null, 0.015], ["C6", 0.05, "triangle"], ["A6", 0.12, "triangle"]] },
  combo:    { prioridad: 2, notas: ["C5", "D5", "E5", "F#5", "G#5", "A#5", "C6"].map((n) => [n, 0.04, "square"]) },
  nivel2:   { prioridad: 3, notas: [["C5", 0.07, "square"], ["E5", 0.07, "square"], ["G5", 0.07, "square"], ["C6", 0.18, "square"]] },
  nivel3:   { prioridad: 3, notas: [["D5", 0.06, "square"], ["F#5", 0.06, "square"], ["A5", 0.06, "square"], ["D6", 0.06, "square"], ["F#6", 0.06, "square"], ["A6", 0.22, "square"]] },
  max:      { prioridad: 4, notas: [["C5", 0.08, "square"], ["E5", 0.08, "square"], ["G5", 0.08, "square"], ["C6", 0.16, "square"], [null, 0.05],
    ["A5", 0.08, "square"], ["B5", 0.08, "square"], ["C6", 0.08, "square"], ["E6", 0.36, "square"]] },
  // Logro desbloqueado: dos saltos ascendentes y un brillo largo, en Sol mayor.
  logro:    { prioridad: 4, notas: [["D5", 0.06, "triangle"], ["G5", 0.06, "triangle"], [null, 0.03],
    ["B5", 0.06, "triangle"], ["D6", 0.06, "triangle"], ["G6", 0.28, "triangle"]] },
  // Pedido confirmado: jingle propio de la marca, en Fa mayor.
  victoria: { prioridad: 5, notas: [["F4", 0.1, "square"], ["A4", 0.1, "square"], ["C5", 0.1, "square"], [null, 0.04],
    ["A#4", 0.1, "square"], ["C5", 0.1, "square"], ["D5", 0.1, "square"], ["F5", 0.42, "square"]] },
};

// El efecto de subir al nivel N de la barra de poder ("2", "3" o "MAX").
export const efectoDeNivel = (nivel) => (nivel === "MAX" ? "max" : `nivel${Math.min(Number(nivel) || 2, 3)}`);

// De varios pedidos simultáneos, el de mayor prioridad.
export function elegirEfecto(nombres) {
  return nombres.filter((n) => EFECTOS[n]).sort((a, b) => EFECTOS[b].prioridad - EFECTOS[a].prioridad)[0] || null;
}

export function sonidosActivos() {
  try { return localStorage.getItem(CLAVE) !== "0"; } catch { return true; }
}
export function activarSonidos(si) {
  try { localStorage.setItem(CLAVE, si ? "1" : "0"); } catch { /* modo privado */ }
}

let contexto = null;
let pendientes = [];

function volumenGeneral() {
  const deslizador = typeof document !== "undefined" && document.getElementById("musica-volumen");
  return 0.18 * (deslizador ? Number(deslizador.value) : 0.35);
}

function tocar(nombre) {
  const efecto = EFECTOS[nombre];
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  contexto ||= new Ctx();
  if (contexto.state === "suspended") contexto.resume();
  const salida = contexto.createGain();
  salida.gain.value = volumenGeneral() * (efecto.volumen ?? 1);
  salida.connect(contexto.destination);
  let t = contexto.currentTime + 0.01;
  for (const [nota, dur, forma] of efecto.notas) {
    if (nota === "ruido") {
      // Crujido: ruido blanco que se apaga rápido, como un mordisco.
      const muestras = Math.ceil(contexto.sampleRate * dur);
      const buffer = contexto.createBuffer(1, muestras, contexto.sampleRate);
      const datos = buffer.getChannelData(0);
      for (let i = 0; i < muestras; i++) datos[i] = (Math.random() * 2 - 1) * (1 - i / muestras) ** 2;
      const fuente = contexto.createBufferSource();
      const env = contexto.createGain();
      env.gain.value = 0.7;
      fuente.buffer = buffer;
      fuente.connect(env).connect(salida);
      fuente.start(t);
    } else if (nota) {
      const osc = contexto.createOscillator();
      const env = contexto.createGain();
      osc.type = forma;
      osc.frequency.value = frecuencia(nota);
      // Ataque y caída cortos: suena a chip, sin chasquidos.
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.005);
      env.gain.setValueAtTime(1, t + dur * 0.7);
      env.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(env).connect(salida);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    t += dur;
  }
}

// Pide un efecto. Se agrupan los pedidos del mismo instante y suena el principal.
export function sonar(nombre) {
  if (typeof window === "undefined" || !EFECTOS[nombre] || !sonidosActivos() || document.hidden) return;
  pendientes.push(nombre);
  if (pendientes.length > 1) return;
  setTimeout(() => {
    const elegido = elegirEfecto(pendientes);
    pendientes = [];
    try { if (elegido) tocar(elegido); } catch { /* sin audio: la tienda sigue igual */ }
  }, 0);
}

// Interruptor "Efectos de sonido" dentro del panel de música de la página.
function agregarInterruptor() {
  const volumen = document.querySelector("#musica-panel .musica-volumen");
  if (!volumen || document.getElementById("sonidos-efectos")) return;
  const etiqueta = document.createElement("label");
  etiqueta.className = "musica-efectos";
  etiqueta.htmlFor = "sonidos-efectos";
  const casilla = document.createElement("input");
  casilla.type = "checkbox";
  casilla.id = "sonidos-efectos";
  casilla.checked = sonidosActivos();
  casilla.addEventListener("change", () => {
    activarSonidos(casilla.checked);
    if (casilla.checked) sonar("galleta"); // para que se oiga cómo suenan
  });
  etiqueta.append(casilla, document.createTextNode(" Efectos de sonido (galletas, niveles y Pixelito)"));
  volumen.after(etiqueta);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", agregarInterruptor);
  else agregarInterruptor();
}
