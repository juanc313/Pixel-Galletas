// Efectos de 8 bits: notas válidas, cortos y el más importante gana.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const cargar = () => import("../public/js/sonidos.js");

test("Sonidos: las notas se convierten a la frecuencia correcta", async () => {
  const { frecuencia } = await cargar();
  assert.equal(frecuencia("A4"), 440);
  assert.equal(Math.round(frecuencia("C5") * 100) / 100, 523.25);
  assert.equal(Math.round(frecuencia("A5")), 880);
  assert.equal(Math.round(frecuencia("F#5")), 740);
  assert.throws(() => frecuencia("H2"));
});

test("Sonidos: cada efecto usa notas válidas y dura poco (nada de canciones)", async () => {
  const { EFECTOS, frecuencia } = await cargar();
  for (const [nombre, efecto] of Object.entries(EFECTOS)) {
    let total = 0;
    for (const [nota, dur, forma] of efecto.notas) {
      if (nota) { frecuencia(nota); assert.ok(["square", "triangle"].includes(forma), `${nombre}: onda ${forma}`); }
      assert.ok(dur > 0 && dur < 0.5, `${nombre}: duración ${dur}`);
      total += dur;
    }
    assert.ok(total <= 1.5, `${nombre} dura ${total}s`);
  }
});

test("Sonidos: cada nivel de la barra suena más épico que el anterior", async () => {
  const { efectoDeNivel, EFECTOS } = await cargar();
  assert.equal(efectoDeNivel("2"), "nivel2");
  assert.equal(efectoDeNivel("3"), "nivel3");
  assert.equal(efectoDeNivel("MAX"), "max");
  const dura = (n) => EFECTOS[n].notas.reduce((s, x) => s + x[1], 0);
  assert.ok(dura("nivel2") < dura("nivel3") && dura("nivel3") < dura("max"));
});

test("Sonidos: si suenan dos a la vez, gana el logro (no la moneda)", async () => {
  const { elegirEfecto } = await cargar();
  assert.equal(elegirEfecto(["moneda", "nivel2"]), "nivel2");
  assert.equal(elegirEfecto(["clic", "moneda"]), "moneda");
  assert.equal(elegirEfecto(["moneda", "max", "combo"]), "max");
  assert.equal(elegirEfecto(["no-existe"]), null);
});
