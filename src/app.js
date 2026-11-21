const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const usuarioRoutes = require("./routes/usuarioRoutes");
const productoRoutes = require("./routes/productoRoutes");
const pedidoRoutes = require("./routes/pedidoRoutes");
const eventoRoutes = require("./routes/eventoRoutes");
const carritoRoutes = require("./routes/carritoRoutes");
const { TelegramController } = require("./controllers/telegramController");
const { limiteApi, limiteLogin, limiteRegistro } = require("./middlewares/limites");

const app = express();

// Detrás de un proxy (nginx, Cloudflare…) Express debe confiar en su cabecera
// X-Forwarded-For para que los límites de tasa cuenten al cliente real y no al
// proxy. Sin proxy, la variable no existe y no se confía en nadie.
// En Vercel (VERCEL=1) el proxy es la propia plataforma, así que también se confía
// en él: sin esto, todos los visitantes compartirían el mismo contador de límites.
if (process.env.TRUST_PROXY || process.env.VERCEL) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

// Cabeceras de seguridad (helmet). La CSP es estricta: todo sale de este
// dominio (fuentes e imágenes incluidas), sin scripts ni estilos inline. Los
// JSON-LD del <head> son bloques de datos, no scripts ejecutables, y no la
// tocan.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        // Solo atributos style="" (propiedades --a/--dist de las brasas), no <style> ni scripts.
        styleSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        // Helmet añade upgrade-insecure-requests por defecto, y eso hace que el navegador
        // pida CSS y JS por HTTPS. En local (HTTP, p. ej. desde el celular en la red
        // Wi-Fi) rompe la página. En producción se mantiene como estaba.
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // no se cargan recursos de otros orígenes
  })
);

// CORS por lista blanca: el front se sirve desde ESTE servidor, así que la API
// no necesita abrirse al mundo entero (antes cors() aceptaba cualquier origen).
// Los orígenes extra (si algún día los hay) se declaran en ORIGENES_PERMITIDOS,
// separados por comas. Las peticiones sin cabecera Origin (curl, pruebas, mismo
// servidor) no son cross-origin y pasan siempre.
const permitidos = (process.env.ORIGENES_PERMITIDOS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origen, callback) => callback(null, !origen || permitidos.includes(origen)),
  })
);

app.use(express.json({ limit: "100kb" })); // un pedido pesa gramos, no megas

// Sin cuerpo (p. ej. POST vacío), Express 5 deja req.body indefinido y los
// controladores fallaban con 500 al leer sus campos. Se normaliza a {}.
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));

// Red general de la API. Debajo, cada ruta sensible suma su propio límite.
app.use("/api", limiteApi);

app.get("/api", (req, res) => {
  res.json({
    mensaje: "API Pixel Galletas funcionando correctamente",
    evidencia: "GA4-220501096-AA1-EV02",
    endpoints: {
      usuarios: "/api/usuarios",
      productos: "/api/productos",
      pedidos: "/api/pedidos",
      medicion: "/api/eventos",
    },
  });
});

// Versión publicada: la app la compara con la que tiene abierta para avisar
// "¡Nueva versión disponible!". En Vercel es el commit del despliegue; en local,
// "local" (nunca cambia, así que en desarrollo no salta el aviso).
app.get("/api/version", (req, res) => {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "local";
  res.set("Cache-Control", "no-store");
  res.json({ version: String(version).slice(0, 12) });
});

app.use("/api/usuarios/login", limiteLogin);
app.use("/api/usuarios/registro", limiteRegistro);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/productos", productoRoutes);
app.use("/api/pedidos", pedidoRoutes);
app.use("/api/eventos", eventoRoutes);
app.use("/api/carrito", carritoRoutes);
// Botones del aviso de Telegram (la clave del webhook la valida el controlador).
app.post("/api/telegram/webhook", TelegramController.webhook);

// Sitemap: el dominio final no vive en el código, así que sale de SITIO_URL.
// Sin esa variable no hay sitemap (404), en vez de publicar una URL inventada.
// También en /api/sitemap.xml: vercel.json reenvía ahí la ruta pública.
app.get(["/sitemap.xml", "/api/sitemap.xml"], (req, res) => {
  const base = (process.env.SITIO_URL || "").replace(/\/+$/, "");
  if (!base) return res.status(404).json({ error: "Ruta no encontrada" });
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${base}/</loc></url>\n` +
      `  <url><loc>${base}/seguimiento-pedido.html</loc></url>\n` +
      `  <url><loc>${base}/preguntas-gamer.html</loc></url>\n` +
      `  <url><loc>${base}/historia-marca.html</loc></url>\n` +
      `  <url><loc>${base}/memoria-8bit.html</loc></url>\n` +
      `  <url><loc>${base}/privacidad.html</loc></url>\n` +
      `  <url><loc>${base}/terminos.html</loc></url>\n` +
      `</urlset>\n`
  );
});

// Sin ruta: la API responde JSON; una visita normal recibe la página 404 del sitio.
app.use((req, res) => {
  if (req.path.startsWith("/api") || !req.accepts("html")) {
    return res.status(404).json({ error: "Ruta no encontrada" });
  }
  res.status(404).sendFile(path.join(__dirname, "..", "public", "404.html"));
});

// Errores de petición (p. ej. JSON mal formado): sin esto Express devuelve su
// página con la traza completa del servidor, con rutas internas del equipo.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("[error]", err);
  if (req.path.startsWith("/api") || !req.accepts("html")) {
    return res.status(status).json({ error: status >= 500 ? "Error interno del servidor" : "Petición no válida" });
  }
  res.status(status).type("text/plain").send("Error");
});

module.exports = app;
