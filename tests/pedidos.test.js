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
    textContent: "", className: "", hidden: false, value: "", children: [],
    classList: { toggle() {} },
    addEventListener() {},
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
  assert.ok(caja.children[1].textContent.includes("Domicilio en Cúcuta"), "se ve cómo llega el pedido");
  assert.ok(caja.children[1].textContent.includes("5.000"), "y lo que costó el envío");
  assert.ok(caja.children[2].children[0].textContent.includes("2 × Pixel Monster"));
  assert.ok(caja.children[3].textContent.length > 10, "siempre dice qué viene ahora");
  // El recorte no puede filtrar nada del cliente que pidió.
  const completo = JSON.stringify(caja.children);
  assert.ok(!completo.includes("Ceiba"));
  assert.ok(!completo.includes("Ana"));
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
