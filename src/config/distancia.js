// Cargo por distancia del domicilio.
//
// El cliente elige el rango de km desde el Centro Comercial La Estrella hasta
// su casa. No hay API externa: el cargo es fijo por tramo y se SUMA a la tarifa
// de zona de src/config/envio.js. Desde ENVIO_GRATIS_DESDE galletas el domicilio
// sale gratis, incluida la distancia (lo decide envioDe).

const ORIGEN = "Centro Comercial La Estrella, Calle 13 # 7-26, Cúcuta";

// Tramos en km. La clave es la que manda el navegador; el cargo lo decide el servidor.
const RANGOS_DISTANCIA = {
  "0-3": { etiqueta: "0 a 3 km", costo: 2000 },
  "3-6": { etiqueta: "3 a 6 km", costo: 4000 },
  "6+": { etiqueta: "más de 6 km", costo: 6000 },
};

// Cargo de un rango. Devuelve null si el rango no existe: no se adivina un cargo.
function cargoDeRango(clave) {
  return Object.prototype.hasOwnProperty.call(RANGOS_DISTANCIA, clave) ? RANGOS_DISTANCIA[clave].costo : null;
}

module.exports = { ORIGEN, RANGOS_DISTANCIA, cargoDeRango };
