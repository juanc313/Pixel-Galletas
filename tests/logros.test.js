// Logros: medallas del navegador. Se prueban las reglas, que no dependen de la pantalla.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const cargar = () => import("../public/js/logros.js");
const sabor = (nombre, cantidad) => ({ nombre, precio: 7000, cantidad });

test("Logros: el carrito desbloquea primera galleta, combo y los descuentos", async () => {
  const { logrosDelCarrito } = await cargar();
  assert.deepEqual(logrosDelCarrito([]), []);
  assert.deepEqual(logrosDelCarrito([sabor("Pixel Monster", 1)]), ["primera-galleta"]);
  assert.deepEqual(logrosDelCarrito([sabor("Pixel Monster", 12)]), ["primera-galleta", "descuento"]);
  assert.deepEqual(logrosDelCarrito([sabor("Pixel Monster", 48)]), ["primera-galleta", "descuento", "nivel-max"]);
  // Un combo se cobra a precio fijo: no cuenta como descuento por volumen.
  const combo = [sabor("Pixel Special Edition", 1), sabor("Pixel Monster", 2)];
  assert.deepEqual(logrosDelCarrito(combo), ["primera-galleta", "combo"]);
});

test("Logros: el historial cuenta pedidos y sabores distintos, sin repetir", async () => {
  const { logrosDelHistorial, sumarPedido, SABORES_COLECCIONISTA, PEDIDOS_FIEL } = await cargar();
  assert.deepEqual(logrosDelHistorial(), []);
  let h = sumarPedido({}, ["Pixel Monster", "Pixel Monster", "Pixel Red Velvet"]);
  assert.deepEqual(h, { pedidos: 1, sabores: ["Pixel Monster", "Pixel Red Velvet"] });
  assert.deepEqual(logrosDelHistorial(h), ["primer-pedido"]);

  for (let i = 1; i < PEDIDOS_FIEL; i++) h = sumarPedido(h, ["Pixel Monster"]);
  assert.ok(logrosDelHistorial(h).includes("cliente-fiel"));
  assert.ok(!logrosDelHistorial(h).includes("coleccionista"));

  h = sumarPedido(h, ["Pixel Chocolate", "Pixel AreKlim", "Pixel Red Monster"]);
  assert.equal(h.sabores.length, SABORES_COLECCIONISTA);
  assert.ok(logrosDelHistorial(h).includes("coleccionista"));
});

test("Logros: cada logro tiene id único, ícono, nombre y pista", async () => {
  const { LOGROS } = await cargar();
  assert.equal(new Set(LOGROS.map((l) => l.id)).size, LOGROS.length);
  for (const l of LOGROS) assert.ok(l.icono && l.nombre && l.detalle, l.id);
});
