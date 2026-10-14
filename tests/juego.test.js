// Pruebas de la lógica de la sala de juegos y del visor de fotos: rangos,
// combos de racha, movimiento por la rejilla con el teclado y pie de foto.
// Son funciones puras, así que se prueban sin navegador ni base de datos.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const cargar = async () => ({
  ...(await import("../public/js/juego.js")),
  ...(await import("../public/js/visor.js")),
});

test("Rangos: la escalera empieza en cero y sube en orden", async () => {
  const { RANGOS } = await cargar();
  assert.equal(RANGOS[0].desde, 0, "el primer rango debe alcanzarse sin puntos");
  for (let i = 1; i < RANGOS.length; i++) {
    assert.ok(RANGOS[i].desde > RANGOS[i - 1].desde, `el rango ${i} debe pedir más puntos que el anterior`);
  }
});

test("Rango: cada puntuación cae en el rango más alto que ya alcanzó", async () => {
  const { rangoPara, RANGOS } = await cargar();
  assert.equal(rangoPara(0).nombre, RANGOS[0].nombre);
  assert.equal(rangoPara(79).nombre, RANGOS[0].nombre);
  assert.equal(rangoPara(RANGOS[1].desde).nombre, RANGOS[1].nombre);
  assert.equal(rangoPara(RANGOS[1].desde - 1).nombre, RANGOS[0].nombre);
  assert.equal(rangoPara(9999).nombre, RANGOS[RANGOS.length - 1].nombre);
});

test("Racha: el multiplicador sube cada tres aciertos y se topa en ×4", async () => {
  const { multiplicadorDe } = await cargar();
  assert.equal(multiplicadorDe(0), 1);
  assert.equal(multiplicadorDe(2), 1);
  assert.equal(multiplicadorDe(3), 2);
  assert.equal(multiplicadorDe(6), 3);
  assert.equal(multiplicadorDe(9), 4);
  assert.equal(multiplicadorDe(50), 4, "la racha no puede crecer sin freno");
});

test("Rejilla: las flechas recorren las 12 casillas y saltan de fila en los bordes", async () => {
  const { huecoSiguiente, FILAS, COLUMNAS } = await cargar();
  assert.equal(FILAS * COLUMNAS, 12);
  assert.equal(huecoSiguiente(0, "ArrowRight"), 1);
  assert.equal(huecoSiguiente(3, "ArrowRight"), 0, "al final de la fila vuelve a la primera casilla");
  assert.equal(huecoSiguiente(0, "ArrowLeft"), 3, "hacia la izquierda salta a la última casilla de la fila");
  assert.equal(huecoSiguiente(4, "ArrowLeft"), 7);
  assert.equal(huecoSiguiente(1, "ArrowUp"), 9, "arriba da la vuelta por abajo");
  assert.equal(huecoSiguiente(9, "ArrowDown"), 1, "abajo da la vuelta por arriba");
  assert.equal(huecoSiguiente(5, "Home"), 0);
  assert.equal(huecoSiguiente(5, "End"), 11);
  assert.equal(huecoSiguiente(7, "Tab"), 7, "una tecla que no es de rejilla no mueve nada");
});

test("Rejilla: funciona con otra forma de tablero", async () => {
  const { huecoSiguiente } = await cargar();
  assert.equal(huecoSiguiente(0, "ArrowLeft", 2, 2), 1);
  assert.equal(huecoSiguiente(3, "ArrowDown", 2, 2), 1);
});

test("Visor: el pie de foto usa la leyenda de la figura o el texto alternativo", async () => {
  const { pieDeFoto } = await cargar();
  const leyenda = { textContent: "  Nuestros clientes  " };
  const figura = { querySelector: (sel) => (sel === "figcaption" ? leyenda : null) };
  assert.equal(pieDeFoto({ closest: () => figura, alt: "Clientes" }), "Nuestros clientes");
  assert.equal(pieDeFoto({ closest: () => ({ querySelector: () => null }), alt: "Galletas" }), "Galletas");
  assert.equal(pieDeFoto({ closest: () => null, alt: "" }), "Foto de Pixel Galletas");
});
