// Datos compartidos de los sabores: los usan el catálogo (productos.js) y la
// foto del pedido para WhatsApp (foto-pedido.js). Este módulo no hace nada al
// cargarse, así que se puede importar desde cualquier lado sin efectos.

// Identificador del sabor para colorear su galleta en la hoja de estilos ("Pixel Red Velvet" pasa a "red-velvet").
export const idSabor = (nombre) => String(nombre ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/^pixel\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Fotos reales de cada sabor (scripts/prepararFotos.py). Los sabores que no
// estén aquí (galletas creadas por el admin) usan el sprite pixelado del CSS.
export const FOTOS = new Set([
  "monster", "red-velvet", "chocolate", "areklim", "red-monster", "special-edition",
]);

// Ruta de la foto real de un sabor, o null si no tiene.
export const fotoDeSabor = (nombre) => {
  const id = idSabor(nombre);
  return FOTOS.has(id) ? `/img/sabores/${id}.webp` : null;
};
