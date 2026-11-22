// Ordena lo que el cliente escribe en el formulario de pedido, sin inventar
// nada: quita espacios de más, pone mayúsculas al nombre y corrige un puñado de
// errores de escritura muy comunes y sin ambigüedad ("porfavor" -> "por favor").
// Todo pasa en el navegador: los datos no salen a ningún servicio externo.
// El corrector ortográfico completo lo pone el navegador (spellcheck + lang="es"
// en index.html): subraya lo que esté mal y sugiere la palabra correcta.

// Errores frecuentes con una sola corrección posible. Solo palabras completas
// (\b), sin importar mayúsculas. NO se agregan casos dudosos ("haber/a ver").
export const CORRECCIONES = [
  [/\bpor\s*fa(?:vor|bor)\b/gi, "por favor"],
  [/\bxfa(?:vor)?\b/gi, "por favor"],
  [/\bne(?:s|c)e(?:s|c)ito\b/gi, "necesito"],
  [/\bne(?:s|c)e(?:s|c)itamos\b/gi, "necesitamos"],
  [/\bdi(?:rr?)?ecc?ion\b/gi, "dirección"],
  [/\bbario\b/gi, "barrio"],
  [/\bapartameto\b/gi, "apartamento"],
  [/\bgrasias\b/gi, "gracias"],
  [/\bnueses\b/gi, "nueces"],
  [/\bsin\s+azucar\b/gi, "sin azúcar"],
  [/\bcumpleanos\b/gi, "cumpleaños"],
];

// Palabras que en un nombre propio van en minúscula (salvo al inicio).
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e"]);

export function limpiarEspacios(texto) {
  return String(texto ?? "").replace(/\s+/g, " ").trim();
}

// "laura  GÓMEZ de la cruz" -> "Laura Gómez de la Cruz". Si el cliente ya
// escribió con mayúsculas y minúsculas a su gusto ("McAllister"), se respeta.
export function nombrePropio(texto) {
  const limpio = limpiarEspacios(texto);
  if (!limpio) return "";
  const todoMinuscula = limpio === limpio.toLowerCase();
  const todoMayuscula = limpio === limpio.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(limpio);
  if (!todoMinuscula && !todoMayuscula) return limpio;
  return limpio.toLowerCase().split(" ").map((palabra, i) =>
    i > 0 && PARTICULAS.has(palabra) ? palabra : palabra.charAt(0).toUpperCase() + palabra.slice(1)
  ).join(" ");
}

export function primeraMayuscula(texto) {
  const limpio = limpiarEspacios(texto);
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : "";
}

// Aplica CORRECCIONES. Devuelve { texto, cambios: [[antes, después], ...] }
// para poder contarle al cliente qué se arregló.
export function corregirComunes(texto) {
  let resultado = String(texto ?? "");
  const cambios = [];
  for (const [patron, reemplazo] of CORRECCIONES) {
    resultado = resultado.replace(patron, (coincidencia, ...resto) => {
      const nuevo = typeof reemplazo === "function" ? reemplazo(coincidencia, ...resto) : reemplazo;
      // Conserva la mayúscula inicial si el cliente la puso ("Porfavor" -> "Por favor").
      const final = /^[A-ZÁÉÍÓÚÑ]/.test(coincidencia) ? nuevo.charAt(0).toUpperCase() + nuevo.slice(1) : nuevo;
      if (final !== coincidencia) cambios.push([coincidencia, final]);
      return final;
    });
  }
  return { texto: resultado, cambios };
}

// Ordena un campo del formulario según su tipo. Devuelve { texto, cambios }.
//   tipo: "nombre" | "direccion" | "notas" | "telefono"
export function ordenarCampo(tipo, valor) {
  const original = limpiarEspacios(valor);
  if (!original) return { texto: "", cambios: [] };
  if (tipo === "telefono") {
    // Solo espacios: el número se valida en el formulario y en el servidor.
    return { texto: original, cambios: [] };
  }
  if (tipo === "nombre") {
    const texto = nombrePropio(original);
    return { texto, cambios: texto !== original ? [[original, texto]] : [] };
  }
  const { texto, cambios } = corregirComunes(original);
  return { texto: primeraMayuscula(texto), cambios };
}

// Texto corto para avisar qué se arregló: «porfavor» → «por favor», …
export function resumenCambios(cambios) {
  return cambios.map(([antes, despues]) => `«${antes}» → «${despues}»`).join(", ");
}
