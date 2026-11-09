// Teléfono de contacto de un pedido. Se aceptan los separadores con los que la
// gente escribe su número (+, espacios y guiones), pero lo que cuenta son los
// dígitos: "+-+-+-+" tiene siete caracteres y ninguno sirve para llamar. El
// tope de 15 es el de un número internacional (E.164) y el de 20 caracteres es
// el de la columna en la base.
const CARACTERES = /^[0-9+\s-]{7,20}$/;

function telefonoValido(telefono) {
  if (typeof telefono !== "string" || !CARACTERES.test(telefono)) return false;
  const digitos = telefono.replace(/\D/g, "").length;
  return digitos >= 7 && digitos <= 15;
}

module.exports = { telefonoValido };
