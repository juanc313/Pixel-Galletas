const { test } = require("node:test");
const assert = require("node:assert/strict");
const { RANGOS_DISTANCIA, cargoDeRango } = require("../src/config/distancia");

test("los rangos cobran 2.000, 4.000 y 6.000", () => {
  assert.equal(cargoDeRango("0-3"), 2000);
  assert.equal(cargoDeRango("3-6"), 4000);
  assert.equal(cargoDeRango("6+"), 6000);
  assert.deepEqual(Object.keys(RANGOS_DISTANCIA), ["0-3", "3-6", "6+"]);
});

test("un rango inexistente no tiene cargo: no se adivina", () => {
  assert.equal(cargoDeRango("99"), null);
  assert.equal(cargoDeRango("toString"), null);
  assert.equal(cargoDeRango(undefined), null);
});
