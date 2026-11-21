// Logros: medallas que el cliente desbloquea comprando y jugando. Viven solo en
// este navegador (localStorage): no piden cuenta, no viajan al servidor y no
// guardan nada personal, solo qué medallas tiene, cuántos pedidos hizo aquí y
// qué sabores ha pedido.
import { comboDe, DESCUENTOS } from "./pedidos.js";
import { escucharGlobal } from "./registro-global.js";
import { sonar } from "./sonidos.js";

export const LOGROS = [
  { id: "primera-galleta", icono: "🍪", nombre: "Primer mordisco", detalle: "Agregaste tu primera galleta al carrito." },
  { id: "primer-pedido", icono: "📜", nombre: "Misión aceptada", detalle: "Hiciste tu primer pedido." },
  { id: "combo", icono: "🎁", nombre: "¡Combo!", detalle: "Armaste un combo Special Edition." },
  { id: "descuento", icono: "⚡", nombre: "Power-up", detalle: `Llegaste al primer descuento con ${DESCUENTOS[0].desde} galletas.` },
  { id: "nivel-max", icono: "👑", nombre: "Nivel máximo", detalle: `Llegaste al ${DESCUENTOS.at(-1).porcentaje}% de descuento con ${DESCUENTOS.at(-1).desde} galletas.` },
  { id: "coleccionista", icono: "🌈", nombre: "Coleccionista", detalle: "Pediste 5 sabores distintos." },
  { id: "cliente-fiel", icono: "💜", nombre: "Jugador fiel", detalle: "Hiciste 3 pedidos." },
  { id: "charla", icono: "💬", nombre: "Amigo de Pixelito", detalle: "Conversaste con Pixelito." },
  { id: "arcade", icono: "🕹️", nombre: "Atrapa galletas", detalle: "Jugaste una ronda de «Atrapa la galleta»." },
];
export const SABORES_COLECCIONISTA = 5;
export const PEDIDOS_FIEL = 3;

// Logros que cumple un carrito: items [{ nombre, cantidad }].
export function logrosDelCarrito(items) {
  const unidades = items.reduce((s, i) => s + (i.cantidad || 0), 0);
  const ids = [];
  if (unidades >= 1) ids.push("primera-galleta");
  if (comboDe(items)) ids.push("combo");
  else {
    if (unidades >= DESCUENTOS[0].desde) ids.push("descuento");
    if (unidades >= DESCUENTOS.at(-1).desde) ids.push("nivel-max");
  }
  return ids;
}

// Logros que cumple el historial de este navegador: { pedidos, sabores }.
export function logrosDelHistorial({ pedidos = 0, sabores = [] } = {}) {
  const ids = [];
  if (pedidos >= 1) ids.push("primer-pedido");
  if (pedidos >= PEDIDOS_FIEL) ids.push("cliente-fiel");
  if (new Set(sabores).size >= SABORES_COLECCIONISTA) ids.push("coleccionista");
  return ids;
}

// Suma un pedido al historial sin repetir sabores. Devuelve un historial nuevo.
export function sumarPedido(historial, nombres) {
  return {
    pedidos: (historial.pedidos || 0) + 1,
    sabores: [...new Set([...(historial.sabores || []), ...nombres])],
  };
}

// ---------- Lo que se guarda en el navegador ----------

const CLAVE = "pixel_galletas_logros";
const vacio = () => ({ desbloqueados: {}, pedidos: 0, sabores: [] });

export function leerEstado() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    return d && typeof d === "object" ? { ...vacio(), ...d } : vacio();
  } catch { return vacio(); }
}
function guardarEstado(estado) {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* modo privado: solo esta visita */ }
}

// ---------- En pantalla ----------

const el = (tag, clase, texto) => {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
};

const cola = [];
let mostrando = false;

// Aviso de "¡Logro desbloqueado!" con Pixelito. Si llegan varios juntos, salen
// uno detrás de otro. Tocarlo abre la lista de logros.
function avisar(logro) {
  cola.push(logro);
  if (!mostrando) siguienteAviso();
}

function siguienteAviso() {
  const logro = cola.shift();
  if (!logro) { mostrando = false; return; }
  mostrando = true;
  const aviso = el("button", "logro-aviso");
  aviso.type = "button";
  aviso.setAttribute("aria-label", `Logro desbloqueado: ${logro.nombre}. ${logro.detalle} Ver mis logros.`);
  const cara = el("img", "logro-aviso-pixelito");
  cara.src = "/img/pixelito-celebra.webp";
  cara.alt = "";
  cara.width = 400;
  cara.height = 386;
  const texto = el("span", "logro-aviso-texto");
  texto.append(el("small", "", "¡Logro desbloqueado!"), el("b", "", `${logro.icono} ${logro.nombre}`), el("span", "", logro.detalle));
  aviso.append(cara, texto);
  aviso.addEventListener("click", () => { cerrar(); abrirLogros(); });
  document.body.append(aviso);
  sonar("logro");
  // Lo anuncia el lector de pantalla sin robarle el foco a lo que hacía el cliente.
  const voz = document.getElementById("logros-voz") || document.body.appendChild(Object.assign(el("p", "logro-voz"), { id: "logros-voz" }));
  voz.setAttribute("aria-live", "polite");
  voz.textContent = `Logro desbloqueado: ${logro.nombre}`;
  let hecho = false;
  function cerrar() {
    if (hecho) return;
    hecho = true;
    aviso.classList.add("saliendo");
    setTimeout(() => { aviso.remove(); siguienteAviso(); }, 300);
  }
  setTimeout(cerrar, 4500);
}

export function desbloquear(ids) {
  const estado = leerEstado();
  const nuevos = ids.filter((id) => !estado.desbloqueados[id] && LOGROS.some((l) => l.id === id));
  if (!nuevos.length) return [];
  for (const id of nuevos) estado.desbloqueados[id] = new Date().toISOString();
  guardarEstado(estado);
  for (const id of nuevos) avisar(LOGROS.find((l) => l.id === id));
  pintarLista();
  return nuevos;
}

// Lista de todos los logros: los que faltan se ven apagados, pero con su pista,
// para que el cliente sepa qué le falta por conseguir.
let dialogo = null;
function crearDialogo() {
  dialogo = el("dialog", "logros-dialogo");
  dialogo.setAttribute("aria-labelledby", "logros-titulo");
  const cabeza = el("div", "logros-cabeza");
  const titulo = el("h2", "", "🏆 Mis logros");
  titulo.id = "logros-titulo";
  const cerrar = el("button", "logros-cerrar", "×");
  cerrar.type = "button";
  cerrar.setAttribute("aria-label", "Cerrar mis logros");
  cerrar.addEventListener("click", () => dialogo.close());
  cabeza.append(titulo, cerrar);
  dialogo.append(cabeza, el("p", "logros-cuenta"), el("ul", "logros-lista"),
    el("p", "logros-nota", "Tus logros se guardan en este dispositivo."));
  // Tocar fuera de la caja también cierra.
  dialogo.addEventListener("click", (e) => { if (e.target === dialogo) dialogo.close(); });
  document.body.append(dialogo);
}

function pintarLista() {
  if (!dialogo) return;
  const { desbloqueados } = leerEstado();
  const tiene = LOGROS.filter((l) => desbloqueados[l.id]).length;
  dialogo.querySelector(".logros-cuenta").textContent = `${tiene} de ${LOGROS.length} desbloqueados`;
  dialogo.querySelector(".logros-lista").replaceChildren(...LOGROS.map((l) => {
    const li = el("li", desbloqueados[l.id] ? "logro logro-si" : "logro logro-no");
    const icono = el("span", "logro-icono", desbloqueados[l.id] ? l.icono : "🔒");
    icono.setAttribute("aria-hidden", "true");
    const texto = el("span", "logro-texto");
    texto.append(el("b", "", l.nombre), el("span", "", l.detalle));
    const lector = el("span", "logro-lector", desbloqueados[l.id] ? " (desbloqueado)" : " (por conseguir)");
    li.append(icono, texto, lector);
    return li;
  }));
}

export function abrirLogros() {
  if (!dialogo) crearDialogo();
  pintarLista();
  if (!dialogo.open) dialogo.showModal();
}

// ---------- Qué desbloquea cada cosa ----------

const carritoGuardado = () => {
  try { return JSON.parse(localStorage.getItem("pixel_galletas_carrito")) || []; } catch { return []; }
};

if (typeof document !== "undefined") {
  escucharGlobal("logros:carrito", "carrito-cambio", () => desbloquear(logrosDelCarrito(carritoGuardado())));
  // pedidos.js lo lanza al confirmar un pedido, con los sabores que llevaba.
  escucharGlobal("logros:pedido", "pedido-hecho", (e) => {
    const estado = leerEstado();
    const historial = sumarPedido(estado, (e.detail?.sabores || []).filter(Boolean));
    guardarEstado({ ...estado, ...historial });
    desbloquear(logrosDelHistorial(historial));
  });
  // Logros sueltos: Pixelito, el juego… lanzan "logro" con el id.
  escucharGlobal("logros:suelto", "logro", (e) => desbloquear([e.detail]));
  escucharGlobal("logros:abrir", "abrir-logros", () => abrirLogros());
  escucharGlobal("logros:boton", "click", (e) => {
    if (e.target.closest?.("[data-logros]")) { e.preventDefault(); abrirLogros(); }
  }, document);
}
