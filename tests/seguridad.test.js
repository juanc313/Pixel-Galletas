// Pruebas de seguridad (XSS): que el frontend no vuelva a interpretar texto como
// HTML y que la política CSP siga bloqueando scripts en línea.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), "utf8");
const archivos = (carpeta, extension) =>
  fs
    .readdirSync(path.join(raiz, carpeta))
    .filter((f) => f.endsWith(extension))
    .map((f) => path.join(carpeta, f));

// Líneas de código (sin comentarios de una línea), para no dar falsos positivos.
const codigo = (ruta) =>
  leer(ruta)
    .split(/\r?\n/)
    .filter((linea) => !/^\s*\/\//.test(linea));

// Sumideros que convierten una cadena en HTML/código ejecutable.
const SUMIDEROS = [
  /\.innerHTML\s*(\+?=)(?!=)/,
  /\.outerHTML\s*=(?!=)/,
  /insertAdjacentHTML\s*\(/,
  /document\.write(ln)?\s*\(/,
  /\beval\s*\(/,
  /new Function\s*\(/,
  /\.html\s*\(/,
];

test("XSS: ningún script del frontend asigna HTML a partir de texto", () => {
  for (const ruta of archivos("public/js", ".js")) {
    codigo(ruta).forEach((linea, i) => {
      for (const sumidero of SUMIDEROS) {
        assert.ok(!sumidero.test(linea), `${ruta}:${i + 1} usa un sumidero de HTML: ${linea.trim()}`);
      }
    });
  }
});

test("XSS: las páginas no tienen scripts en línea ni atributos on* (la CSP los bloquea)", () => {
  for (const ruta of archivos("public", ".html")) {
    const html = leer(ruta);
    // Cada <script> debe traer src, o ser un bloque de datos JSON-LD (no se ejecuta).
    for (const [etiqueta] of html.matchAll(/<script\b[^>]*>/gi)) {
      const esDatos = /type\s*=\s*["']application\/ld\+json["']/i.test(etiqueta);
      const tieneSrc = /\ssrc\s*=/i.test(etiqueta);
      assert.ok(esDatos || tieneSrc, `${ruta} tiene un <script> en línea: ${etiqueta}`);
    }
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html), `${ruta} tiene un atributo de evento en línea`);
  }
});

test("CSP: script-src solo permite el propio sitio, sin 'unsafe-inline' ni 'unsafe-eval'", () => {
  const vercel = JSON.parse(leer("vercel.json"));
  const csp = vercel.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === "Content-Security-Policy").value;
  const scriptSrc = csp.match(/script-src\s+([^;]+)/)[1].trim();
  assert.equal(scriptSrc, "'self'");
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);

  // La misma política en el servidor (helmet) debe coincidir.
  const app = leer("src/app.js");
  assert.match(app, /scriptSrc:\s*\["'self'"\]/);
  assert.doesNotMatch(app, /scriptSrc:[^\]]*unsafe/);
});
