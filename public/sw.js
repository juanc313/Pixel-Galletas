// Service worker: lo necesario para que la web sea instalable y para que abrirla
// sin conexión muestre una página clara en vez de una a medias.
// No cachea la API ni las peticiones que no sean GET del propio sitio,
// para que los pedidos y los datos de sesión nunca se sirvan desde caché.
const CACHE_BASE = "pixel-galletas-v4";
const CACHE_EXTRA = "pixel-galletas-extra-v4";
const MAX_EXTRA = 60; // la caché de recursos sueltos no crece sin límite
const OFFLINE = "/offline.html";
// Todo lo que necesita la página sin conexión para verse completa.
const BASICOS = [
  OFFLINE,
  "/css/fuentes.css",
  "/css/styles.css",
  "/css/tema-claro.css",
  "/js/tema.js",
  "/js/offline.js",
  "/fonts/rubik-400-latin.woff2",
  "/fonts/silkscreen-400-latin.woff2",
  "/fonts/silkscreen-700-latin.woff2",
  "/fonts/jersey15-cifras.woff2",
  "/img/logo-256.webp",
  "/img/favicon.png",
  "/manifest.json",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE_BASE).then((c) => c.addAll(BASICOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE_BASE && k !== CACHE_EXTRA).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// navegacion.js añade ?nav=N para que los módulos se vuelvan a ejecutar. Es el
// mismo archivo: se guarda una sola vez o la caché crecería con cada cambio de página.
function claveDe(url) {
  if (!url.searchParams.has("nav")) return url.href;
  const limpia = new URL(url.href);
  limpia.searchParams.delete("nav");
  return limpia.href;
}

// Solo respuestas completas (nada de 206) y del propio sitio. El HTML no se
// guarda: sin red se muestra la página sin conexión, no una portada sin datos.
function sePuedeGuardar(respuesta) {
  return respuesta.status === 200 && respuesta.type === "basic" &&
    !(respuesta.headers.get("content-type") || "").includes("text/html");
}

async function guardar(url, copia) {
  try {
    const nombre = BASICOS.includes(url.pathname) ? CACHE_BASE : CACHE_EXTRA;
    const cache = await caches.open(nombre);
    await cache.put(claveDe(url), copia);
    if (nombre !== CACHE_EXTRA) return;
    const claves = await cache.keys();
    await Promise.all(claves.slice(0, Math.max(0, claves.length - MAX_EXTRA)).map((k) => cache.delete(k)));
  } catch { /* sin espacio: la página sigue funcionando desde la red */ }
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (pedido.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api")) return;
  // El navegador gestiona audio y video y sus peticiones Range directamente. Así
  // no se guardan archivos grandes ni respuestas parciales.
  if (url.pathname.startsWith("/audio/") || pedido.destination === "video" || pedido.destination === "audio" || pedido.headers.has("range")) return;

  // Solo una navegación puede recibir HTML de reemplazo.
  if (pedido.mode === "navigate") {
    evento.respondWith(fetch(pedido).catch(() => caches.match(OFFLINE)));
    return;
  }

  evento.respondWith(
    fetch(pedido).then((respuesta) => {
      if (sePuedeGuardar(respuesta)) {
        // Se clona ahora: cuando la página lea el cuerpo ya no se podrá copiar.
        const copia = respuesta.clone();
        evento.waitUntil(guardar(url, copia));
      }
      return respuesta;
    }).catch(() => caches.match(claveDe(url)).then((r) => r || Response.error()))
  );
});
