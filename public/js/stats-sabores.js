// "Elige tu personaje": la ficha de cada sabor, de 1 a 5. Un solo lugar para el
// catálogo (productos.js) y para Pixelito (pixelito.js).
//
// Valores del emprendedor: la Special Edition es la más dulce y la AreKlim la
// menos (lleva Klim sin azúcar); la Pixel Chocolate es la de más chocolate.
// "Mezcla" sale de la receta: un sabor (1), fusión de dos (3) o todos
// combinados (5). Todas son crujientes por fuera y suaves por dentro, así que
// la textura no es una barra. Un sabor creado desde el panel no tiene ficha:
// mejor sin stats que inventadas.
export const STATS_MAX = 5;
export const STATS = {
  "monster":         { clase: "🧙 Mago",       dulce: 4, chocolate: 2, mezcla: 1 },
  "red-velvet":      { clase: "🛡️ Caballero",  dulce: 3, chocolate: 2, mezcla: 1 },
  "chocolate":       { clase: "⚔️ Guerrero",   dulce: 3, chocolate: 5, mezcla: 1 },
  "areklim":         { clase: "🎵 Bardo",      dulce: 2, chocolate: 2, mezcla: 3 },
  "red-monster":     { clase: "👥 Dúo",        dulce: 4, chocolate: 2, mezcla: 3 },
  "special-edition": { clase: "👑 Jefe final", dulce: 5, chocolate: 3, mezcla: 5 },
};
export const BARRAS_STATS = [
  { clave: "dulce", nombre: "Dulce", icono: "🍬" },
  { clave: "chocolate", nombre: "Chocolate", icono: "🍫" },
  { clave: "mezcla", nombre: "Mezcla", icono: "🌈" },
];

// "Pixel Red Velvet" → "red-velvet" (la misma regla que usa el catálogo).
export const idSabor = (nombre) => nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/^pixel\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const statsDe = (idSab) => STATS[idSab] || null;

// Resumen corto para Pixelito: "⚔️ Guerrero · 🍬 3/5 · 🍫 5/5 · 🌈 1/5".
export function resumenStats(nombre) {
  const s = statsDe(idSabor(nombre));
  if (!s) return null;
  return [s.clase, ...BARRAS_STATS.map((b) => `${b.icono} ${s[b.clave]}/${STATS_MAX}`)].join(" · ");
}
