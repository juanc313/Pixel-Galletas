// Navegación sin recargar: al pulsar un enlace interno se cambia solo <main>.
// El <audio> y el panel del reproductor están fuera de <main>, así que la
// música sigue sonando. Los módulos de la página nueva se vuelven a importar
// con un parámetro distinto (los módulos ya cargados no se ejecutan dos veces).
let version = 0;
let paginaActual = location.pathname + location.search;

function enlaceInterno(evento) {
  if (evento.defaultPrevented || evento.button !== 0) return null;
  if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return null;
  const enlace = evento.target.closest?.("a[href]");
  if (!enlace || (enlace.target && enlace.target !== "_self") || enlace.hasAttribute("download")) return null;
  const url = new URL(enlace.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return null;
  // Ancla dentro de la misma página: el navegador ya se encarga.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return null;
  return url;
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
  if (destino) destino.scrollIntoView();
  else window.scrollTo(0, 0);

  version++;
  for (const script of doc.querySelectorAll('script[type="module"][src]')) {
    const src = script.getAttribute("src");
    if (src === "/js/navegacion.js") continue;
    await import(`${src}?nav=${version}`);
  }
}

document.addEventListener("click", (evento) => {
  const url = enlaceInterno(evento);
  if (!url) return;
  evento.preventDefault();
  irA(url, true).catch(() => { location.href = url.href; });
});

window.addEventListener("popstate", () => {
  if (location.pathname + location.search === paginaActual) return;
  irA(new URL(location.href), false).catch(() => { location.reload(); });
});
