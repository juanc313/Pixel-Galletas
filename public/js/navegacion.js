// Navegación sin recargar: al pulsar un enlace interno se cambia solo <main>.
// El <audio> y el panel del reproductor están fuera de <main>, así que la
// música sigue sonando. Los módulos de la página nueva se vuelven a importar
// con un parámetro distinto (los módulos ya cargados no se ejecutan dos veces).
let version = 0;
let paginaActual = globalThis.location ? location.pathname + location.search : "";

// Lo que una página espera encontrar fuera de <main>. Abierta directamente, la
// página del combo no trae nada de esto, y cambiarle solo <main> por el de la
// portada dejaba la tienda sin cabecera, sin pie y con los módulos fallando.
const CASCARA = ["header.barra", "footer.pie", "#mini-carrito"];

// ¿Se puede pintar la página destino sobre lo que ya hay fuera de <main>?
export function cabeEnCascara(docDestino, docActual) {
  return CASCARA.every((pieza) => !docDestino.querySelector(pieza) || docActual.querySelector(pieza));
}

// Los enlaces del menú son "#pedido": fuera de la portada apuntan a una sección
// que no existe aquí, así que hay que llevarlos a la portada.
export function destinoDeAncla(ruta, ancla, existe) {
  if (existe || ruta === "/" || ruta === "/index.html") return null;
  return `/${ancla}`;
}

function enlaceInterno(evento) {
  if (evento.defaultPrevented || evento.button !== 0) return null;
  if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return null;
  const enlace = evento.target.closest?.("a[href]");
  if (!enlace || (enlace.target && enlace.target !== "_self") || enlace.hasAttribute("download")) return null;
  const url = new URL(enlace.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return null;
  // Ancla dentro de la misma página: el navegador ya se encarga.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) {
    const existe = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    const portada = destinoDeAncla(location.pathname, url.hash, existe);
    return portada ? new URL(portada, location.href) : null;
  }
  return url;
}

// El catálogo se pinta después de saltar al ancla y empuja lo de abajo unos
// 2.000 px: el cliente se quedaba a medio camino de su carrito. Se corrige una
// sola vez por llegada, y no si mientras tanto ya se movió por su cuenta.
let anclaPendiente = false;
function reajustarAncla() {
  if (!anclaPendiente) return;
  anclaPendiente = false;
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

// efectos.js prepara el revelado de secciones solo al cargar la primera página,
// así que las secciones de una página nueva se revelan aquí.
function revelarNuevo(raiz) {
  const secciones = raiz.querySelectorAll("[data-reveal]");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    secciones.forEach((el) => el.classList.add("visible"));
    return;
  }
  const o = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("visible");
      o.unobserve(e.target);
    });
  }, { threshold: 0, rootMargin: "0px 0px -40px 0px" });
  secciones.forEach((el) => o.observe(el));
}

async function irA(url, guardarHistorial) {
  const respuesta = await fetch(url.href, { headers: { Accept: "text/html" } });
  const tipo = respuesta.headers.get("content-type") || "";
  if (!respuesta.ok || !tipo.includes("text/html")) throw new Error("Respuesta no válida");

  const doc = new DOMParser().parseFromString(await respuesta.text(), "text/html");
  const nuevoMain = doc.querySelector("main");
  const actual = document.querySelector("main");
  if (!nuevoMain || !actual) throw new Error("Página sin <main>");
  if (!cabeEnCascara(doc, document)) throw new Error("Falta la cabecera de la página destino");

  actual.replaceWith(nuevoMain);
  revelarNuevo(nuevoMain);
  document.body.className = doc.body.className;
  document.title = doc.title;
  for (const hoja of doc.querySelectorAll('link[rel="stylesheet"]')) {
    const href = hoja.getAttribute("href");
    if (!document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
      document.head.append(document.importNode(hoja, true));
    }
  }

  if (guardarHistorial) history.pushState({}, "", url.href);
  paginaActual = url.pathname + url.search;
  const destino = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
  if (destino) { destino.scrollIntoView(); anclaPendiente = true; }
  else window.scrollTo(0, 0);

  version++;
  for (const script of doc.querySelectorAll('script[type="module"][src]')) {
    const src = script.getAttribute("src");
    if (src === "/js/navegacion.js") continue;
    await import(`${src}?nav=${version}`);
  }
}

// Carga real de la página. Asignar location.href no recarga cuando la URL solo
// cambia en el #, que es justo lo que pasa si la navegación suave ya alcanzó a
// escribir la dirección nueva antes de fallar: ahí hay que recargar a mano.
function cargaCompleta(url) {
  // El cliente va a una sección concreta (su carrito, los combos): no se le
  // detiene con la pantalla de título.
  if (url.hash) {
    try { sessionStorage.setItem("pixel_galletas_entrada", "1"); } catch { /* sin sessionStorage */ }
  }
  if (url.pathname === location.pathname && url.search === location.search) {
    history.replaceState(null, "", url.href);
    location.reload();
  } else {
    location.href = url.href;
  }
}

if (typeof document !== "undefined") {
  anclaPendiente = !!location.hash;
  window.addEventListener("catalogo-cargado", reajustarAncla);
  for (const gesto of ["wheel", "touchstart"]) {
    window.addEventListener(gesto, () => { anclaPendiente = false; }, { passive: true });
  }

  document.addEventListener("click", (evento) => {
    const url = enlaceInterno(evento);
    if (!url) return;
    evento.preventDefault();
    irA(url, true).catch(() => cargaCompleta(url));
  });

  window.addEventListener("popstate", () => {
    if (location.pathname + location.search === paginaActual) return;
    irA(new URL(location.href), false).catch(() => { location.reload(); });
  });
}
