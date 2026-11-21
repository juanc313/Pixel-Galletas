// Pruebas de la lógica de pedidos del frontend: carrito, servicio, mensaje de WhatsApp y contacto.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const memoria = {};
globalThis.localStorage = {
  setItem: (k, v) => (memoria[k] = v),
  getItem: (k) => memoria[k] ?? null,
  removeItem: (k) => delete memoria[k],
};
globalThis.Event = class { constructor(tipo) { this.type = tipo; } };
globalThis.window = { dispatchEvent() {}, addEventListener() {} };

let llamadas = [], respuesta;
globalThis.fetch = async (url, opc) => {
  llamadas.push({ url, metodo: opc.method, cabeceras: opc.headers, cuerpo: opc.body });
  if (respuesta instanceof Error) throw respuesta;
  return { ok: respuesta.ok, status: respuesta.status, json: async () => respuesta.cuerpo };
};
const ok = (cuerpo) => ({ ok: true, status: 200, cuerpo });

const cargar = async () => ({
  ...(await import("../public/js/api.js")),
  ...(await import("../public/js/config.js")),
  ...(await import("../public/js/pedidos.js")),
  ...(await import("../public/js/contacto.js")),
  ...(await import("../public/js/analitica.js")),
  ...(await import("../public/js/estado.js")),
});

beforeEach(() => { llamadas = []; respuesta = ok({}); delete memoria["pixel_galletas_carrito"]; });

test("Doble envío: un segundo toque mientras se envía no crea otro pedido", async () => {
  const { unaSolaVez } = await cargar();
  let veces = 0, soltar;
  const estados = [];
  const enviar = unaSolaVez(
    () => { veces++; return new Promise((ok) => { soltar = ok; }); },
    (enCurso) => estados.push(enCurso)
  );
  const primero = enviar();
  await enviar();
  assert.equal(veces, 1);
  soltar("pedido");
  assert.equal(await primero, "pedido");
  assert.deepEqual(estados, [true, false]);
});

test("Doble envío: si el pedido falla, se puede volver a intentar", async () => {
  const { unaSolaVez } = await cargar();
  let veces = 0;
  const enviar = unaSolaVez(async () => { veces++; if (veces === 1) throw new Error("sin red"); return "ok"; });
  await assert.rejects(enviar(), /sin red/);
  assert.equal(await enviar(), "ok");
  assert.equal(veces, 2);
});

test("Carrito: agrupa por producto, calcula total y persiste en el navegador", async () => {
  const { Carrito } = await cargar();
  const c = new Carrito();
  const galleta = { id: 7, nombre: "Pixel Monster", precio: 6000 };

  c.agregar(galleta);
  c.agregar(galleta);
  c.agregar({ id: 8, nombre: "Pixel Klim", precio: 6000 });
  assert.equal(c.cantidadTotal, 3);
  assert.equal(c.total, 18000);

  c.cambiarCantidad(7, 5);
  assert.equal(c.total, 6 * 6000);

  // Recuperado desde localStorage (misma página, nueva instancia).
  const deNuevo = new Carrito();
  assert.equal(deNuevo.cantidadTotal, 6);
  assert.deepEqual(deNuevo.paraApi(), [{ producto_id: 7, cantidad: 5 }, { producto_id: 8, cantidad: 1 }]);

  deNuevo.quitar(7);
  assert.equal(deNuevo.total, 6000);
  deNuevo.vaciar();
  assert.equal(deNuevo.total, 0);
  assert.equal(new Carrito().cantidadTotal, 0);
});

test("¿Lo de siempre?: repite el último pedido con precios y existencias de hoy", async () => {
  const { Carrito } = await cargar();
  delete memoria[Carrito.CLAVE_ULTIMO];
  assert.deepEqual(Carrito.leerUltimo(), [], "sin pedido anterior no hay nada que repetir");

  Carrito.guardarUltimo([
    { producto_id: 1, nombre: "Pixel Monster", precio: 7000, disponible: null, cantidad: 2 },
    { producto_id: 2, nombre: "Pixel Red Velvet", precio: 7000, disponible: 5, cantidad: 3 },
    { producto_id: 3, nombre: "Pixel AreKlim", precio: 7000, disponible: 4, cantidad: 1 },
  ]);
  const guardado = JSON.parse(memoria[Carrito.CLAVE_ULTIMO]);
  assert.deepEqual(Object.keys(guardado[0]).sort(), ["cantidad", "nombre", "producto_id"], "solo sabores y cantidades");

  const catalogo = [
    { id: 1, nombre: "Pixel Monster", precio: 8000, cantidadDisponible: null }, // subió de precio
    { id: 2, nombre: "Pixel Red Velvet", precio: 7000, cantidadDisponible: 2 }, // quedan menos
    { id: 3, nombre: "Pixel AreKlim", precio: 7000, cantidadDisponible: 0 }, // agotada
  ];
  const c = new Carrito();
  const r = c.repetir(Carrito.leerUltimo(), catalogo);
  assert.equal(r.agregadas, 4);
  assert.deepEqual(r.faltaron, ["Pixel Red Velvet", "Pixel AreKlim"]);
  assert.deepEqual(c.items.map((i) => [i.producto_id, i.cantidad, i.precio]), [[1, 2, 8000], [2, 2, 7000]]);

  assert.deepEqual(new Carrito().repetir(Carrito.leerUltimo(), []).agregadas, 0, "sin catálogo no inventa precios");
  delete memoria[Carrito.CLAVE_ULTIMO];
});

test("CarritoServicio: convierte las filas de la API a la forma del carrito", async () => {
  const { CarritoServicio } = await cargar();
  const rutas = [];
  const api = { get: async (ruta) => { rutas.push(ruta); return [{ producto_id: 7, nombre_sabor: "Pixel Monster", precio_venta: "6000.00", cantidad_disponible: null, cantidad: 2 }]; } };
  const servicio = new CarritoServicio(api);
  const items = await servicio.obtener();
  assert.deepEqual(rutas, ["/carrito"]);
  assert.deepEqual(items, [{ producto_id: 7, nombre: "Pixel Monster", precio: 6000, disponible: null, cantidad: 2 }]);
});

test("Carrito con sesión: guarda en la cuenta tras una pausa corta, sin una petición por clic", async () => {
  const { Carrito, Sesion } = await cargar();
  Sesion.guardar("token-de-prueba", { nombre: "Ana" });
  const guardados = [];
  const cuenta = { hayCuenta: () => true, guardar: async (items) => { guardados.push(items.map((i) => [i.producto_id, i.cantidad])); } };
  const c = new Carrito(cuenta);
  const galleta = { id: 7, nombre: "Pixel Monster", precio: 6000 };
  c.agregar(galleta);
  c.agregar(galleta);
  c.agregar(galleta);
  assert.equal(guardados.length, 0);
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(guardados, [[[7, 3]]]);
  Sesion.limpiar();
});

test("Carrito sin sesión: no llama al servidor", async () => {
  const { Carrito, Sesion } = await cargar();
  Sesion.limpiar();
  let llamo = false;
  const cuenta = { hayCuenta: () => false, guardar: async () => { llamo = true; }, obtener: async () => { llamo = true; return []; } };
  const c = new Carrito(cuenta);
  c.agregar({ id: 7, nombre: "Pixel Monster", precio: 6000 });
  await c.unirConCuenta();
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(llamo, false);
});

test("Carrito al iniciar sesión: une el carrito local con el de la cuenta sumando cantidades", async () => {
  const { Carrito, Sesion } = await cargar();
  Sesion.guardar("token-de-prueba", { nombre: "Ana" });
  const enviado = [];
  const cuenta = {
    hayCuenta: () => true,
    obtener: async () => [
      { producto_id: 7, nombre: "Pixel Monster", precio: 6000, disponible: null, cantidad: 2 },
      { producto_id: 9, nombre: "Pixel Klim", precio: 6000, disponible: null, cantidad: 1 },
    ],
    guardar: async (items) => { enviado.push(items.map((i) => [i.producto_id, i.cantidad])); },
  };
  const c = new Carrito(cuenta);
  c.agregar({ id: 7, nombre: "Pixel Monster", precio: 6000 });
  await c.unirConCuenta();
  assert.equal(c.cantidadTotal, 4);
  assert.deepEqual(enviado, [[[7, 3], [9, 1]]]);
  assert.equal(new Carrito().cantidadTotal, 4);
  Sesion.limpiar();
});

test("Carrito: recargar la página con la misma cuenta no duplica el carrito", async () => {
  const { Carrito, Sesion } = await cargar();
  // Sin la marca de la cuenta de otra prueba: su carrito no se heredaría.
  localStorage.removeItem(Carrito.CLAVE_UNION);
  Sesion.guardar("token-de-prueba", { id: 5, nombre: "Ana" });
  // El servidor guarda lo que el cliente envió: así simulamos la cuenta entre cargas.
  let servidor = [];
  const cuenta = {
    hayCuenta: () => true,
    obtener: async () => servidor,
    guardar: async (items) => { servidor = items.map((i) => ({ producto_id: i.producto_id, nombre: "Pixel Monster", precio: 6000, disponible: null, cantidad: i.cantidad })); },
  };
  const primera = new Carrito(cuenta);
  primera.agregar({ id: 7, nombre: "Pixel Monster", precio: 6000 });
  await primera.unirConCuenta();
  for (let n = 0; n < 3; n++) {
    const recarga = new Carrito(cuenta);
    await recarga.unirConCuenta();
  }
  const recargada = new Carrito(cuenta);
  await recargada.unirConCuenta();
  assert.equal(recargada.cantidadTotal, 1);
  assert.deepEqual(servidor.map((f) => [f.producto_id, f.cantidad]), [[7, 1]]);
  Sesion.limpiar();
});

test("Carrito: al cerrar sesión sale el carrito de la cuenta del navegador", async () => {
  const { Carrito, Sesion } = await cargar();
  Sesion.guardar("token-a", { id: 21, nombre: "Ana" });
  const cuenta = { hayCuenta: () => true, obtener: async () => [], guardar: async () => {} };
  const c = new Carrito(cuenta);
  c.agregar({ id: 7, nombre: "Pixel Monster", precio: 6000 });
  await c.unirConCuenta();
  Sesion.limpiar();
  const sinSesion = { hayCuenta: () => false, obtener: async () => [], guardar: async () => {} };
  const despues = new Carrito(sinSesion);
  await despues.unirConCuenta();
  assert.equal(despues.cantidadTotal, 0);
  assert.equal(localStorage.getItem(Carrito.CLAVE_UNION), null);
});

test("Carrito: la cantidad nunca baja de 1 ni pasa de 100", async () => {
  const { Carrito } = await cargar();
  const c = new Carrito();
  c.agregar({ id: 1, nombre: "A", precio: 6000 });
  c.cambiarCantidad(1, -5); // baja de 1 => se retira del carrito
  assert.equal(c.items.length, 0);
  c.agregar({ id: 1, nombre: "A", precio: 6000 });
  c.cambiarCantidad(1, 500);
  assert.equal(c.items[0].cantidad, 100);
});

test("PedidoServicio: usa método y ruta correctos", async () => {
  const { PedidoServicio, ApiClient } = await cargar();
  const s = new PedidoServicio(new ApiClient());
  respuesta = ok({ id: 1 });
  await s.crear({ cliente_nombre: "Ana" });
  await s.listar();
  await s.cambiarEstado(3, "listo");
  assert.deepEqual(
    llamadas.map((l) => `${l.metodo} ${l.url}`),
    ["POST /api/pedidos", "GET /api/pedidos", "PUT /api/pedidos/3/estado"]
  );
  assert.equal(llamadas[2].cuerpo, JSON.stringify({ estado: "listo" }));
});

test("textoPedido: arma el mensaje de WhatsApp con productos, total y datos", async () => {
  const { Pedido, textoPedido, pesos, urlWhatsApp } = await cargar();
  const pedido = new Pedido({
    id: 42,
    cliente_nombre: "Ana",
    cliente_telefono: "3001112233",
    direccion: "Ceiba 2",
    notas: "Sin nueces",
    total: "18000.00",
    estado: "pendiente",
    creado_en: new Date().toISOString(),
    detalles: [
      { nombre_sabor: "Pixel Monster", precio_unitario: "6000.00", cantidad: 2 },
      { nombre_sabor: "Pixel Klim", precio_unitario: "6000.00", cantidad: 1 },
    ],
  });
  const texto = textoPedido(pedido);
  assert.ok(texto.includes("#42"));
  assert.ok(texto.includes("2 × Pixel Monster"));
  assert.ok(texto.includes("1 × Pixel Klim"));
  assert.ok(texto.includes(pesos(18000)));
  assert.ok(texto.includes("Ceiba 2"));
  assert.ok(texto.includes("Sin nueces"));
  assert.equal(pedido.estadoTexto, "Pendiente");

  const enlace = urlWhatsApp(texto);
  assert.ok(enlace.startsWith("https://wa.me/573137839935?text="));
  assert.ok(enlace.includes(encodeURIComponent(texto)));
});

test("Contacto: enlaza WhatsApp, Instagram y ubicación del DYME", async () => {
  const { enlazarContacto, CONTACTO } = await cargar();
  const elementos = {};
  const doc = { getElementById: (id) => (elementos[id] ??= { id, href: "", textContent: "" }) };
  enlazarContacto(doc);
  assert.ok(elementos["link-whatsapp"].href.startsWith(`https://wa.me/${CONTACTO.whatsapp}?text=`));
  assert.ok(elementos["link-whatsapp-fijo"].href.includes("wa.me"));
  // El botón fijo de la esquina se quedaba sin enlace (href="#"): si vuelve a
  // pasar, esta comprobación lo caza.
  assert.ok(elementos["link-whatsapp-fijo-barra"].href.includes("wa.me"));
  assert.equal(elementos["link-instagram"].href, CONTACTO.instagramUrl);
  assert.equal(elementos["link-instagram"].textContent, "@pixel_galletas");
  assert.ok(elementos["link-ubicacion"].href.includes("maps"));
  assert.ok(elementos["link-ubicacion"].textContent.includes("Ceiba 2"));
});

// ---------- Descuentos por volumen ----------

test("Descuento: la escalera del front y la del servidor son la misma", async () => {
  const { DESCUENTOS } = await cargar();
  const servidor = require("../src/config/descuentos");
  // El total que ve el cliente lo calcula el navegador y el que se guarda lo
  // calcula el servidor: si alguien cambia un tramo en un solo lado, el cliente
  // vería un precio y pagaría otro. Esta prueba lo caza antes de que pase.
  assert.deepEqual(DESCUENTOS, servidor.DESCUENTOS);
});

// ---------- Combos Pixel Special Edition ----------

test("Combos: la lista del front y la del servidor son la misma", async () => {
  const { COMBOS } = await cargar();
  const servidor = require("../src/config/descuentos");
  assert.deepEqual(COMBOS, servidor.COMBOS);
});

test("Combos: el carrito cobra el combo a precio fijo y sin descuento por volumen", async () => {
  const { Carrito } = await cargar();
  const carrito = new Carrito();
  carrito.items = [
    { producto_id: 1, nombre: "Pixel Special Edition", precio: 4849, cantidad: 1 },
    { producto_id: 2, nombre: "Galleta A", precio: 5000, cantidad: 2 },
  ];
  assert.equal(carrito.combo.nombre, "Combo Pixel x1");
  assert.equal(carrito.total, 22000);
  assert.equal(carrito.descuento.valor, 0);
});

test("Combos: 3 Special + 3 normales cobran el combo x3, no tres x1", async () => {
  const { Carrito } = await cargar();
  const carrito = new Carrito();
  carrito.items = [
    { producto_id: 1, nombre: "Pixel Special Edition", precio: 4849, cantidad: 3 },
    { producto_id: 2, nombre: "Galleta A", precio: 5000, cantidad: 3 },
  ];
  assert.equal(carrito.combo.nombre, "Combo Pixel x3");
  assert.equal(carrito.subtotal, 46000);
});

test("Combos: sin el número exacto de normales no se aplica el combo", async () => {
  const { Carrito } = await cargar();
  const carrito = new Carrito();
  carrito.items = [
    { producto_id: 1, nombre: "Pixel Special Edition", precio: 4849, cantidad: 1 },
    { producto_id: 2, nombre: "Galleta A", precio: 5000, cantidad: 1 },
  ];
  assert.equal(carrito.combo, null);
});

test("Calculadora: calcula el combo, el ahorro y el precio por galleta; sin mezcla válida no ofrece combo", async () => {
  const { calcularCombo } = await cargar();
  const x2 = calcularCombo(2, 2, 4849, 5000);
  assert.equal(x2.valido, true);
  assert.equal(x2.nombre, "Combo Pixel x2");
  assert.equal(x2.precio, 31000);
  assert.equal(x2.sueltas, 2 * 4849 + 2 * 5000);
  assert.equal(x2.ahorro, x2.sueltas - 31000);
  assert.equal(x2.porGalleta, Math.round(31000 / 4));
  const suelta = calcularCombo(1, 1, 4849, 5000);
  assert.equal(suelta.valido, false);
  assert.equal(suelta.sueltas, 4849 + 5000);
});

test("Calculadora: el carrito cobra exactamente el total que muestra la calculadora", async () => {
  const { Carrito, calcularCombo } = await cargar();
  const carrito = new Carrito();
  const special = { id: 1, nombre: "Pixel Special Edition", precio: 4849, cantidadDisponible: null };
  const normal = { id: 2, nombre: "Galleta A", precio: 5000, cantidadDisponible: null };
  for (let i = 0; i < 2; i++) carrito.agregar(special);
  for (let i = 0; i < 2; i++) carrito.agregar(normal);
  assert.equal(carrito.total, calcularCombo(2, 2, 4849, 5000).precio);
});

test("Armador: cada galleta normal entra con el sabor que el cliente eligió", async () => {
  const { Carrito, comboDe } = await cargar();
  const carrito = new Carrito();
  const special = { id: 1, nombre: "Pixel Special Edition", precio: 4849, cantidadDisponible: null };
  const monster = { id: 3, nombre: "Monster", precio: 4500, cantidadDisponible: null };
  const redVelvet = { id: 4, nombre: "Red Velvet", precio: 5200, cantidadDisponible: null };
  carrito.agregar(special);
  carrito.agregar(monster);
  carrito.agregar(redVelvet);
  assert.equal(carrito.items.length, 3);
  assert.equal(comboDe(carrito.items).nombre, "Combo Pixel x1");
  assert.equal(carrito.total, 22000);
});

// ---------- Domicilio ----------

 test("Envío: la tabla del front y la del servidor son la misma", async () => {
  const { ENTREGAS, ENVIO_GRATIS_DESDE, envioDe } = await cargar();
  const servidor = require("../src/config/envio");
  // El total que ve el cliente lo calcula el navegador y el que se guarda lo
  // calcula el servidor: si alguien cambia una zona en un solo lado, el cliente
  // vería un precio y pagaría otro. Esta prueba lo caza antes de que pase.
  assert.deepEqual(ENTREGAS, servidor.ENTREGAS);
  assert.equal(ENVIO_GRATIS_DESDE, servidor.ENVIO_GRATIS_DESDE);
  for (const clave of Object.keys(ENTREGAS)) {
    assert.equal(envioDe(1, clave), servidor.envioDe(1, clave), `el costo de ${clave} coincide`);
    assert.equal(envioDe(12, clave), servidor.envioDe(12, clave), `la gratuidad de ${clave} coincide`);
  }
});

test("Distancia: la tabla de rangos del front y la del servidor son la misma", async () => {
  const { RANGOS_DISTANCIA } = await cargar();
  const { RANGOS_DISTANCIA: servidor } = require("../src/config/distancia");
  // El cargo que ve el cliente sale de la tabla del navegador y el que se guarda
  // sale de la del servidor: si cambian en un solo lado, el total no coincide.
  const costosServidor = Object.fromEntries(Object.entries(servidor).map(([k, r]) => [k, r.costo]));
  assert.deepEqual(RANGOS_DISTANCIA, costosServidor);
});

test("Envío: recoger es gratis, cada zona cuesta lo suyo y desde 12 galletas todo sale gratis", async () => {
  const { envioDe } = await cargar();
  assert.equal(envioDe(1, "recoger"), 0, "recoger es gratis siempre");
  assert.equal(envioDe(1, "cucuta"), 5000);
  assert.equal(envioDe(11, "municipios"), 7000, "con 11 galletas todavía se cobra");
  assert.equal(envioDe(12, "cucuta"), 0, "desde 12 el domicilio es gratis");
  assert.equal(envioDe(50, "municipios"), 0);
  assert.equal(envioDe(3, "china"), null, "una zona inventada no se adivina");
});

test("Carrito: el domicilio entra en el total y se libera con 12 galletas", async () => {
  const c = await carritoLimpio();
  c.agregar({ id: 1, nombre: "Pixel Monster", precio: 6000 });
  // Sin elegir nada, el pedido es para recoger: el total no cambia.
  assert.equal(c.envio, 0);
  assert.equal(c.total, 6000);

  c.entrega = "cucuta";
  assert.equal(c.envio, 5000);
  assert.equal(c.total, 11000, "el total del carrito es el que se pagará");

  c.cambiarCantidad(1, 12);
  assert.equal(c.envio, 0, "12 galletas liberan el domicilio");
  assert.equal(c.total, 68400, "y el descuento por volumen sigue aplicando");
});

test("textoPedido: enseña cómo se entrega y cuánto costó el envío", async () => {
  const { Pedido, textoPedido, pesos } = await cargar();
  const base = {
    id: 7, cliente_nombre: "Ana", cliente_telefono: "3001112233", estado: "pendiente",
    creado_en: new Date().toISOString(), direccion: "Calle 5 # 3-2", notas: null,
    entrega: "municipios", envio: "7000.00",
    detalles: [{ nombre_sabor: "Pixel Monster", precio_unitario: "6000.00", cantidad: 1 }],
  };
  const conDomicilio = textoPedido(new Pedido({ ...base, total: "13000.00", descuento: "0.00" }));
  assert.ok(conDomicilio.includes("Domicilio en Villa del Rosario"), "el obrador sabe a dónde va");
  assert.ok(conDomicilio.includes(pesos(7000)), "y cuánto costó el envío");

  const recogiendo = textoPedido(new Pedido({
    ...base, total: "6000.00", entrega: "recoger", envio: "0.00",
  }));
  assert.ok(recogiendo.includes("Recoger en Ceiba 2"));
  assert.ok(recogiendo.includes("gratis"), "un envío de $0 se dice gratis, no se esconde");
});

test("Descuento: cada tramo entra justo en su cantidad y el aviso sabe el siguiente", async () => {
  const { descuentoPara, tramoDescuento } = await cargar();
  assert.equal(descuentoPara(11, 66000).porcentaje, 0, "con 11 galletas todavía no hay descuento");
  assert.equal(descuentoPara(12, 72000).valor, 3600, "12 galletas: 5%");
  assert.equal(descuentoPara(23, 138000).porcentaje, 5);
  assert.equal(descuentoPara(24, 144000).valor, 11520, "24 galletas: 8%");
  assert.equal(descuentoPara(47, 282000).porcentaje, 8);
  assert.equal(descuentoPara(48, 288000).valor, 28800, "48 galletas: 10%");
  assert.equal(descuentoPara(100, 600000).valor, 60000, "el 10% es el techo: no sigue subiendo");
  assert.equal(descuentoPara(1, 6000).valor, 0, "una galleta suelta no descuenta");
  // El tramo siguiente es el que alimenta el aviso "te faltan N galletas".
  assert.equal(tramoDescuento(20).siguiente.desde, 24);
  assert.equal(tramoDescuento(20).siguiente.porcentaje, 8);
  assert.equal(tramoDescuento(50).siguiente, null, "pasado el último tramo ya no hay aviso");
});

test("Carrito: el subtotal no descuenta, el total sí", async () => {
  const { Carrito } = await cargar();
  const c = new Carrito();
  c.agregar({ id: 1, nombre: "Pixel Monster", precio: 6000 });
  c.cambiarCantidad(1, 12);
  assert.equal(c.subtotal, 72000);
  assert.equal(c.descuento.porcentaje, 5);
  assert.equal(c.descuento.valor, 3600);
  assert.equal(c.total, 68400);
  // El descuento cuenta galletas totales, no líneas: 6 + 6 del mismo sabor
  // repartido en dos productos también llega al 5%.
  const repartido = new Carrito();
  repartido.agregar({ id: 1, nombre: "A", precio: 6000 });
  repartido.agregar({ id: 2, nombre: "B", precio: 6000 });
  repartido.cambiarCantidad(1, 6);
  repartido.cambiarCantidad(2, 6);
  assert.equal(repartido.total, 68400);
});

test("textoPedido: enseña subtotal y descuento solo cuando hay descuento", async () => {
  const { Pedido, textoPedido, pesos } = await cargar();
  const base = {
    id: 7, cliente_nombre: "Ana", cliente_telefono: "3001112233", estado: "pendiente",
    creado_en: new Date().toISOString(), direccion: null, notas: null,
    detalles: [{ nombre_sabor: "Pixel Monster", precio_unitario: "6000.00", cantidad: 12 }],
  };
  const conDescuento = textoPedido(new Pedido({ ...base, total: "68400.00", descuento: "3600.00" }));
  assert.ok(conDescuento.includes("*Subtotal:*"), "el subtotal explica de dónde sale el total");
  assert.ok(conDescuento.includes(pesos(3600)));
  assert.ok(conDescuento.includes(pesos(68400)));

  const sinDescuento = textoPedido(new Pedido({
    ...base, total: "6000.00", descuento: "0.00",
    detalles: [{ nombre_sabor: "Pixel Monster", precio_unitario: "6000.00", cantidad: 1 }],
  }));
  assert.ok(!sinDescuento.includes("Descuento"), "un pedido pequeño no habla de descuentos");
  assert.ok(sinDescuento.includes(pesos(6000)));
});

// ---------- Medición propia ----------

test("Medición: la visita se recuerda durante la pestaña y sin almacén no revienta", async () => {
  const { idVisita } = await cargar();
  const guardado = {};
  const almacen = {
    getItem: (k) => guardado[k] ?? null,
    setItem: (k, v) => { guardado[k] = v; },
  };
  const primera = idVisita(almacen);
  assert.equal(primera, idVisita(almacen), "la misma visita conserva su identificador");
  if (primera) assert.match(primera, /^[0-9a-f]{16}$/, "es un número al azar, no un dato de la persona");
  // Modo privado estricto: sin dónde recordarla se devuelve null y nada se rompe.
  assert.equal(idVisita({ getItem() { throw new Error("sin almacenamiento"); }, setItem() {} }), null);
  assert.equal(idVisita(null), null);
});

test("Medición: el mismo sabor no se cuenta dos veces por visita, pero agregar al carrito sí", async () => {
  const { Medicion } = await cargar();
  const enviados = [];
  const clienteFalso = { post: async (ruta, cuerpo) => { enviados.push({ ruta, cuerpo }); return {}; } };
  const medicion = new Medicion(clienteFalso);

  medicion.registrar("sabor_visto", { producto_id: 7 });
  medicion.registrar("sabor_visto", { producto_id: 7 }); // la misma tarjeta al filtrar
  medicion.registrar("sabor_visto", { producto_id: 8 }); // otro sabor sí cuenta
  medicion.registrar("checkout_iniciado");
  medicion.registrar("checkout_iniciado");
  medicion.registrar("carrito_agregar", { producto_id: 7, cantidad: 1 });
  medicion.registrar("carrito_agregar", { producto_id: 7, cantidad: 1 });

  assert.deepEqual(enviados.map((e) => e.cuerpo.evento), [
    "sabor_visto", "sabor_visto", "checkout_iniciado", "carrito_agregar", "carrito_agregar",
  ]);
  assert.ok(enviados.every((e) => e.ruta === "/eventos"));
  // Sin sessionStorage no se manda visita: es preferible no medir a inventar un
  // número nuevo en cada evento (no uniría nada).
  assert.ok(enviados.every((e) => e.cuerpo.visita === undefined));
});

test("Medición: el resumen del panel se pinta con el embudo y con cada sabor", async () => {
  const { ResumenVista, Sesion } = await cargar();
  // Documento mínimo: el módulo se prueba sin navegador, así que se le da solo
  // lo que usa (getElementById, createElement y append).
  const crear = () => ({
    textContent: "", className: "", hidden: false, children: [],
    append(...hijos) { this.children.push(...hijos); },
    replaceChildren(...hijos) { this.children = hijos; },
  });
  const nodos = {};
  globalThis.document = { getElementById: (id) => (nodos[id] ||= crear()), createElement: crear };

  Sesion.guardar("token-de-prueba", { nombre: "Admin", rol: "admin" });
  const resumen = {
    dias: 30,
    embudo: { visitas_que_vieron: 9, visitas_que_agregaron: 4, visitas_que_empezaron_pedido: 2, visitas_que_confirmaron: 1, abandono: 75 },
    pedidos: { cantidad: 1, dinero: 24000 },
    sabores: [{ nombre: "Pixel Monster", vistos: 5, agregados: 3 }],
  };
  new ResumenVista({ get: async () => resumen });
  await new Promise((r) => setTimeout(r, 20)); // actualizar() es asíncrona

  assert.equal(nodos["seccion-analitica"].hidden, false, "el admin ve la sección");
  const linea = nodos["resumen-analitica"].textContent;
  assert.ok(linea.includes("4 visitas agregaron al carrito"));
  assert.ok(linea.includes("abandono 75%"));
  assert.ok(linea.includes("24.000"), "el dinero va en pesos");
  assert.equal(nodos["lista-analitica"].children.length, 1);
  const tarjeta = nodos["lista-analitica"].children[0].children[0];
  assert.equal(tarjeta.children[0].textContent, "Pixel Monster");
  assert.ok(tarjeta.children[2].textContent.includes("5 visitas lo vieron"));

  // Un cliente sin sesión no ve la sección ni pide datos.
  Sesion.limpiar();
  let pidio = false;
  const vista = new ResumenVista({ get: async () => { pidio = true; return resumen; } });
  await vista.actualizar();
  assert.equal(nodos["seccion-analitica"].hidden, true);
  assert.equal(pidio, false, "sin sesión no se pide el resumen a la API");
  delete globalThis.document;
});

// ---------- Estado del pedido (consulta pública) ----------

test("Estado: la tarjeta pinta el estado y lo siguiente, sin datos de nadie más", async () => {
  const { EstadoVista } = await cargar();
  const nodos = {};
  const crear = () => ({
    textContent: "", className: "", hidden: false, value: "", children: [], attrs: {},
    classList: { toggle() {} },
    addEventListener() {},
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...hijos) { this.children.push(...hijos); },
    replaceChildren(...hijos) { this.children = hijos; },
  });
  globalThis.document = { getElementById: (id) => (nodos[id] ||= crear()), createElement: crear };

  const pedido = {
    id: 12, estado: "listo", creado_en: "2026-10-12T15:00:00.000Z", total: 12000, descuento: 0,
    detalles: [{ nombre_sabor: "Pixel Monster", cantidad: 2 }],
  };
  const llamadas = [];
  pedido.entrega = "cucuta";
  pedido.envio = 5000;
  const vista = new EstadoVista({
    post: async (ruta, cuerpo) => { llamadas.push({ ruta, cuerpo }); return pedido; },
  });
  vista.pintar(pedido);

  // La consulta va por POST con id y teléfono en el CUERPO: en una URL el
  // teléfono quedaría en el historial del navegador y en los registros del
  // servidor.
  globalThis.FormData = class { constructor(f) { this.f = f; } get(k) { return this.f.valores[k]; } };
  await vista.consultar({ preventDefault() {}, target: { valores: { id: "12", telefono: "313 783 9935" } } });
  delete globalThis.FormData;
  assert.deepEqual(llamadas, [{ ruta: "/pedidos/estado", cuerpo: { id: "12", telefono: "313 783 9935" } }]);
  assert.ok(!llamadas[0].ruta.includes("313"), "el teléfono no aparece en la ruta");

  const caja = nodos["estado-resultado"];
  assert.equal(caja.hidden, false, "el resultado se muestra");
  const titulo = caja.children[0].textContent;
  assert.ok(titulo.includes("Pedido #12"));
  assert.ok(titulo.includes("Listo para entregar"), "el estado se traduce a palabras del cliente");
  // Debajo del título va la misión: etapa 3 de 4, con las dos primeras hechas.
  const mision = caja.children[1];
  assert.ok(mision.className.includes("mision-etapa-3"));
  assert.equal(mision.children[0].textContent, "Etapa 3 de 4 · Listo para salir", "a domicilio, lo listo sale");
  const pasos = mision.children[1].children;
  assert.deepEqual(pasos.map((li) => li.className.replace("mision-paso ", "")),
    ["paso-hecha", "paso-hecha", "paso-actual", "paso-pendiente"]);
  assert.equal(pasos[2].attrs["aria-current"], "step", "el lector de pantalla sabe en qué etapa va");
  assert.ok(caja.children[2].textContent.includes("Domicilio en Cúcuta"), "se ve cómo llega el pedido");
  assert.ok(caja.children[2].textContent.includes("5.000"), "y lo que costó el envío");
  assert.ok(caja.children[3].children[0].textContent.includes("2 × Pixel Monster"));
  assert.ok(caja.children[4].textContent.length > 10, "siempre dice qué viene ahora");
  assert.equal(caja.children.length, 5, "sin entregar no hay botón de compartir");
  // El recorte no puede filtrar nada del cliente que pidió.
  const completo = JSON.stringify(caja.children);
  assert.ok(!completo.includes("Ceiba"));
  assert.ok(!completo.includes("Ana"));
  delete globalThis.document;
});

test("Misión: cada estado es una etapa y lo cancelado apaga la ruta", async () => {
  const { misionDe, ETAPAS_MISION } = await cargar();
  assert.equal(ETAPAS_MISION.length, 4);

  const recibido = misionDe({ estado: "pendiente", entrega: "recoger" });
  assert.equal(recibido.cabeza, "Etapa 1 de 4 · Pedido recibido");
  assert.deepEqual(recibido.etapas.map((e) => e.paso), ["actual", "pendiente", "pendiente", "pendiente"]);
  assert.equal(recibido.etapas[2].titulo, "Listo para recoger", "si recoge, lo listo se recoge");

  const cumplida = misionDe({ estado: "entregado", entrega: "cucuta" });
  assert.equal(cumplida.cumplida, true);
  assert.equal(cumplida.cabeza, "¡Misión cumplida!");
  assert.deepEqual(cumplida.etapas.map((e) => e.paso), ["hecha", "hecha", "hecha", "actual"]);

  const cancelada = misionDe({ estado: "cancelado" });
  assert.equal(cancelada.cancelada, true);
  assert.equal(cancelada.cumplida, false);
  assert.equal(cancelada.cabeza, "Misión cancelada");
  assert.ok(cancelada.etapas.every((e) => e.paso === "apagada"));

  assert.equal(misionDe({ estado: "raro" }), null, "un estado desconocido no se dibuja como misión");
});

test("Misión: al entregar aparece compartir y el texto no lleva datos del pedido", async () => {
  const { EstadoVista, textoVictoria } = await cargar();
  const crear = () => ({
    textContent: "", className: "", hidden: false, value: "", children: [], attrs: {},
    classList: { toggle() {} },
    addEventListener() {},
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...hijos) { this.children.push(...hijos); },
    replaceChildren(...hijos) { this.children = hijos; },
  });
  const nodos = {};
  globalThis.document = { getElementById: (id) => (nodos[id] ||= crear()), createElement: crear };
  const vista = new EstadoVista({ post: async () => ({}) });
  const mision = vista.pintar({
    id: 77, estado: "entregado", creado_en: "2026-10-12T15:00:00.000Z", total: 6000,
    entrega: "recoger", envio: 0, detalles: [{ nombre_sabor: "Pixel Klim", cantidad: 1 }],
  });
  assert.equal(mision.cumplida, true);
  const caja = nodos["estado-resultado"];
  const ultimo = caja.children.at(-1);
  assert.ok(ultimo.className.includes("mision-compartir"));
  assert.equal(ultimo.textContent, "Compartir mi victoria");

  const texto = textoVictoria("https://pixel.example");
  assert.ok(texto.includes("Misión cumplida"));
  assert.ok(texto.includes("https://pixel.example"));
  assert.ok(!texto.includes("77") && !texto.includes("313"), "ni número de pedido ni teléfono");
  delete globalThis.document;
});

// ---------- Inventario en el carrito ----------

// Carrito limpio: el carrito se guarda en localStorage, así que dos instancias
// seguidas se ven la una a la otra y las cuentas del test saldrían mezcladas.
const carritoLimpio = async () => {
  const { Carrito } = await cargar();
  const c = new Carrito();
  c.vaciar();
  return c;
};

test("Carrito: un sabor sin inventario declarado sigue con el tope de la API", async () => {
  const c = await carritoLimpio();
  assert.equal(c.agregar({ id: 1, nombre: "Libre", precio: 6000, cantidadDisponible: null }), true);
  assert.equal(c.items[0].disponible, null);
  c.cambiarCantidad(1, 500);
  assert.equal(c.items[0].cantidad, 100, "sin inventario el tope es el que acepta la API");
});

test("Carrito: no se puede llevar más de lo que queda, ni agregar un agotado", async () => {
  const c = await carritoLimpio();
  assert.equal(c.agregar({ id: 2, nombre: "Quedan 3", precio: 6000, cantidadDisponible: 3 }), true);
  c.cambiarCantidad(2, 10);
  assert.equal(c.items[0].cantidad, 3, "el carrito se detiene en las unidades disponibles");

  // Un sabor agotado no entra al carrito ni por el botón ni recargando la página.
  assert.equal(c.agregar({ id: 3, nombre: "Agotado", precio: 6000, cantidadDisponible: 0 }), false);
  assert.equal(c.items.length, 1);

  // Si el obrador baja las unidades por debajo de lo que ya hay en el carrito,
  // el catálogo manda: la línea se recorta y ya no se puede subir.
  assert.equal(c.agregar({ id: 2, nombre: "Quedan 3", precio: 6000, cantidadDisponible: 1 }), false);
  assert.equal(c.items[0].cantidad, 1);
  assert.equal(c.agregar({ id: 2, nombre: "Quedan 3", precio: 6000, cantidadDisponible: 1 }), false);
  // Y si el sabor se agota por completo, la línea desaparece del carrito.
  assert.equal(c.agregar({ id: 2, nombre: "Quedan 3", precio: 6000, cantidadDisponible: 0 }), false);
  assert.equal(c.agregar({ id: 0, nombre: "Otro", precio: 6000, cantidadDisponible: null }), true);
});

// ---------- Compra: carrito al día, sesión vencida y guardado fallido ----------

const limpiarCuenta = () => {
  for (const k of ["pixel_galletas_carrito_union", "pixel_galletas_carrito_pendiente", "pixel_galletas_sesion", "pixel_galletas_sesion_vencida"]) delete memoria[k];
};
const lineaGuardada = (extra = {}) => ({ producto_id: 7, nombre: "Pixel Monster", precio: 6000, disponible: null, cantidad: 2, ...extra });
const catalogo = (extra = {}) => [{ id: 7, nombre: "Pixel Monster", precio: 6000, cantidadDisponible: null, ...extra }];

test("Reconciliar: el carrito guardado toma nombre, precio y existencias del catálogo y lo cuenta", async () => {
  const { Carrito, pesos } = await cargar();
  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada({ cantidad: 5 })]);
  const c = new Carrito();
  const cambios = c.reconciliar(catalogo({ nombre: "Pixel Monster XL", precio: 7000, cantidadDisponible: 3 }));
  assert.deepEqual(c.items, [{ producto_id: 7, nombre: "Pixel Monster XL", precio: 7000, disponible: 3, cantidad: 3 }]);
  assert.equal(cambios.length, 3);
  assert.ok(cambios.some((t) => t.includes(pesos(7000))), "se dice el precio nuevo");
  assert.equal(new Carrito().subtotal, 21000, "y queda guardado");
  assert.deepEqual(new Carrito().reconciliar(catalogo({ nombre: "Pixel Monster XL", precio: 7000, cantidadDisponible: 3 })), [], "sin cambios no hay nada que contar");
});

test("Reconciliar: lo agotado o retirado sale del carrito, y un catálogo vacío no borra nada", async () => {
  const { Carrito } = await cargar();
  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada(), lineaGuardada({ producto_id: 9, nombre: "Pixel Klim" })]);
  const c = new Carrito();
  assert.deepEqual(c.reconciliar([]), []);
  assert.equal(c.items.length, 2, "un fallo del servidor no vacía el carrito");
  const cambios = c.reconciliar(catalogo({ cantidadDisponible: 0 }));
  assert.equal(c.items.length, 0);
  assert.equal(cambios.length, 2);
  assert.ok(cambios[0].includes("agotó"));
  assert.ok(cambios[1].includes("Pixel Klim"));
});

test("Carrito: una línea en 0 no sobrevive, porque bloquearía todo el pedido", async () => {
  const { Carrito } = await cargar();
  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada({ cantidad: 0 }), lineaGuardada({ producto_id: 9 })]);
  assert.deepEqual(new Carrito().paraApi(), [{ producto_id: 9, cantidad: 2 }], "las guardadas en 0 no se recuperan");

  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada({ disponible: 0 })]);
  const agotada = new Carrito();
  agotada.cambiarCantidad(7, 1);
  assert.equal(agotada.items.length, 0, "con el sabor agotado, la línea sale en vez de quedar en 0");

  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada()]);
  const repetida = new Carrito();
  assert.equal(repetida.agregar({ id: 7, nombre: "Pixel Monster", precio: 6000, cantidadDisponible: 0 }), false);
  assert.equal(repetida.items.length, 0, "agregar un sabor recién agotado también lo saca");
});

test("Combo: faltaPara dice qué sabor no alcanza, contando lo que ya hay en el carrito", async () => {
  const { Carrito } = await cargar();
  const c = new Carrito();
  const special = { id: 1, nombre: "Pixel Special Edition", precio: 9000, cantidadDisponible: 3 };
  const normal = { id: 2, nombre: "Pixel Monster", precio: 6000, cantidadDisponible: null };
  c.agregar(special);
  c.agregar(special);
  assert.equal(c.faltaPara([{ producto: special, cantidad: 1 }, { producto: normal, cantidad: 2 }]), null);
  assert.deepEqual(c.faltaPara([{ producto: normal, cantidad: 2 }, { producto: special, cantidad: 2 }]), { nombre: "Pixel Special Edition", caben: 1 });
  assert.equal(c.cuantasCaben({ id: 3, cantidadDisponible: 0 }), 0);
});

test("Sesión vencida: el carrito se queda, y al volver a entrar lo guardado es lo que el cliente ve", async () => {
  const { Carrito, Sesion, ApiClient, CarritoServicio } = await cargar();
  limpiarCuenta();
  Sesion.guardar("token-viejo", { id: 31, nombre: "Ana" });
  memoria[Carrito.CLAVE_UNION] = "31";
  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada()]);
  respuesta = { ok: false, status: 401, cuerpo: { error: "Token inválido o expirado" } };
  const c = new Carrito(new CarritoServicio(new ApiClient()));
  await c.unirConCuenta(); // el servidor rechaza el token vencido
  assert.equal(Sesion.obtener(), null);
  assert.equal(Sesion.vencio(), true);

  // Próxima carga, ya sin sesión: es donde antes desaparecía.
  const recarga = new Carrito(new CarritoServicio(new ApiClient()));
  await recarga.unirConCuenta();
  assert.equal(recarga.cantidadTotal, 2);
  recarga.agregar({ id: 9, nombre: "Pixel Klim", precio: 6000 });

  // Vuelve a entrar con la misma cuenta: lo agregado mientras tanto no se pierde.
  Sesion.guardar("token-nuevo", { id: 31, nombre: "Ana" });
  const enviado = [];
  const cuenta = {
    hayCuenta: () => true,
    obtener: async () => [lineaGuardada()],
    guardar: async (items) => { enviado.push(items.map((i) => [i.producto_id, i.cantidad])); },
  };
  const deVuelta = new Carrito(cuenta);
  await deVuelta.unirConCuenta();
  assert.deepEqual(deVuelta.paraApi(), [{ producto_id: 7, cantidad: 2 }, { producto_id: 9, cantidad: 1 }]);
  assert.deepEqual(enviado, [[[7, 2], [9, 1]]]);
  assert.equal(Sesion.vencio(), false);
  limpiarCuenta();
});

test("Sesión vencida: otra cuenta en el mismo navegador no hereda ese carrito", async () => {
  const { Carrito, Sesion } = await cargar();
  limpiarCuenta();
  Sesion.vencer();
  memoria[Carrito.CLAVE_UNION] = "31";
  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada()]);
  Sesion.guardar("token-otra", { id: 40, nombre: "Beto" });
  const enviado = [];
  const c = new Carrito({
    hayCuenta: () => true,
    obtener: async () => [lineaGuardada({ producto_id: 9, nombre: "Pixel Klim", cantidad: 1 })],
    guardar: async (items) => { enviado.push(items.map((i) => [i.producto_id, i.cantidad])); },
  });
  await c.unirConCuenta();
  assert.deepEqual(c.paraApi(), [{ producto_id: 9, cantidad: 1 }]);
  assert.deepEqual(enviado, [[[9, 1]]]);
  assert.equal(memoria[Carrito.CLAVE_UNION], "40");
  limpiarCuenta();
});

test("Cerrar sesión a propósito sí saca el carrito, aunque antes hubiera vencido otra", async () => {
  const { Carrito, Sesion } = await cargar();
  limpiarCuenta();
  Sesion.vencer();
  Sesion.guardar("token", { id: 32, nombre: "Ana" });
  memoria[Carrito.CLAVE_UNION] = "32";
  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada()]);
  Sesion.limpiar();
  const c = new Carrito({ hayCuenta: () => false });
  await c.unirConCuenta();
  assert.equal(c.cantidadTotal, 0);
  limpiarCuenta();
});

test("Guardado fallido: la próxima carga conserva el carrito del navegador y lo reenvía", async () => {
  const { Carrito, Sesion } = await cargar();
  // Los guardados diferidos de pruebas anteriores tocan la misma marca: se dejan terminar.
  await new Promise((r) => setTimeout(r, 450));
  limpiarCuenta();
  Sesion.guardar("token", { id: 33, nombre: "Ana" });
  memoria[Carrito.CLAVE_UNION] = "33";
  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada()]);
  let falla = true;
  let servidor = [lineaGuardada()];
  const cuenta = {
    hayCuenta: () => true,
    obtener: async () => servidor,
    guardar: async (items) => {
      if (falla) throw new Error("sin red");
      servidor = items.map((i) => ({ ...i }));
      return servidor;
    },
  };
  const c = new Carrito(cuenta);
  c.cambiarCantidad(7, 5);
  await new Promise((r) => setTimeout(r, 500)); // falla el guardado en la cuenta

  falla = false;
  const recarga = new Carrito(cuenta);
  await recarga.unirConCuenta();
  assert.equal(recarga.cantidadTotal, 5, "no vuelve el carrito viejo del servidor");
  assert.equal(servidor[0].cantidad, 5, "y la cuenta se pone al día");

  servidor = [lineaGuardada({ cantidad: 1 })];
  const otraCarga = new Carrito(cuenta);
  await otraCarga.unirConCuenta();
  assert.equal(otraCarga.cantidadTotal, 1, "sin nada pendiente, el servidor vuelve a mandar");
  limpiarCuenta();
});

test("Unir carritos: se adopta lo que el servidor aceptó, ya recortado al inventario", async () => {
  const { Carrito, Sesion, CarritoServicio } = await cargar();
  limpiarCuenta();
  Sesion.guardar("token", { id: 34, nombre: "Ana" });
  memoria["pixel_galletas_carrito"] = JSON.stringify([lineaGuardada({ cantidad: 9 })]);
  const api = {
    get: async () => [],
    put: async () => [{ producto_id: 7, nombre_sabor: "Pixel Monster", precio_venta: "6000.00", cantidad_disponible: 4, cantidad: 4 }],
  };
  const c = new Carrito(new CarritoServicio(api));
  await c.unirConCuenta();
  assert.deepEqual(c.items, [{ producto_id: 7, nombre: "Pixel Monster", precio: 6000, disponible: 4, cantidad: 4 }]);
  assert.equal(new Carrito().cantidadTotal, 4);
  limpiarCuenta();
});

test("textoPedido: un combo se nombra y el total cuadra con lo cobrado", async () => {
  const { Pedido, textoPedido, pesos } = await cargar();
  const texto = textoPedido(new Pedido({
    id: 8, cliente_nombre: "Ana", cliente_telefono: "3001112233", estado: "pendiente",
    creado_en: new Date().toISOString(), direccion: "Calle 5", notas: null,
    entrega: "cucuta", envio: "5000.00", total: "27000.00", descuento: "0.00",
    detalles: [
      { nombre_sabor: "Pixel Special Edition", precio_unitario: "9000.00", cantidad: 1 },
      { nombre_sabor: "Pixel Monster", precio_unitario: "6000.00", cantidad: 2 },
    ],
  }));
  assert.ok(texto.includes(`*Combo Pixel x1:* ${pesos(22000)}`));
  assert.ok(texto.includes("• 2 × Pixel Monster\n"), "las galletas del combo no llevan precio suelto");
  assert.ok(!texto.includes(pesos(12000)));
  assert.ok(texto.includes(`*Total:* ${pesos(27000)}`));
});

test("Reconciliar: las líneas que llegan de la cuenta también pasan por el catálogo", async () => {
  const { Carrito, Sesion } = await cargar();
  limpiarCuenta();
  Sesion.guardar("token", { id: 35, nombre: "Ana" });
  memoria[Carrito.CLAVE_UNION] = "35";
  const enviado = [];
  const cuenta = {
    hayCuenta: () => true,
    obtener: async () => [lineaGuardada({ cantidad: 5 }), lineaGuardada({ producto_id: 9, nombre: "Pixel Klim", disponible: 0 })],
    guardar: async (items) => { enviado.push(items.map((i) => [i.producto_id, i.cantidad])); },
  };
  const c = new Carrito(cuenta);
  await c.unirConCuenta();
  assert.equal(c.items.length, 2, "el servidor manda el carrito tal como lo tiene");
  const cambios = c.reconciliar([...catalogo({ cantidadDisponible: 3 }), { id: 9, nombre: "Pixel Klim", precio: 6000, cantidadDisponible: 0 }]);
  assert.deepEqual(c.paraApi(), [{ producto_id: 7, cantidad: 3 }]);
  assert.equal(cambios.length, 2);
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(enviado, [[[7, 3]]], "y la cuenta se entera del ajuste");
  limpiarCuenta();
});

test("Navegación: sin cabecera se carga la página entera y el menú lleva a la portada", async () => {
  const { cabeEnCascara, destinoDeAncla } = await import("../public/js/navegacion.js");
  const doc = (...piezas) => ({ querySelector: (s) => (piezas.includes(s) ? {} : null) });
  const portada = doc("header.barra", "footer.pie", "#mini-carrito");
  const combo = doc();
  assert.equal(cabeEnCascara(portada, combo), false, "la portada no se pinta sobre una página sin cabecera");
  assert.equal(cabeEnCascara(combo, portada), true, "el combo sí se pinta dentro de la portada");
  assert.equal(cabeEnCascara(portada, portada), true);
  assert.equal(destinoDeAncla("/combo-personalizado.html", "#pedido", null), "/#pedido");
  assert.equal(destinoDeAncla("/combo-personalizado.html", "#armador", {}), null, "un ancla que existe se queda");
  assert.equal(destinoDeAncla("/", "#pedido", null), null);
});

// ---------- Pedidos grandes ----------

test("Pedidos grandes: el aviso depende de la cantidad", async () => {
  const { diasDeAviso } = await import("../public/js/pedidos-grandes.js");
  assert.deepEqual([24, 50, 51, 100, 101].map(diasDeAviso), [4, 4, 8, 8, null]);
});

test("Pedidos grandes: una fecha muy cercana avisa, pero no impide escribir", async () => {
  const { avisoDePlazo } = await import("../public/js/pedidos-grandes.js");
  const hoy = new Date(2026, 10, 9, 22, 30);
  assert.equal(avisoDePlazo(50, "2026-11-13", hoy).justo, false, "justo en los 4 días");
  assert.equal(avisoDePlazo(50, "2026-11-12", hoy).justo, true);
  assert.equal(avisoDePlazo(100, "2026-11-17", hoy).justo, false, "justo en los 8 días");
  assert.equal(avisoDePlazo(100, "2026-11-16", hoy).justo, true);
  assert.match(avisoDePlazo(150, "2026-11-10", hoy).texto, /acordamos el plazo/);
  assert.equal(avisoDePlazo(10, "2026-11-20", hoy).texto, "", "bajo el mínimo no promete plazos");
});

test("Pedidos grandes: el mensaje lleva los datos en orden y ningún precio", async () => {
  const { mensajeCotizacion } = await import("../public/js/pedidos-grandes.js");
  const datos = { cantidad: 100, ocasion: "Torneo", fecha: "2026-12-15", zona: "Cúcuta", nombre: "Andrés" };
  const texto = mensajeCotizacion(datos);
  for (const dato of ["Soy Andrés", "100 galletas", "Torneo", "15 de diciembre de 2026", "Cúcuta"]) assert.ok(texto.includes(dato), dato);
  assert.ok(!texto.includes("$"));
  assert.ok(!texto.includes("fecha está cerca"));
  assert.ok(mensajeCotizacion(datos, true).includes("fecha está cerca"));
});

test("Carrito: a 100 de un sabor se detiene y no pasa del tope", async () => {
  const { Carrito } = await cargar();
  const c = new Carrito();
  const galleta = { id: 7, nombre: "Pixel Monster", precio: 7000, cantidadDisponible: null };
  c.agregar(galleta);
  c.cambiarCantidad(7, 100);
  assert.equal(c.agregar(galleta), false);
  assert.equal(c.cantidadTotal, 100);
});

// ---------- Barra de poder y "¡Nivel completado!" ----------

test("Barra de poder: los niveles siguen la escalera real de descuentos", async () => {
  const { progresoPoder } = await cargar();
  const vacio = progresoPoder(0);
  assert.equal(vacio.nivel, "1");
  assert.equal(vacio.faltan, 12);
  assert.equal(vacio.llenado, 0);
  assert.deepEqual(vacio.metas.map((m) => [m.desde, m.porcentaje, m.posicion]), [[12, 5, 0.25], [24, 8, 0.5], [48, 10, 1]]);

  const once = progresoPoder(11);
  assert.equal(once.nivel, "1");
  assert.equal(once.faltan, 1, "a una galleta del 5%");
  assert.ok(once.metas.every((m) => !m.logrado), "nada encendido antes de tener el descuento");

  const doce = progresoPoder(12);
  assert.equal(doce.nivel, "2");
  assert.equal(doce.porcentaje, 5);
  assert.deepEqual(doce.metas.map((m) => m.logrado), [true, false, false]);
  assert.equal(doce.siguiente.porcentaje, 8);

  const maximo = progresoPoder(60);
  assert.equal(maximo.nivel, "MAX");
  assert.equal(maximo.siguiente, null);
  assert.equal(maximo.llenado, 1, "la barra no se pasa del tope");
});

test("Barra de poder: un combo no la llena (precio fijo, sin descuento por volumen)", async () => {
  const { Carrito, progresoPoder } = await cargar();
  const c = new Carrito();
  c.items = [
    { producto_id: 6, nombre: "Pixel Special Edition", precio: 9500, cantidad: 6 },
    { producto_id: 1, nombre: "Pixel Monster", precio: 7000, cantidad: 6 },
  ];
  assert.ok(c.combo, "12 galletas que forman 2 Combo x3");
  assert.equal(progresoPoder(c.cantidadSueltas).porcentaje, 0, "la barra no promete el 5%");
});

test("Nivel completado: el ahorro suma descuento por volumen y diferencia del combo", async () => {
  const { ahorroDe } = await cargar();
  assert.equal(ahorroDe({ descuento: 4200, detalles: [{ nombre: "Pixel Monster", precio: 7000, cantidad: 12 }] }), 4200);
  // Combo x1: 1 Special + 2 normales = 23.500 sueltas, se cobra 22.000.
  assert.equal(ahorroDe({ descuento: 0, detalles: [
    { nombre: "Pixel Special Edition", precio: 9500, cantidad: 1 },
    { nombre: "Pixel Monster", precio: 7000, cantidad: 2 },
  ] }), 1500);
  assert.equal(ahorroDe({ descuento: 0, detalles: [{ nombre: "Pixel Monster", precio: 7000, cantidad: 1 }] }), 0);
});
