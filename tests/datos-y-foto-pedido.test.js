// Formulario de pedido (datos-cliente.js) y foto del pedido para WhatsApp
// (foto-pedido.js): las partes que no necesitan navegador.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const datos = () => import("../public/js/datos-cliente.js");
const foto = () => import("../public/js/foto-pedido.js");
const leer = (ruta) => fs.readFileSync(path.join(__dirname, "..", ruta), "utf8");

/* ---------- datos-cliente.js ---------- */

test("nombrePropio: mayúsculas en nombres escritos todo en minúscula o todo en mayúscula", async () => {
  const { nombrePropio } = await datos();
  assert.equal(nombrePropio("  laura   gómez "), "Laura Gómez");
  assert.equal(nombrePropio("MARÍA DE LA CRUZ"), "María de la Cruz");
  assert.equal(nombrePropio("juan y pedro"), "Juan y Pedro");
});

test("nombrePropio: respeta lo que el cliente escribió con mayúsculas a su gusto", async () => {
  const { nombrePropio } = await datos();
  assert.equal(nombrePropio("Ana McAllister"), "Ana McAllister");
  assert.equal(nombrePropio("DJ Pixel"), "DJ Pixel");
});

test("corregirComunes: arregla errores frecuentes y dice qué cambió", async () => {
  const { corregirComunes } = await datos();
  const r = corregirComunes("Porfavor sin nueses, es para un cumpleanos");
  assert.equal(r.texto, "Por favor sin nueces, es para un cumpleaños");
  assert.deepEqual(r.cambios, [["Porfavor", "Por favor"], ["nueses", "nueces"], ["cumpleanos", "cumpleaños"]]);
  assert.equal(corregirComunes("xfa en el bario centro").texto, "por favor en el barrio centro");
  assert.equal(corregirComunes("Nesesito la direccion").texto, "Necesito la dirección");
});

test("corregirComunes: no toca lo que ya está bien ni partes de otras palabras", async () => {
  const { corregirComunes } = await datos();
  const bien = "Por favor, necesito la dirección del barrio; gracias";
  assert.deepEqual(corregirComunes(bien), { texto: bien, cambios: [] });
  assert.equal(corregirComunes("barios colores").texto, "barios colores"); // "bario" solo como palabra completa
});

test("ordenarCampo: cada tipo de campo se ordena a su manera", async () => {
  const { ordenarCampo } = await datos();
  assert.equal(ordenarCampo("nombre", "laura gomez").texto, "Laura Gomez");
  assert.equal(ordenarCampo("telefono", " 300  123 4567 ").texto, "300 123 4567");
  assert.equal(ordenarCampo("notas", "sin azucar porfavor").texto, "Sin azúcar por favor");
  assert.equal(ordenarCampo("direccion", "calle 10 #5-20 bario centro").texto, "Calle 10 #5-20 barrio centro");
  assert.deepEqual(ordenarCampo("notas", "   "), { texto: "", cambios: [] });
});

test("resumenCambios: texto corto para el aviso de Pixelito", async () => {
  const { resumenCambios } = await datos();
  assert.equal(resumenCambios([["porfavor", "por favor"], ["bario", "barrio"]]), "«porfavor» → «por favor», «bario» → «barrio»");
});

/* ---------- foto-pedido.js ---------- */

test("itemsParaFoto: junta sabores repetidos y busca su foto real", async () => {
  const { itemsParaFoto } = await foto();
  const items = itemsParaFoto([
    { nombre: "Pixel Monster", cantidad: 2 },
    { nombre: "Pixel Monster", cantidad: 1 },
    { nombre: "Sabor Nuevo del Admin", cantidad: 4 },
  ]);
  assert.deepEqual(items, [
    { nombre: "Pixel Monster", cantidad: 3, foto: "/img/sabores/monster.webp" },
    { nombre: "Sabor Nuevo del Admin", cantidad: 4, foto: null },
  ]);
});

test("itemsParaFoto: las fotos que usa existen en public/img/sabores", async () => {
  const { itemsParaFoto } = await foto();
  const { FOTOS } = await import("../public/js/sabores.js");
  for (const id of FOTOS) {
    const [it] = itemsParaFoto([{ nombre: `Pixel ${id.replace(/-/g, " ")}`, cantidad: 1 }]);
    assert.ok(it.foto, `debería tener foto: ${id}`);
    assert.ok(fs.existsSync(path.join(__dirname, "..", "public", it.foto)), `falta el archivo ${it.foto}`);
  }
});

test("altoDeImagen y nombreArchivo", async () => {
  const { altoDeImagen, nombreArchivo } = await foto();
  assert.ok(altoDeImagen(3) > altoDeImagen(2) - 1);
  assert.equal(altoDeImagen(20), altoDeImagen(8)); // más de 8 sabores se resumen
  assert.equal(nombreArchivo({ id: 57 }), "pedido-pixel-galletas-57.jpg");
});

test("puedeCompartirArchivos: solo si el navegador sabe compartir imágenes", async () => {
  const { puedeCompartirArchivos } = await foto();
  assert.equal(puedeCompartirArchivos({}), false);
  assert.equal(puedeCompartirArchivos({ canShare: () => true }), true);
  assert.equal(puedeCompartirArchivos({ canShare: () => { throw new Error("x"); } }), false);
});

test("compartirFoto: comparte imagen y texto; cancelar no es error", async () => {
  const { compartirFoto } = await foto();
  const blob = new Blob(["x"], { type: "image/jpeg" });
  let compartido;
  const nav = { canShare: () => true, share: async (d) => { compartido = d; } };
  assert.equal(await compartirFoto(blob, { id: 9 }, "Pedido #9", nav), "compartido");
  assert.equal(compartido.text, "Pedido #9");
  assert.equal(compartido.files[0].name, "pedido-pixel-galletas-9.jpg");
  const cancela = { canShare: () => true, share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } };
  assert.equal(await compartirFoto(blob, { id: 9 }, "x", cancela), "cancelado");
  assert.equal(await compartirFoto(blob, { id: 9 }, "x", { canShare: () => false }), "no-soportado");
});

test("index.html: campos de pedido con corrector del navegador y ayuda clara", () => {
  const html = leer("public/index.html");
  for (const nombre of ["nombre", "direccion", "notas"]) {
    const campo = html.match(new RegExp(`<(?:input|textarea)[^>]*name="${nombre}"[^>]*data-ordenar[^>]*>`));
    assert.ok(campo, `falta data-ordenar en ${nombre}`);
    assert.match(campo[0], /spellcheck="true"/);
    assert.match(campo[0], /lang="es"/);
  }
  assert.match(html, /id="nota-pixelito"/);
  assert.match(html, /id="btn-whatsapp-foto"/);
  assert.match(html, /id="btn-descargar-foto"/);
});
