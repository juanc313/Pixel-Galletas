// Pixelito, la mascota que conversa. Habla con un guion (sin inteligencia
// artificial): gratis, sin costo por mensaje y sin riesgo de inventarse un
// precio. Toda cifra que dice sale de las MISMAS tablas que cobra el carrito
// (pedidos.js y pedidos-grandes.js), así que nunca contradice el total.
//
// Personalidad: gamer, bromista, tierno y entusiasta, con aire de personaje de
// videojuego retro. Español neutro y, de vez en cuando, una palabra cucuteña.
//
// Reglas para que caiga bien y no espante compradores:
//   · Aparece como una burbujita en la esquina, nunca como ventana que tapa.
//   · Habla por su cuenta como mucho TRES veces por visita, y cada momento una sola vez.
//   · Nunca interrumpe mientras el cliente escribe en un formulario.
//   · Si el cliente lo cierra, no vuelve a hablar solo en esa visita.
//   · Con "reducir movimiento", no se anima.
import {
  pesos, comboDe, tramoDescuento, DESCUENTOS, COMBOS, ENTREGAS, RANGOS_DISTANCIA,
  ENVIO_GRATIS_DESDE, NOMBRE_SPECIAL,
} from "./pedidos.js";
import { MINIMO_GALLETAS, diasDeAviso } from "./pedidos-grandes.js";
import { CONTACTO, urlWhatsApp } from "./config.js";
import { Sesion } from "./api.js";
import { sonar } from "./sonidos.js";
import { resumenStats, statsDe, idSabor, BARRAS_STATS, STATS_MAX } from "./stats-sabores.js";
import { abrirDesplegable } from "./desplegables.js";
import { ETAPAS_MISION } from "./mision.js";

// ---------- Lo que dice (lógica pura, con pruebas) ----------

const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];

// Antojos para la misión "encontrar tu galleta": cada uno apunta a un sabor.
export const ANTOJOS = [
  { id: "chocolate", boton: "🍫 Chocolate a full", sabor: "Pixel Chocolate",
    frase: "chips de cacao y galleta Biscolata. ¡Poder de chocolate al máximo!" },
  { id: "cremoso", boton: "🥛 Algo cremosito", sabor: "Pixel AreKlim",
    frase: "arequipe con leche Klim, M&M y chocolate blanco. Es como un abrazo en forma de galleta." },
  { id: "clasico", boton: "❤️ Un clásico elegante", sabor: "Pixel Red Velvet",
    frase: "red velvet con cobertura de chocolate blanco. Nunca falla, como el primer nivel de tu juego favorito." },
  { id: "raro", boton: "👾 Algo diferente", sabor: "Pixel Monster",
    frase: "chocolate blanco con su toque azul monstruo. ¡Rara por fuera, deliciosa por dentro!" },
  { id: "indeciso", boton: "🤔 No me decido", sabor: "Pixel Red Monster",
    frase: "red velvet y monster en una sola galleta bicolor. ¡Dos sabores, cero dilemas!" },
  { id: "epico", boton: "⭐ Lo más épico", sabor: NOMBRE_SPECIAL,
    frase: "todos nuestros sabores combinados en una. Es el jefe final de las galletas." },
];

const OPCIONES_MENU = [
  { texto: "🍪 Recomiéndame una", ir: "recomendar" },
  { texto: "🎮 Fichas de personaje", ir: "fichas" },
  { texto: "💰 Precios y combos", ir: "precios" },
  { texto: "🚚 Domicilio", ir: "domicilio" },
  { texto: "💳 ¿Cómo pago?", ir: "pago" },
  { texto: "🎉 Pedido grande", ir: "grandes" },
  { texto: "📦 ¿Cómo va mi pedido?", ir: "estado" },
  { texto: "🏆 Mis logros", ir: "logros" },
  { texto: "🙋 Hablar con una persona", ir: "humano" },
];
const VOLVER = { texto: "↩ Menú principal", ir: "inicio" };

// Precio de un sabor según el catálogo cargado; null si no está o se agotó.
export function saborDelCatalogo(catalogo, nombre) {
  const p = (catalogo || []).find((x) => x.nombre === nombre);
  return p && p.disponible !== false ? p : null;
}

// Qué es cada tema, en palabras simples. Pixelito lo explica la PRIMERA vez que
// el cliente toca ese botón en la visita, antes de dar los detalles: así nadie
// llega a "Mis logros" o "Pedido grande" sin saber de qué se trata. Si vuelve
// al mismo tema, va directo a los detalles.
export const INTRO = {
  recomendar: "Te ayudo a escoger: tú me cuentas qué se te antoja y yo te digo cuál de nuestros sabores va contigo. Es como un test de personalidad, pero de galletas. 🍪",
  fichas: "Cada sabor tiene una ficha de personaje, como cuando eliges a tu luchador en un videojuego: una clase y unas barras del 1 al 5 que te dicen cómo sabe, para que escojas sin tener que probarlas todas. 🎮",
  precios: "Aquí te cuento cuánto cuesta cada galleta y cómo pagar menos cuando llevas varias. 💰",
  combos: "Un combo es un paquete que junta la Special Edition, nuestra galleta más épica, con galletas clásicas a un precio fijo, más barato que comprarlas por separado. 🎁",
  domicilio: "Aquí te cuento cómo te llegan tus galletas: puedes pasar a recogerlas o pedir que te las llevemos, y cuánto cuesta cada opción. 🚚",
  pago: "Te cuento cómo se paga tu pedido y cómo cuidarte de estafas. 💳",
  grandes: `Un pedido grande es cuando necesitas muchas galletas de una vez, desde ${MINIMO_GALLETAS}: para un cumpleaños, la oficina o un evento. Como hay que hornear más, se pide con tiempo y te hacemos una cotización aparte. 🎉`,
  estado: `Cuando haces un pedido te damos un número. Con ese número y tu teléfono puedes ver en qué etapa va, como si siguieras una misión: ${ETAPAS_MISION.map((e) => e.titulo.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " y $1")}. 📦`,
  logros: "Los logros son medallas que ganas mientras usas la página, como en los videojuegos. 🏆 No son descuentos ni premios en dinero: son para divertirte y presumir.",
  humano: "Si necesitas algo que yo no sé responder, como un pedido especial, un cambio en tu pedido o una duda puntual, te paso con una persona del equipo de Pixel Galletas por WhatsApp. 🙋",
};

// ---------- Memoria de la conversación ----------
// Pixelito recuerda, durante la visita, si ya se presentó, de qué hablaron por
// última vez y qué sabor recomendó. Así, al volver al menú no se presenta otra
// vez: retoma la charla y sugiere el paso que sigue.
//   memoria = { saludado: bool, ultimo: id del último tema, sabor: nombre | null,
//               vistos: [temas que ya explicó] }

// Tema al que pertenece cada respuesta (para no ofrecer otra vez lo mismo).
export const temaDe = (id) => {
  if (!id) return null;
  if (id.startsWith("antojo:") || id === "agregado" || id === "agotado") return "recomendar";
  if (id === "combos") return "precios";
  return id;
};

// Lo que conviene después de cada tema: el siguiente paso natural hacia el pedido.
const SIGUIENTE = {
  fichas: { texto: "🍪 Recomiéndame una", ir: "recomendar" },
  precios: { texto: "🍪 Recomiéndame sabores", ir: "recomendar" },
  recomendar: { texto: "🚚 ¿Cómo me llegan?", ir: "domicilio" },
  domicilio: { texto: "💳 ¿Cómo pago?", ir: "pago" },
  pago: { texto: "🛒 Ir a hacer mi pedido", ancla: "pedido" },
  grandes: { texto: "📝 Cotizar mi pedido grande", ancla: "pedidos-grandes" },
};

// Cómo retoma la charla según lo último que hablaron.
function retomar({ ultimo, sabor }, unidades) {
  const carrito = unidades ? ` Ya llevas ${unidades} ${unidades === 1 ? "galleta" : "galletas"} en el carrito.` : "";
  switch (ultimo) {
    case "combos":
      return `¿Te cuadró algún combo? 🎁 Si quieres te recomiendo sabores para armarlo, o miramos otra cosa.${carrito}`;
    case "fichas":
      return "¿Ya sabes qué personaje va contigo? 🎮 Si quieres te recomiendo uno según tu antojo.";
    case "precios":
      return `Ya tienes los precios a la mano. 💰 ¿Te recomiendo sabores o vemos otra cosa?${carrito}`;
    case "agregado":
      return `¡Buena elección con la ${sabor || "galleta"}! 😋${carrito} ¿Seguimos con el domicilio o el pago?`;
    case "agotado":
      return "Qué pena lo de esa galleta. 😢 ¿Buscamos otra o te ayudo con algo más?";
    case "recomendar":
      return "¿Todavía no te decides? Tranqui, que yo te ayudo. 🍪 ¿Qué más quieres saber?";
    case "domicilio":
      return `Ya sabes cómo te llegan las galletas. 🚚 ¿Vemos cómo pagar?${carrito}`;
    case "pago":
      return `Con eso ya estás listo para pedir. 💪${carrito} ¿Algo más?`;
    case "grandes":
      return "¿Te animas con el pedido grande? 🎉 Cuéntame qué más necesitas saber.";
    case "estado":
      return "¿Pudiste ver en qué va tu pedido? 📦 ¿Te ayudo con otra cosa?";
    case "logros":
      return "¡A ganar medallas! 🏆 ¿Qué más hacemos?";
    case "humano":
      return "Yo sigo aquí si me necesitas. 👾 ¿Qué más te cuento?";
    default:
      if (ultimo?.startsWith("antojo:")) {
        return `¿Qué tal te pareció la ${sabor || "galleta"} que te recomendé? 😋 ¿La agregamos, buscamos otra o vemos otra cosa?`;
      }
      // Ya se saludaron (por ejemplo, en la burbujita) pero aún no hablan de nada.
      if (!ultimo) return azar([`¡Hola otra vez! 👾 ¿En qué te ayudo?${carrito}`, `¡Aquí estoy! 🍪 ¿Qué necesitas?${carrito}`]);
      return azar([`¡Aquí sigo! 👾 ¿Qué más quieres saber?${carrito}`, `¿Qué más te cuento? 🍪${carrito}`]);
  }
}

// Menú al volver: primero el paso que sigue y luego los temas que faltan, sin
// repetir el que acaban de ver.
function menuDespues({ ultimo, sabor }) {
  const tema = temaDe(ultimo);
  let sugerida = SIGUIENTE[tema] || null;
  // Si le recomendó un sabor y no lo agregó, se lo vuelve a ofrecer primero.
  if (ultimo?.startsWith("antojo:") && sabor) sugerida = { texto: `➕ Agregar la ${sabor}`, agregar: sabor };
  const resto = OPCIONES_MENU.filter((o) => o.ir !== tema && o.ir !== sugerida?.ir);
  return sugerida ? [sugerida, ...resto] : resto;
}

// Actualiza la memoria después de decir `id`. Devuelve una memoria nueva.
export function recordar(memoria, id) {
  const m = { saludado: false, ultimo: null, sabor: null, vistos: [], ...memoria };
  if (id === "inicio") return { ...m, saludado: true };
  const antojo = id.startsWith("antojo:") ? ANTOJOS.find((a) => `antojo:${a.id}` === id) : null;
  const vistos = INTRO[id] && !m.vistos.includes(id) ? [...m.vistos, id] : m.vistos;
  return { ...m, saludado: true, ultimo: id, sabor: antojo ? antojo.sabor : m.sabor, vistos };
}

// Un nodo de la conversación: { texto: [párrafos], opciones: [...] }.
// `datos` = { catalogo, unidades, memoria } (unidades = galletas en el carrito).
export function nodo(id, datos = {}) {
  const catalogo = datos.catalogo || [];
  const unidades = datos.unidades || 0;
  const memoria = datos.memoria || {};
  // La explicación del tema va primero, solo si aún no la dio en esta visita.
  const intro = INTRO[id] && !(memoria.vistos || []).includes(id) ? [INTRO[id]] : [];
  switch (id) {
    case "inicio":
      // Ya se conocen: retoma lo que estaban hablando en vez de presentarse otra vez.
      if (memoria.saludado) return { texto: [retomar(memoria, unidades)], opciones: menuDespues(memoria) };
      return {
        texto: [unidades
          ? azar([`¡Hey, jugador! 👾 Ya llevas ${unidades} ${unidades === 1 ? "galleta" : "galletas"} en el carrito. ¿Te ayudo con algo más?`,
            `¡Volviste! Tu carrito tiene ${unidades} ${unidades === 1 ? "galleta" : "galletas"} esperando. ¿Qué necesitas?`])
          : azar(["¡Hola, jugador! 👾 Soy Pixelito, la galleta oficial de Pixel Galletas. ¿En qué te ayudo?",
            "¡Nuevo jugador detectado! 🎮 Soy Pixelito. Pregúntame lo que quieras, que para eso estoy.",
            "¡Qué más pues! 🍪 Soy Pixelito, tu guía en este nivel de galletas. ¿Qué buscas hoy?"])],
        opciones: OPCIONES_MENU,
      };

    case "recomendar":
      return {
        texto: [...intro, "¡Misión aceptada! 🗺️ Encontremos tu galleta ideal. ¿Qué antojo traes hoy?"],
        opciones: ANTOJOS.map((a) => ({ texto: a.boton, ir: `antojo:${a.id}` })).concat(VOLVER),
      };

    case "fichas": {
      // Las clases salen de la misma tabla que pinta las fichas del catálogo.
      const clases = ANTOJOS.map((a) => ({ sabor: a.sabor, s: statsDe(idSabor(a.sabor)) })).filter((x) => x.s);
      return {
        texto: [...intro,
          `Las barras son tres: ${BARRAS_STATS.map((b) => `${b.icono} ${b.nombre}`).join(", ")}. Dulce es qué tan dulce es, Chocolate es cuánto chocolate lleva, y Mezcla dice si es un solo sabor, la fusión de dos o todos combinados. Entre más cerca de ${STATS_MAX}, más fuerte.`,
          `Los personajes: ${clases.map((x) => `${x.s.clase} es la ${x.sabor}`).join("; ")}.`,
          "Todas son crujientes por fuera y suaves por dentro, por eso la textura no tiene barra.",
          "Las encuentras en el menú de galletas: en cada tarjeta toca «Ver stats». Si tocas «Ver el menú», te llevo allá."],
        opciones: [{ texto: "👀 Ver el menú", ancla: "catalogo" }, { texto: "🍪 Recomiéndame una", ir: "recomendar" }, VOLVER],
      };
    }

    case "precios": {
      const normal =catalogo.find((p) => p.nombre !== NOMBRE_SPECIAL && p.disponible !== false);
      const special = catalogo.find((p) => p.nombre === NOMBRE_SPECIAL);
      const lineas = [...intro];
      if (normal || special) {
        lineas.push(`Galleta clásica: ${normal ? pesos(normal.precio) : "—"} · Special Edition: ${special ? pesos(special.precio) : "—"}. 💰`);
      } else {
        lineas.push("Los precios de cada sabor los ves en el menú de galletas. 💰");
      }
      lineas.push(`Y el bonus, el descuento por cantidad: entre más galletas lleves en un mismo pedido, menos pagas. ${DESCUENTOS.map((t) => `${t.porcentaje}% desde ${t.desde}`).join(", ")} galletas. ¡Entre más galletas, más poder!`);
      return {
        texto: lineas,
        opciones: [{ texto: "🎁 Ver los combos", ir: "combos" }, { texto: "🍪 Recomiéndame una", ir: "recomendar" }, VOLVER],
      };
    }

    case "combos":
      return {
        texto: [...intro,
          ...COMBOS.map((c) => `${c.nombre}: ${c.especiales} Special + ${c.normales} clásicas a ${pesos(c.precio)}.`),
          "Se arman solos: pon esas galletas en el carrito y el combo se aplica. ¡Magia de píxeles!",
          "Si tocas «Ir a los combos», te llevo a la sección donde los ves con más detalle."],
        opciones: [{ texto: "👀 Ir a los combos", ancla: "combos" }, VOLVER],
      };

    case "domicilio": {
      const rangos = Object.values(RANGOS_DISTANCIA);
      return {
        texto: [...intro,
          `Puedes recogerlas en ${ENTREGAS.recoger.nombre.replace("Recoger en ", "")} gratis, siempre. 🏠`,
          `Domicilio en Cúcuta: ${pesos(ENTREGAS.cucuta.costo)}. En Villa del Rosario, Los Patios o El Zulia: ${pesos(ENTREGAS.municipios.costo)}. Se suma de ${pesos(Math.min(...rangos))} a ${pesos(Math.max(...rangos))} según la distancia.`,
          `¡Pero pilas! Desde ${ENVIO_GRATIS_DESDE} galletas el domicilio es GRATIS. 🚚✨`,
          "La forma de entrega la eliges al hacer tu pedido, y ahí mismo ves cuánto queda el total."],
        opciones: [{ texto: "🛒 Ir a mi pedido", ancla: "pedido" }, VOLVER],
      };
    }

    case "pago":
      return {
        texto: [...intro,
          "No pagas en la página: haces tu pedido y, cuando coordinamos la entrega por WhatsApp, pagas en efectivo o por Nequi. 💳",
          "Y ojo: nunca te pediremos un código, una descarga ni un captcha para pagar. Si alguien lo hace, no es Pixel Galletas. 🛡️"],
        opciones: [{ texto: "🛒 Ir a mi pedido", ancla: "pedido" }, VOLVER],
      };

    case "grandes":
      return {
        texto: [...intro,
          `Pedimos un anticipo del 50% y unos días para hornear: ${diasDeAviso(50)} días hasta 50 galletas y ${diasDeAviso(100)} días hasta 100.`,
          "Si tocas «Cotizar mi pedido grande», te llevo a un formulario corto: eliges la ocasión y cuántas galletas, y se abre WhatsApp con tu solicitud lista para enviarnos. Por ahí te respondemos con el precio."],
        opciones: [{ texto: "📝 Cotizar mi pedido grande", ancla: "pedidos-grandes" }, VOLVER],
      };

    case "estado":
      return {
        texto: [...intro,
          "¿Ya pediste? ¡Bien jugado! No necesitas cuenta: solo el número que te salió al terminar el pedido y el teléfono con el que pediste.",
          "Si tocas «Consultar mi pedido», te llevo a donde los escribes."],
        opciones: [{ texto: "🔎 Consultar mi pedido", ancla: "estado" }, VOLVER],
      };

    case "logros":
      return {
        texto: [...intro,
          "Hay medallas por agregar tu primera galleta, por armar un combo, por llegar al descuento máximo, por jugar en la sala de juegos y más.",
          "Cada vez que ganas una te aviso arriba en la pantalla. Se guardan en este dispositivo, sin cuenta, y también las ves en «Mis logros», al final de la página.",
          "¿Vemos cuáles llevas y cuáles te faltan?"],
        opciones: [{ texto: "🏆 Ver mis logros", logros: true }, VOLVER],
      };

    case "humano":
      return {
        texto: [...intro,
          "¡Claro que sí! Si tocas «Abrir WhatsApp», se abre un chat con el equipo con un saludo ya escrito. Ellos sí tienen manos para hornear. 😄"],
        opciones: [{ texto: "💬 Abrir WhatsApp", whatsapp: "¡Hola, Pixel Galletas! Vengo de parte de Pixelito 👾" }, VOLVER],
      };

    case "agregado":
      return {
        texto: [azar(["¡Al carrito! +1 de antojo 🍪", "¡Buen gusto, jugador! 😎 Ya está en tu carrito.", "¡Uy, qué nota! Esa ya va para tu carrito. 🍪"])],
        opciones: [{ texto: "🛒 Ir a mi pedido", ancla: "pedido" }, { texto: "🍪 Ver otra", ir: "recomendar" }, VOLVER],
      };

    case "agotado":
      return {
        texto: ["¡Ay, no! 😢 Esa se nos acabó por hoy. Pero tranqui, que hay más galletas en el castillo."],
        opciones: [{ texto: "🍪 Ver otra", ir: "recomendar" }, VOLVER],
      };

    default:
      if (id.startsWith("antojo:")) {
        const antojo = ANTOJOS.find((a) => a.id === id.slice(7));
        if (!antojo) return nodo("inicio", datos);
        const producto = saborDelCatalogo(catalogo, antojo.sabor);
        // `recuerda`: lo que debe quedar en la memoria (no recomendó nada, se acabó).
        if (!producto && catalogo.length) return { ...nodo("agotado", datos), recuerda: "agotado" };
        const ficha = resumenStats(antojo.sabor);
        return {
          texto: [`Te recomiendo la ${antojo.sabor}${producto ? ` (${pesos(producto.precio)})` : ""}: ${antojo.frase}`,
            ...(ficha ? [`Su ficha de personaje: ${ficha} 🎮`] : [])],
          opciones: [
            producto ? { texto: "➕ Agregar al carrito", agregar: antojo.sabor } : { texto: "👀 Ver el menú", ancla: "catalogo" },
            { texto: "🔄 Otra opción", ir: "recomendar" },
            ...(ficha ? [{ texto: "❓ ¿Qué es la ficha?", ir: "fichas" }] : []),
            VOLVER,
          ],
        };
      }
      return nodo("inicio", datos);
  }
}

// La cara que pone Pixelito en cada momento (dibujos en /img/pixelito-<pose>.webp).
export const POSES_MOMENTO = {
  saludo: "saluda",
  primera: "guino",
  combo: "guino",
  "casi-gratis": "explica",
  quieto: "reloj",
};
export const imagenPose = (pose) => (pose ? `/img/pixelito-${pose}.webp` : "/img/pixelito.webp");

// Lo que Pixelito dice por su cuenta según lo que pasa en la página. Devuelve
// { momento, texto, opciones, pose } o null. `ya` = momentos que ya usó en la visita.
export function momentoProactivo(evento, { unidades = 0, items = [], ya = new Set() } = {}) {
  const una = (momento, texto, opciones = []) =>
    (ya.has(momento) ? null : { momento, texto, opciones, pose: POSES_MOMENTO[momento] });
  if (evento === "saludo") {
    return una("saludo", azar([
      "¡Hey, jugador! 👾 Soy Pixelito. ¿Te ayudo a escoger tu galleta?",
      "¡Psst! 🍪 Si no sabes cuál elegir, yo te ayudo. ¡Es mi superpoder!",
      "¡PRESS START! 🎮 Soy Pixelito y conozco todas las galletas del castillo.",
    ]), [{ texto: "¡Sí, dale!", ir: "recomendar" }, { texto: "Solo estoy mirando", cerrar: true }]);
  }
  if (evento === "carrito" && unidades > 0) {
    const { siguiente } = tramoDescuento(unidades);
    const combo = comboDe(items);
    // A un paso del domicilio gratis y del primer descuento.
    if (!combo && siguiente && siguiente.desde === ENVIO_GRATIS_DESDE && siguiente.desde - unidades <= 2) {
      const faltan = siguiente.desde - unidades;
      return una("casi-gratis", `¡Pilas! ⚡ Te ${faltan === 1 ? "falta 1 galleta" : `faltan ${faltan} galletas`} para el ${siguiente.porcentaje}% de descuento y el domicilio GRATIS.`);
    }
    if (combo) return una("combo", `¡COMBO! 🎁 Armaste el ${combo.nombre}. Precio fijo de ${pesos(combo.precio)}, ¡qué jugada!`);
    if (unidades !== 1) return null;
    return una("primera", azar(["¡Uy, qué buena elección! 🍪 +1 de antojo.", "¡Primera galleta al carrito! 🏆 Así se empieza.", "¡Eso! Ya arrancó la partida. 🎮"]));
  }
  if (evento === "quieto" && unidades > 0) {
    return una("quieto", "¿Seguimos? 🍪 Tu carrito te está esperando, y las galletas no se comen solas… bueno, casi.",
      [{ texto: "🛒 Ir a mi pedido", ancla: "pedido" }, { texto: "Ahorita no", cerrar: true }]);
  }
  return null;
}

// ¿Puede hablar por su cuenta ahora? Nunca mientras escribe, ni si lo cerró.
export function puedeHablarSolo({ silenciado, escribiendo, abierto, hablados, ocupado }) {
  return !silenciado && !escribiendo && !abierto && !ocupado && hablados < 3;
}

// ---------- Cómo aparece en pantalla ----------

const CLAVE_SILENCIO = "pixelito_silenciado";
const CLAVE_YA = "pixelito_momentos";
const CLAVE_MEMORIA = "pixelito_memoria"; // de qué hablaron en esta visita
const leerSesion = (k, def) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? def; } catch { return def; } };
const guardarSesion = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } };

class PixelitoVista {
  constructor() {
    this.catalogo = [];
    this.abierto = false;
    this.ya = new Set(leerSesion(CLAVE_YA, []));
    this.silenciado = leerSesion(CLAVE_SILENCIO, false);
    this.memoria = leerSesion(CLAVE_MEMORIA, {});
    this.quietoTimer = null;
    this.crear();
    this.escuchar();
  }

  get items() {
    try { return JSON.parse(localStorage.getItem("pixel_galletas_carrito")) || []; } catch { return []; }
  }
  get unidades() { return this.items.reduce((s, i) => s + (i.cantidad || 0), 0); }

  crear() {
    // Se arma nodo por nodo: el sitio no usa innerHTML en ningún lado (prueba de seguridad).
    const el = (tag, attrs = {}, ...hijos) => {
      const n = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "texto") n.textContent = v;
        else if (k === "hidden") n.hidden = v;
        else n.setAttribute(k, v);
      }
      n.append(...hijos);
      return n;
    };
    const cara = (pose) => el("img", { src: imagenPose(pose), alt: "", width: "360", height: "397" });
    const raiz = el("div", { class: "pixelito-bot", id: "pixelito-bot" },
      el("div", { class: "pixelito-burbuja", id: "pixelito-burbuja", hidden: true },
        el("button", { type: "button", class: "pixelito-burbuja-cerrar", "aria-label": "Cerrar mensaje de Pixelito", texto: "×" }),
        el("p", { class: "pixelito-burbuja-texto", "aria-live": "polite" }),
        el("div", { class: "pixelito-burbuja-opciones" })),
      el("section", { class: "pixelito-panel", id: "pixelito-panel", role: "dialog", "aria-label": "Chat con Pixelito", hidden: true },
        el("header", { class: "pixelito-panel-cabeza" },
          cara("explica"),
          el("p", {}, el("b", { texto: "Pixelito" }), el("span", { texto: "Guía gamer de Pixel Galletas" })),
          el("button", { type: "button", class: "pixelito-cerrar", "aria-label": "Cerrar el chat", texto: "×" })),
        el("div", { class: "pixelito-mensajes", "aria-live": "polite" }),
        el("div", { class: "pixelito-opciones" })),
      el("button", { type: "button", class: "pixelito-lanzador", id: "pixelito-lanzador", "aria-expanded": "false",
        "aria-controls": "pixelito-panel", "aria-label": "Hablar con Pixelito" }, cara()));
    document.body.append(raiz);
    this.$ = (sel) => raiz.querySelector(sel);
    this.raiz = raiz;
  }

  // Cambia la cara del botón flotante o de la cabeza del chat.
  ponerCara(sel, pose) {
    const img = this.$(sel);
    const src = imagenPose(pose);
    if (img && img.getAttribute("src") !== src) img.src = src;
  }

  escuchar() {
    this.$(".pixelito-lanzador").addEventListener("click", () => {
      if (this.abierto) return this.cerrar();
      sonar("dialogo");
      return this.abrir("inicio");
    });
    this.$(".pixelito-cerrar").addEventListener("click", () => this.cerrar());
    this.$(".pixelito-burbuja-cerrar").addEventListener("click", () => this.silenciar());
    this.raiz.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-opcion]");
      if (b) this.elegir(JSON.parse(b.dataset.opcion), b.textContent);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.abierto) this.cerrar(); });
    window.addEventListener("catalogo-cargado", (e) => { this.catalogo = e.detail || []; });

    // Mientras el cliente escribe, Pixelito se aparta y no habla.
    document.addEventListener("focusin", (e) => {
      if (e.target.closest?.("form") && !e.target.closest(".pixelito-bot")) this.raiz.classList.add("apartado");
    });
    document.addEventListener("focusout", () => setTimeout(() => {
      if (!document.activeElement?.closest?.("form")) this.raiz.classList.remove("apartado");
    }, 50));

    let previas = this.unidades;
    window.addEventListener("carrito-cambio", () => {
      const ahora = this.unidades;
      if (ahora > previas) this.proactivo("carrito");
      previas = ahora;
      this.programarQuieto();
    });

    // Sus caras se cargan antes de que hable, para que al cambiar no parpadee.
    setTimeout(() => {
      for (const pose of new Set([...Object.values(POSES_MOMENTO), "explica", "pensando"])) new Image().src = imagenPose(pose);
    }, 8000);
    // Saludo: unos segundos después de llegar, cuando la portada de entrada ya se fue.
    setTimeout(() => this.proactivo("saludo"), 14000);
    this.programarQuieto();
  }

  programarQuieto() {
    clearTimeout(this.quietoTimer);
    this.quietoTimer = setTimeout(() => {
      const enPedido = document.getElementById("pedido")?.getBoundingClientRect();
      const viendoPedido = enPedido && enPedido.top < innerHeight && enPedido.bottom > 0;
      if (!viendoPedido) this.proactivo("quieto");
    }, 90000);
  }

  ocupado() {
    // La portada de entrada, un visor o el panel de música ocupan la pantalla.
    const entrada = document.querySelector(".entrada");
    if (entrada && getComputedStyle(entrada).display !== "none" && !entrada.hidden) return true;
    if (document.querySelector("dialog[open]")) return true;
    // El dueño, con sesión de administrador, no necesita que le vendan.
    return Sesion.obtener()?.usuario?.rol === "admin";
  }

  proactivo(evento) {
    const permitido = puedeHablarSolo({
      silenciado: this.silenciado,
      escribiendo: this.raiz.classList.contains("apartado"),
      abierto: this.abierto,
      hablados: this.ya.size,
      ocupado: this.ocupado(),
    });
    if (!permitido) {
      // El saludo espera su momento (portada de entrada, cliente escribiendo)
      // en vez de perderse; los demás momentos no se repiten tarde.
      if (evento === "saludo" && !this.silenciado && (this.reintentos = (this.reintentos || 0) + 1) <= 6) {
        setTimeout(() => this.proactivo("saludo"), 10000);
      }
      return;
    }
    const m = momentoProactivo(evento, { unidades: this.unidades, items: this.items, ya: this.ya });
    if (!m) return;
    this.ya.add(m.momento);
    guardarSesion(CLAVE_YA, [...this.ya]);
    // Si ya se presentó en la burbujita, en el chat no se vuelve a presentar.
    if (m.momento === "saludo") this.recordar("inicio");
    this.mostrarBurbuja(m.texto, m.opciones, m.pose);
  }

  mostrarBurbuja(texto, opciones, pose) {
    const burbuja = this.$("#pixelito-burbuja");
    this.ponerCara(".pixelito-lanzador img", pose);
    this.$(".pixelito-burbuja-texto").textContent = texto;
    this.pintarOpciones(this.$(".pixelito-burbuja-opciones"), opciones);
    burbuja.hidden = false;
    this.raiz.classList.add("hablando");
    clearTimeout(this.burbujaTimer);
    // Sin botones, el mensaje se va solo; con botones espera la respuesta un rato.
    this.burbujaTimer = setTimeout(() => this.ocultarBurbuja(), opciones.length ? 20000 : 7000);
  }

  ocultarBurbuja() {
    this.$("#pixelito-burbuja").hidden = true;
    this.raiz.classList.remove("hablando");
    this.ponerCara(".pixelito-lanzador img"); // vuelve a su cara de siempre
  }

  silenciar() {
    this.silenciado = true;
    guardarSesion(CLAVE_SILENCIO, true);
    this.ocultarBurbuja();
  }

  abrir(id) {
    this.ocultarBurbuja();
    this.abierto = true;
    this.$("#pixelito-panel").hidden = false;
    this.$(".pixelito-lanzador").setAttribute("aria-expanded", "true");
    this.raiz.classList.add("abierto");
    window.dispatchEvent(new CustomEvent("logro", { detail: "charla" })); // logros.js
    if (id === null) return; // lo abrió una respuesta de la burbuja: habla esa respuesta
    if (!this.$(".pixelito-mensajes").children.length || id !== "inicio") this.decir(id);
    else this.$(".pixelito-opciones button")?.focus();
  }

  cerrar() {
    this.abierto = false;
    this.$("#pixelito-panel").hidden = true;
    this.$(".pixelito-lanzador").setAttribute("aria-expanded", "false");
    this.raiz.classList.remove("abierto");
    this.$(".pixelito-lanzador").focus();
  }

  // Pixelito "escribe" un instante antes de cada mensaje: le da ritmo de charla.
  recordar(id) {
    this.memoria = recordar(this.memoria, id);
    guardarSesion(CLAVE_MEMORIA, this.memoria);
  }

  async decir(id) {
    const n = nodo(id, { catalogo: this.catalogo, unidades: this.unidades, memoria: this.memoria });
    this.recordar(n.recuerda || id);
    const opciones = this.$(".pixelito-opciones");
    opciones.replaceChildren();
    for (const parrafo of n.texto) {
      const escribiendo = this.burbujaChat("", "pixelito escribiendo");
      escribiendo.textContent = "• • •";
      this.ponerCara(".pixelito-panel-cabeza img", "pensando"); // piensa mientras "escribe"
      await new Promise((r) => setTimeout(r, Math.min(900, 300 + parrafo.length * 6)));
      this.ponerCara(".pixelito-panel-cabeza img", "explica");
      escribiendo.className = "pixelito-msg pixelito";
      escribiendo.textContent = parrafo;
      sonar("blip"); // Pixelito "habla" como personaje de RPG
      this.bajar();
    }
    this.pintarOpciones(opciones, n.opciones);
    this.bajar(); // los botones achican el área de mensajes: el último sigue a la vista
    opciones.querySelector("button")?.focus({ preventScroll: true });
  }

  burbujaChat(texto, clase) {
    const p = document.createElement("p");
    p.className = `pixelito-msg ${clase}`;
    p.textContent = texto;
    this.$(".pixelito-mensajes").append(p);
    this.bajar();
    return p;
  }

  bajar() {
    const m = this.$(".pixelito-mensajes");
    m.scrollTop = m.scrollHeight;
  }

  pintarOpciones(contenedor, opciones) {
    contenedor.replaceChildren(...opciones.map((o) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pixelito-opcion";
      b.textContent = o.texto;
      b.dataset.opcion = JSON.stringify(o);
      return b;
    }));
  }

  elegir(opcion, texto) {
    if (opcion.cerrar) { this.silenciar(); return; }
    sonar("clic");
    if (!this.abierto) {
      // Viene de la burbuja: lo que Pixelito dijo queda arriba en el chat.
      const dicho = this.$(".pixelito-burbuja-texto").textContent;
      this.abrir(null);
      if (dicho) this.burbujaChat(dicho, "pixelito");
    }
    this.burbujaChat(texto, "cliente");
    if (opcion.ir) return this.decir(opcion.ir);
    if (opcion.agregar) {
      const producto = saborDelCatalogo(this.catalogo, opcion.agregar);
      if (!producto) return this.decir("agotado");
      window.dispatchEvent(new CustomEvent("agregar-al-carrito", { detail: producto }));
      return this.decir("agregado");
    }
    if (opcion.ancla) {
      this.cerrar();
      const destino = document.getElementById(opcion.ancla);
      abrirDesplegable(opcion.ancla); // si la sección está plegada, se abre antes de llegar
      if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
      else location.href = `/#${opcion.ancla}`;
      return undefined;
    }
    if (opcion.logros) {
      this.cerrar();
      window.dispatchEvent(new Event("abrir-logros")); // lo abre logros.js
      return undefined;
    }
    if (opcion.whatsapp) {
      window.open(urlWhatsApp(opcion.whatsapp, CONTACTO.whatsapp), "_blank", "noopener");
      return this.decir("inicio");
    }
    return undefined;
  }
}

// Una sola vez por página: al navegar sin recargar el módulo vuelve a correr.
if (typeof document !== "undefined" && !document.getElementById("pixelito-bot")) {
  new PixelitoVista();
}
