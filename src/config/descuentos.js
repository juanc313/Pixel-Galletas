// Descuentos por volumen de Pixel Galletas.
//
// El total de un pedido SIEMPRE se recalcula en el servidor (nunca se acepta el
// que mande el navegador), así que la tabla vive aquí. El carrito del front usa
// la misma escalera para mostrar el total antes de pedir, y una prueba compara
// las dos listas para que no se separen con el tiempo.
//
// Se aplican sobre la CANTIDAD TOTAL de galletas del pedido, no por línea:
// 12 galletas del mismo sabor descuentan igual que 12 repartidas.
const DESCUENTOS = [
  { desde: 12, porcentaje: 5 },
  { desde: 24, porcentaje: 8 },
  { desde: 48, porcentaje: 10 },
];

// Combos Pixel Special Edition: precio fijo, sin descuento por volumen. Cada
// combo son `especiales` Special + `normales` galletas normales (el cliente
// elige los sabores). El servidor cobra el precio del combo solo cuando el
// pedido trae exactamente esas galletas.
const COMBOS = [
  { nombre: "Combo Pixel x1", especiales: 1, normales: 2, precio: 26000 },
  { nombre: "Combo Pixel x2", especiales: 2, normales: 2, precio: 36000 },
  { nombre: "Combo Pixel x3", especiales: 3, normales: 3, precio: 52000 },
];

// Descuento que le toca a un pedido de `unidades` galletas con `subtotal` pesos.
// Devuelve el porcentaje aplicado, cuánto se ahorra y el total final.
function descuentoDe(unidades, subtotal) {
  let porcentaje = 0;
  for (const tramo of DESCUENTOS) {
    if (unidades >= tramo.desde) porcentaje = tramo.porcentaje;
  }
  const valor = Math.round((subtotal * porcentaje) / 100);
  return { porcentaje, valor, total: subtotal - valor };
}

module.exports = { DESCUENTOS, COMBOS, descuentoDe };
