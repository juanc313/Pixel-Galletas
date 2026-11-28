// Idiomas (español e inglés): el motor de idioma.js, el diccionario en.json y
// el botón ES/EN de cada página.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const vm = require("node:vm");

const raiz = path.join(__dirname, "..");
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), "utf8");
// idioma.js es un script clásico del navegador (public/js está marcado como
// módulos): se ejecuta aparte, sin document, y deja sus funciones en module.
const contexto = { module: { exports: {} } };
vm.runInNewContext(leer("public/js/idioma.js"), contexto);
const { normalizar, idiomaGuardado, sePuedeEntero, decodificar, Traductor } = contexto.module.exports;

const PAGINAS = ["index.html", "privacidad.html", "terminos.html", "historia-marca.html", "preguntas-gamer.html",
  "memoria-8bit.html", "seguimiento-pedido.html", "combo-personalizado.html", "404.html"];

// Un nodo de texto mínimo, como los del navegador.
const texto = (valor) => ({ nodeType: 3, nodeValue: valor });

test("Idioma: normaliza espacios y saltos de línea como lo hace el HTML", () => {
  assert.equal(normalizar("  Hola\n   mundo  "), "Hola mundo");
  assert.equal(normalizar("<b>Nequi</b>\t313"), "<b>Nequi</b> 313");
});

test("Idioma: las entidades que deja DeepL se leen como texto, no como HTML", () => {
  assert.equal(decodificar("Cookies &amp; cream"), "Cookies & cream");
  assert.equal(decodificar("&lt;script&gt;"), "<script>", "queda como texto: nunca se interpreta");
});

test("Idioma: recuerda la elección y, si no hay o es rara, usa español", () => {
  const almacen = (valor) => ({ getItem: () => valor });
  assert.equal(idiomaGuardado(almacen("en")), "en");
  assert.equal(idiomaGuardado(almacen("es")), "es");
  assert.equal(idiomaGuardado(almacen(null)), "es");
  assert.equal(idiomaGuardado(almacen("fr")), "es", "un idioma que no existe no rompe la página");
  assert.equal(idiomaGuardado({ getItem() { throw new Error("modo privado"); } }), "es");
});

test("Idioma: traduce un texto y conserva los espacios de los bordes", () => {
  const t = new Traductor({ Carrito: "Cart" });
  const nodo = texto("Carrito ");
  t.traducirTexto(nodo);
  assert.equal(nodo.nodeValue, "Cart ", "el espacio antes del contador se conserva");
  const otro = texto("Galletas");
  t.traducirTexto(otro);
  assert.equal(otro.nodeValue, "Galletas", "lo que no está en el diccionario queda igual");
});

test("Idioma: no usa traducciones vacías ni iguales al original", () => {
  const t = new Traductor({ "Pixel Galletas": "Pixel Galletas", Vacio: "", Hola: "Hello" });
  assert.equal(t.buscar("Pixel Galletas"), null);
  assert.equal(t.buscar("Vacio"), null);
  assert.equal(t.buscar("  Hola "), "Hello");
});

test("Idioma: al volver al español respeta lo que otro código cambió mientras tanto", () => {
  const t = new Traductor({ Acceso: "Sign in", Estado: "Status" });
  const acceso = texto("Acceso");
  const estado = texto("Estado");
  t.traducirTexto(acceso);
  t.traducirTexto(estado);
  acceso.nodeValue = "Juan"; // auth.js puso el nombre del cliente
  t.restaurar();
  assert.equal(acceso.nodeValue, "Juan", "no se pisa el nombre");
  assert.equal(estado.nodeValue, "Estado", "lo que no cambió vuelve al español");
});

test("Idioma: solo traduce un párrafo entero si sus hijos son formato simple", () => {
  const hijo = (tagName, id = "", atributos = []) => ({ tagName, id, attributes: atributos });
  const elemento = (hijos) => ({ children: hijos, querySelectorAll: () => hijos });
  assert.equal(sePuedeEntero(elemento([hijo("B"), hijo("A")])), true);
  assert.equal(sePuedeEntero(elemento([hijo("SPAN", "carrito-contador")])), false, "un hijo con id lo usa el código");
  assert.equal(sePuedeEntero(elemento([hijo("BUTTON")])), false);
  assert.equal(sePuedeEntero(elemento([hijo("SPAN", "", [{ name: "data-pista" }])])), false);
  assert.equal(sePuedeEntero(elemento([])), false, "sin hijos se traduce como texto");
});

test("Idioma: el diccionario es JSON válido, con claves ya normalizadas", () => {
  const dic = JSON.parse(leer("public/i18n/en.json"));
  const claves = Object.keys(dic);
  assert.ok(claves.length > 0);
  for (const clave of claves) {
    assert.equal(clave, normalizar(clave), `la clave tiene espacios de más: ${clave.slice(0, 50)}`);
    assert.equal(typeof dic[clave], "string", `sin traducción: ${clave.slice(0, 50)}`);
    assert.ok(dic[clave].trim(), `traducción vacía: ${clave.slice(0, 50)}`);
  }
});

test("Idioma: cada página trae el botón ES/EN junto a Acceso y carga el motor temprano", () => {
  for (const pagina of PAGINAS) {
    const html = leer(`public/${pagina}`);
    const acceso = html.indexOf('id="btn-acceso"');
    const boton = html.indexOf("data-idioma-boton");
    assert.ok(boton > acceso && acceso > 0, `${pagina}: el botón de idioma va después de Acceso`);
    assert.match(html.slice(boton - 200, boton + 300), /translate="no"/, `${pagina}: el botón no se traduce`);
    assert.match(html, /<script src="\/js\/arranque\.js"><\/script>\s*<script src="\/js\/idioma\.js"><\/script>/,
      `${pagina}: idioma.js va en el <head>, sin defer, después de arranque.js`);
  }
});
