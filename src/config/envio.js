// Reglas de entrega de Pixel Galletas.
//
// El costo del domicilio lo calcula SIEMPRE el servidor (igual que el descuento
// por volumen): el navegador lo muestra para que el cliente lo vea antes de
// confirmar, pero el total guardado sale de aquí. El front tiene la misma tabla
// (public/js/pedidos.js) y una prueba compara las dos para que no se separen.
//
// Anunciado en la página: "Cúcuta $5.000 · Villa del Rosario, Los Patios y El
// Zulia $7.000, más distancia (src/config/distancia.js). Gratis desde 12
// galletas, distancia incluida; recoger en Ceiba 2, gratis siempre."

const ENTREGAS = {
  // `corto` es la etiqueta para el panel de estado del cliente: dice cómo
  // llega el pedido sin repetir datos del pedido ni del obrador.
  recoger: { nombre: "Recoger en Ceiba 2", corto: "Recoges en el obrador", costo: 0 },
  cucuta: { nombre: "Domicilio en Cúcuta", corto: "Domicilio en Cúcuta", costo: 5000 },
  municipios: {
    nombre: "Domicilio en Villa del Rosario, Los Patios o El Zulia",
    corto: "Domicilio en Villa del Rosario, Los Patios o El Zulia",
    costo: 7000,
  },
};

// A partir de esta cantidad de galletas el domicilio sale gratis (en
// cualquier zona; recoger siempre es gratis, con una galleta o con cien).
const ENVIO_GRATIS_DESDE = 12;

// Costo del envío de un pedido de `unidades` galletas con la forma de entrega
// `entrega`. Devuelve null si la forma de entrega no existe: el controller lo
// traduce a un 400 en vez de adivinar.
function envioDe(unidades, entrega) {
  const zona = ENTREGAS[entrega];
  if (!zona) return null;
  if (unidades >= ENVIO_GRATIS_DESDE) return 0;
  return zona.costo;
}

module.exports = { ENTREGAS, ENVIO_GRATIS_DESDE, envioDe };
