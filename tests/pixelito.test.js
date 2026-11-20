// Pixelito, el asistente con guion: nunca contradice al carrito y no molesta.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const cargar = async () => ({
  ...(await import("../public/js/pixelito.js")),
  ...(await import("../public/js/pedidos.js")),
});

const CATALOGO = [
  { id: 1, nombre: "Pixel Monster", precio: 7000, disponible: true },
  { id: 2, nombre: "Pixel Red Velvet", precio: 7000, disponible: true },
  { id: 3, nombre: "Pixel Chocolate", precio: 7000, disponible: true },
  { id: 4, nombre: "Pixel AreKlim", precio: 7000, disponible: false },
  { id: 5, nombre: "Pixel Red Monster", precio: 7000, disponible: true },
  { id: 6, nombre: "Pixel Special Edition", precio: 9500, disponible: true },
];

test("Pixelito: cada botón del guion lleva a una respuesta real, sin textos rotos", async () => {
  const { nodo } = await cargar();
  const visitados = new Set();
  const pendientes = ["inicio"];
  while (pendientes.length) {
    const id = pendientes.pop();
    if (visitados.has(id)) continue;
    visitados.add(id);
    const n = nodo(id, { catalogo: CATALOGO, unidades: 0 });
    assert.ok(n.texto.length > 0, `${id} dice algo`);
    assert.ok(n.opciones.length > 0, `${id} ofrece cómo seguir`);
    for (const t of n.texto) assert.doesNotMatch(t, /undefined|NaN|null|\[object/, `${id}: "${t}"`);
    for (const o of n.opciones) {
      assert.ok(o.ir || o.ancla || o.agregar || o.whatsapp || o.cerrar, `${id}: la opción "${o.texto}" hace algo`);
      if (o.ir) pendientes.push(o.ir);
    }
  }
  for (const clave of ["recomendar", "precios", "combos", "domicilio", "pago", "grandes", "estado", "humano"]) {
    assert.ok(visitados.has(clave), `se llega a ${clave} desde el menú`);
  }
});

test("Pixelito: el domicilio y los combos salen de las mismas tablas que cobra el carrito", async () => {
  const { nodo, ENTREGAS, COMBOS, ENVIO_GRATIS_DESDE, pesos } = await cargar();
  const domicilio = nodo("domicilio").texto.join(" ");
  assert.ok(domicilio.includes(pesos(ENTREGAS.cucuta.costo)));
  assert.ok(domicilio.includes(pesos(ENTREGAS.municipios.costo)));
  assert.ok(domicilio.includes(`Desde ${ENVIO_GRATIS_DESDE} galletas`));
  const combos = nodo("combos").texto.join(" ");
  for (const c of COMBOS) assert.ok(combos.includes(pesos(c.precio)), c.nombre);
});

test("Pixelito: los precios vienen del catálogo, no de un número escrito a mano", async () => {
  const { nodo } = await cargar();
  const caros = CATALOGO.map((p) => ({ ...p, precio: p.precio + 1000 }));
  const texto = nodo("precios", { catalogo: caros }).texto.join(" ");
  assert.ok(texto.includes("8.000") && texto.includes("10.500"), texto);
  assert.ok(nodo("precios", { catalogo: [] }).texto[0].includes("menú"), "sin catálogo no inventa precios");
});

test("Pixelito: recomienda solo lo que se puede comprar", async () => {
  const { nodo } = await cargar();
  const chocolate = nodo("antojo:chocolate", { catalogo: CATALOGO });
  assert.ok(chocolate.texto[0].includes("Pixel Chocolate"));
  assert.ok(chocolate.opciones.some((o) => o.agregar === "Pixel Chocolate"));
  // AreKlim está agotada en este catálogo: lo dice y ofrece otra.
  const agotada = nodo("antojo:cremoso", { catalogo: CATALOGO });
  assert.ok(agotada.texto[0].includes("acabó"));
  assert.ok(!agotada.opciones.some((o) => o.agregar));
});

test("Pixelito: habla por su cuenta en el momento justo y una sola vez", async () => {
  const { momentoProactivo } = await cargar();
  const ya = new Set();
  const monster = (cantidad) => [{ nombre: "Pixel Monster", precio: 7000, cantidad }];

  const primera = momentoProactivo("carrito", { unidades: 1, items: monster(1), ya });
  assert.equal(primera.momento, "primera");
  ya.add(primera.momento);
  assert.equal(momentoProactivo("carrito", { unidades: 1, items: monster(1), ya }), null, "no repite");
  assert.equal(momentoProactivo("carrito", { unidades: 5, items: monster(5), ya }), null, "no felicita por la quinta");

  const casi = momentoProactivo("carrito", { unidades: 10, items: monster(10), ya });
  assert.equal(casi.momento, "casi-gratis");
  assert.ok(casi.texto.includes("faltan 2"));
  assert.ok(momentoProactivo("carrito", { unidades: 11, items: monster(11), ya: new Set() }).texto.includes("falta 1 galleta"));

  const combo = momentoProactivo("carrito", {
    unidades: 3, ya: new Set(),
    items: [{ nombre: "Pixel Special Edition", precio: 9500, cantidad: 1 }, { nombre: "Pixel Monster", precio: 7000, cantidad: 2 }],
  });
  assert.equal(combo.momento, "combo");
  assert.ok(combo.texto.includes("22.000"));

  assert.equal(momentoProactivo("quieto", { unidades: 0 }), null, "sin galletas no hay carrito que recordar");
  assert.equal(momentoProactivo("saludo", { ya: new Set(["saludo"]) }), null);
});

test("Pixelito: cada momento y cada etapa de la misión tienen su dibujo en /img", async () => {
  const { momentoProactivo, POSES_MOMENTO, imagenPose } = await cargar();
  const { ETAPAS_MISION } = await import("../public/js/mision.js");
  const fs = require("node:fs");
  const path = require("node:path");
  const poses = [...Object.values(POSES_MOMENTO), ...ETAPAS_MISION.map((e) => e.pose), "explica", "pensando"];
  for (const pose of poses) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "public", imagenPose(pose))), `falta ${imagenPose(pose)}`);
  }
  assert.equal(momentoProactivo("saludo").pose, "saluda");
  assert.equal(imagenPose(undefined), "/img/pixelito.webp", "sin pose vuelve a su cara de siempre");
});

test("Pixelito: nunca interrumpe al que escribe, ni al que lo cerró, ni más de tres veces", async () => {
  const { puedeHablarSolo } = await cargar();
  const base = { silenciado: false, escribiendo: false, abierto: false, hablados: 0, ocupado: false };
  assert.equal(puedeHablarSolo(base), true);
  assert.equal(puedeHablarSolo({ ...base, escribiendo: true }), false);
  assert.equal(puedeHablarSolo({ ...base, silenciado: true }), false);
  assert.equal(puedeHablarSolo({ ...base, abierto: true }), false);
  assert.equal(puedeHablarSolo({ ...base, ocupado: true }), false);
  assert.equal(puedeHablarSolo({ ...base, hablados: 3 }), false);
});
