// "Elige tu personaje": fichas de sabor coherentes con lo que dijo el emprendedor.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const cargar = () => import("../public/js/stats-sabores.js");

test("Stats: los valores siguen lo que conoce el emprendedor de sus galletas", async () => {
  const { STATS } = await cargar();
  const dulzura = Object.entries(STATS).sort((a, b) => b[1].dulce - a[1].dulce);
  assert.equal(dulzura[0][0], "special-edition", "la más dulce es la Special Edition");
  assert.equal(dulzura.at(-1)[0], "areklim", "la menos dulce es la AreKlim (Klim sin azúcar)");
  const masChocolate = Object.entries(STATS).sort((a, b) => b[1].chocolate - a[1].chocolate)[0][0];
  assert.equal(masChocolate, "chocolate", "la de más chocolate es la Pixel Chocolate");
});

test("Stats: la mezcla sale de la receta (un sabor, fusión o todos)", async () => {
  const { STATS } = await cargar();
  for (const s of ["monster", "red-velvet", "chocolate"]) assert.equal(STATS[s].mezcla, 1, s);
  for (const s of ["areklim", "red-monster"]) assert.equal(STATS[s].mezcla, 3, s);
  assert.equal(STATS["special-edition"].mezcla, 5);
});

test("Stats: toda barra va de 1 a 5 y cada sabor tiene clase", async () => {
  const { STATS, STATS_MAX, BARRAS_STATS } = await cargar();
  for (const [sabor, s] of Object.entries(STATS)) {
    assert.ok(s.clase, sabor);
    for (const b of BARRAS_STATS) assert.ok(Number.isInteger(s[b.clave]) && s[b.clave] >= 1 && s[b.clave] <= STATS_MAX, `${sabor}.${b.clave}`);
  }
});

test("Stats: Pixelito resume la ficha y un sabor nuevo no recibe stats inventadas", async () => {
  const { resumenStats, statsDe, idSabor } = await cargar();
  assert.equal(resumenStats("Pixel Chocolate"), "⚔️ Guerrero · 🍬 3/5 · 🍫 5/5 · 🌈 1/5");
  assert.equal(idSabor("Pixel Red Velvet"), "red-velvet");
  assert.equal(resumenStats("Pixel Mango Biche"), null);
  assert.equal(statsDe("mango-biche"), null);
});
