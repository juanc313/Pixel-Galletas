// Service worker mínimo: lo necesario para que la web sea instalable.
// No cachea la API ni las peticiones que no sean GET del propio sitio,
// para que los pedidos y los datos de sesión nunca se sirvan desde caché.
const CACHE = "pixel-galletas-v3";
const BASICOS = ["/", "/index.html", "/css/styles.css", "/css/fuentes.css", "/manifest.json"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  // El navegador gestiona el audio y sus peticiones Range directamente. Así no
  // se guardan pistas grandes ni se devuelve HTML cuando falla la conexión.
  if (pedido.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api") || url.pathname.startsWith("/audio/")) return;

  evento.respondWith(
    fetch(pedido).then((respuesta) => {
      if (respuesta.ok) caches.open(CACHE).then((c) => c.put(pedido, respuesta.clone()));
      return respuesta;
    }).catch(() => caches.match(pedido).then((r) => r || caches.match("/index.html")))
  );
});
