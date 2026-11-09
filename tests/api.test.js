// Pruebas de la API: autenticación, autorización por rol y CRUD (con base simulada).
process.env.JWT_SECRET = "clave-solo-para-pruebas";
// Los límites de tasa protegen la API real contra fuerza bruta y spam, pero la
// suite hace cientos de peticiones legítimas en segundos desde 127.0.0.1. Se
// suben por aquí (el módulo de límites los lee del entorno) sin tocar el
// código: en producción siguen con sus topes normales.
for (const clave of ["LIMITE_API_MAX", "LIMITE_LOGIN_MAX", "LIMITE_REGISTRO_MAX", "LIMITE_PEDIDOS_MAX", "LIMITE_ESTADO_MAX"]) {
  process.env[clave] = "100000";
}
// Las pruebas no deben hablar con Telegram aunque el .env del proyecto tenga
// las llaves del obrador: se declaran vacías para que dotenv no las rellene y
// el aviso quede en "sin configurar".
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { instalarDbFalsa } = require("./helpers/dbFalsa");
const db = instalarDbFalsa();
const app = require("../src/app");

let servidor, base, tokAdmin, tokCliente, idAdmin, idCliente, idPedido;

async function llamar(metodo, ruta, cuerpo, token) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: r.status, datos: await r.json().catch(() => null) };
}
const entrar = async (correo, contrasena) => (await llamar("POST", "/api/usuarios/login", { correo, contrasena })).datos.token;

before(async () => {
  servidor = app.listen(0);
  base = "http://127.0.0.1:" + servidor.address().port;
  idAdmin = db.agregarUsuario("Admin", "admin@x.com", await bcrypt.hash("adminpass", 10), "admin");
  tokAdmin = await entrar("admin@x.com", "adminpass");
});
after(() => servidor.close());

test("Registro: crea un cliente aunque se envíe rol=admin", async () => {
  const { estado, datos } = await llamar("POST", "/api/usuarios/registro", { nombre: "Ana", correo: "ana@x.com", contrasena: "secreto1", rol: "admin" });
  assert.equal(estado, 201);
  assert.equal(datos.rol, "cliente");
  idCliente = datos.id;
  tokCliente = await entrar("ana@x.com", "secreto1");
});

test("Registro: rechaza contraseña corta (400) y correo repetido (409)", async () => {
  assert.equal((await llamar("POST", "/api/usuarios/registro", { nombre: "B", correo: "b@x.com", contrasena: "123" })).estado, 400);
  assert.equal((await llamar("POST", "/api/usuarios/registro", { nombre: "Ana", correo: "ana@x.com", contrasena: "otraclave" })).estado, 409);
});

test("Login: credenciales incorrectas -> 401 con mensaje genérico", async () => {
  const { estado, datos } = await llamar("POST", "/api/usuarios/login", { correo: "ana@x.com", contrasena: "mala" });
  assert.equal(estado, 401);
  assert.equal(datos.error, "Credenciales inválidas");
});

test("Productos: el catálogo es público", async () => {
  assert.equal((await llamar("GET", "/api/productos")).estado, 200);
});

test("Productos: crear exige sesión (401) y rol admin (403)", async () => {
  const nuevo = { nombre_sabor: "Pixel Test", precio_venta: 5000 };
  assert.equal((await llamar("POST", "/api/productos", nuevo)).estado, 401);
  assert.equal((await llamar("POST", "/api/productos", nuevo, "token.falso.aqui")).estado, 401);
  assert.equal((await llamar("POST", "/api/productos", nuevo, tokCliente)).estado, 403);
});

test("Productos: el admin crea, edita y elimina", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Test", precio_venta: 5000 }, tokAdmin);
  assert.equal(creado.estado, 201);
  const id = creado.datos.id;
  const editado = await llamar("PUT", "/api/productos/" + id, { precio_venta: 5200 }, tokAdmin);
  assert.equal(editado.estado, 200);
  assert.equal(Number(editado.datos.precio_venta), 5200);
  assert.equal((await llamar("PUT", "/api/productos/" + id, { precio_venta: 1 }, tokCliente)).estado, 403);
  assert.equal((await llamar("DELETE", "/api/productos/" + id, null, tokCliente)).estado, 403);
  assert.equal((await llamar("DELETE", "/api/productos/" + id, null, tokAdmin)).estado, 200);
  assert.equal((await llamar("GET", "/api/productos/" + id)).estado, 404);
});

test("Usuarios: la gestión es solo del admin y nunca expone contraseñas", async () => {
  assert.equal((await llamar("GET", "/api/usuarios")).estado, 401);
  assert.equal((await llamar("GET", "/api/usuarios", null, tokCliente)).estado, 403);
  const lista = await llamar("GET", "/api/usuarios", null, tokAdmin);
  assert.equal(lista.estado, 200);
  assert.ok(!JSON.stringify(lista.datos).includes("contrasena"));
});

test("Usuarios: rol inválido (400); el admin no puede eliminarse ni quitarse su rol", async () => {
  assert.equal((await llamar("PUT", "/api/usuarios/" + idCliente, { rol: "superadmin" }, tokAdmin)).estado, 400);
  assert.equal((await llamar("DELETE", "/api/usuarios/" + idAdmin, null, tokAdmin)).estado, 400);
  assert.equal((await llamar("PUT", "/api/usuarios/" + idAdmin, { rol: "cliente" }, tokAdmin)).estado, 400);
});

test("Usuarios: el rol vigente en la base de datos manda sobre el del token", async () => {
  await llamar("PUT", "/api/usuarios/" + idCliente, { rol: "admin" }, tokAdmin);
  assert.equal((await llamar("GET", "/api/usuarios", null, tokCliente)).estado, 200);
  await llamar("PUT", "/api/usuarios/" + idCliente, { rol: "cliente" }, tokAdmin);
  assert.equal((await llamar("GET", "/api/usuarios", null, tokCliente)).estado, 403);
  await llamar("DELETE", "/api/usuarios/" + idCliente, null, tokAdmin);
  assert.equal((await llamar("GET", "/api/usuarios", null, tokCliente)).estado, 403);
});

test("Rutas inexistentes responden 404 en JSON", async () => {
  const { estado, datos } = await llamar("GET", "/api/nada");
  assert.equal(estado, 404);
  assert.ok(datos);
});

// ---------- Pedidos ----------

test("Pedidos: crear es público y valida los datos del cliente", async () => {
  const sinItems = await llamar("POST", "/api/pedidos", { cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [] });
  assert.equal(sinItems.estado, 400);
  const sinNombre = await llamar("POST", "/api/pedidos", { cliente_telefono: "3001112233", items: [{ producto_id: 1, cantidad: 1 }] });
  assert.equal(sinNombre.estado, 400);
  const telefonoMalo = await llamar("POST", "/api/pedidos", { cliente_nombre: "Ana", cliente_telefono: "abc", items: [{ producto_id: 1, cantidad: 1 }] });
  assert.equal(telefonoMalo.estado, 400);
  const productoInexistente = await llamar("POST", "/api/pedidos", { cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [{ producto_id: 9999, cantidad: 1 }] });
  assert.equal(productoInexistente.estado, 400);
  const cantidadMala = await llamar("POST", "/api/pedidos", { cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [{ producto_id: 1, cantidad: 0 }] });
  assert.equal(cantidadMala.estado, 400);
});

test("Pedidos: el total lo calcula el servidor con los precios reales, no con los del navegador", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Prueba", precio_venta: 6000 }, tokAdmin);
  const idProducto = creado.datos.id;

  // El cliente manda precio_unitario falsísimo: debe ignorarse.
  const respuesta = await llamar("POST", "/api/pedidos", {
    cliente_nombre: "Pedro",
    cliente_telefono: "+57 300 555 4444",
    direccion: "Ceiba 2",
    notas: "Sin nueces",
    items: [
      { producto_id: idProducto, cantidad: 3, precio_unitario: 1 },
      { producto_id: idProducto, cantidad: 2 },
    ],
  });
  assert.equal(respuesta.estado, 201);
  idPedido = respuesta.datos.id;
  assert.equal(respuesta.datos.total, 30000); // 5 × $6.000, ignorando precio_unitario del cliente
  assert.equal(respuesta.datos.estado, "pendiente");
  assert.equal(respuesta.datos.detalles.length, 2);
  assert.equal(respuesta.datos.detalles[0].nombre_sabor, "Pixel Prueba");
  assert.ok(!JSON.stringify(respuesta.datos).includes("contrasena"));
});

test("Pedidos: ver y gestionar es solo del admin", async () => {
  assert.equal((await llamar("GET", "/api/pedidos")).estado, 401);
  assert.equal((await llamar("GET", "/api/pedidos", null, tokCliente)).estado, 403);
  assert.equal((await llamar("PUT", `/api/pedidos/${idPedido}/estado`, { estado: "listo" }, tokCliente)).estado, 403);

  const lista = await llamar("GET", "/api/pedidos", null, tokAdmin);
  assert.equal(lista.estado, 200);
  assert.ok(lista.datos.some((p) => p.id === idPedido));
  assert.ok(lista.datos.find((p) => p.id === idPedido).detalles.length >= 2);

  const estadoInvalido = await llamar("PUT", `/api/pedidos/${idPedido}/estado`, { estado: "volando" }, tokAdmin);
  assert.equal(estadoInvalido.estado, 400);

  const actualizado = await llamar("PUT", `/api/pedidos/${idPedido}/estado`, { estado: "listo" }, tokAdmin);
  assert.equal(actualizado.estado, 200);
  assert.equal(actualizado.datos.estado, "listo");

  assert.equal((await llamar("PUT", "/api/pedidos/99999/estado", { estado: "listo" }, tokAdmin)).estado, 404);
  assert.equal((await llamar("GET", "/api/pedidos/99999", null, tokAdmin)).estado, 404);
});

test("Pedidos: el descuento por volumen lo calcula el servidor e ignora el del navegador", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Descuento", precio_venta: 6000 }, tokAdmin);
  const idProducto = creado.datos.id;
  const pedir = (cantidad, extra = {}) => llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [{ producto_id: idProducto, cantidad }], ...extra,
  });

  // 12 galletas: 5% (72.000 -> 68.400). El cliente intenta colar un descuento
  // y un total falsos: se ignoran, igual que el precio_unitario.
  const docena = await pedir(12, { descuento: 999999, total: 1 });
  assert.equal(docena.estado, 201);
  assert.equal(Number(docena.datos.total), 68400);
  assert.equal(Number(docena.datos.descuento), 3600);
  assert.equal(docena.datos.descuento_porcentaje, 5);

  // 48 galletas: 10% (288.000 -> 259.200), y 11 galletas: sin descuento.
  const caja = await pedir(48);
  assert.equal(Number(caja.datos.total), 259200);
  assert.equal(Number(caja.datos.descuento), 28800);
  assert.equal(caja.datos.descuento_porcentaje, 10);
  const sueltas = await pedir(11);
  assert.equal(Number(sueltas.datos.total), 66000);
  assert.equal(Number(sueltas.datos.descuento), 0);
});

test("Domicilio: el costo del envío lo calcula el servidor según la zona y la cantidad", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Envío", precio_venta: 6000 }, tokAdmin);
  const idProducto = creado.datos.id;
  const pedir = (extra) => llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono: "3001112233",
    items: [{ producto_id: idProducto, cantidad: 2 }], ...extra,
  });

  // Recoger: gratis siempre (y es lo que pasa si no se elige nada).
  const recogiendo = await pedir({});
  assert.equal(recogiendo.estado, 201);
  assert.equal(recogiendo.datos.entrega, "recoger");
  assert.equal(Number(recogiendo.datos.envio), 0);
  assert.equal(Number(recogiendo.datos.total), 12000);

  // Cúcuta con menos de 12 galletas: $5.000 de zona + $2.000 del rango 0-3 km.
  // El navegador manda envío y total falsos: se ignoran, igual que el precio_unitario.
  const cucuta = await pedir({ entrega: "cucuta", direccion: "Calle 5 # 3-2", distancia: "0-3", envio: 0, total: 1 });
  assert.equal(cucuta.estado, 201);
  assert.equal(Number(cucuta.datos.envio), 7000);
  assert.equal(Number(cucuta.datos.total), 19000);

  // Municipios: $7.000 de zona + $4.000 del rango 3-6 km.
  const municipios = await pedir({ entrega: "municipios", direccion: "Villa del Rosario", distancia: "3-6" });
  assert.equal(Number(municipios.datos.envio), 11000);
  assert.equal(Number(municipios.datos.total), 23000);

  // Domicilio sin rango elegido: 400, no se adivina el cargo.
  assert.equal((await pedir({ entrega: "cucuta", direccion: "Calle 5 # 3-2", distancia: "99" })).estado, 400);

  // Desde 12 galletas el domicilio sale gratis, en cualquier zona, y el
  // descuento por volumen se aplica igual.
  const docena = await llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono: "3001112233", entrega: "municipios", direccion: "Villa",
    items: [{ producto_id: idProducto, cantidad: 12 }],
  });
  assert.equal(Number(docena.datos.envio), 0);
  assert.equal(Number(docena.datos.total), 68400); // 72.000 − 5% y envío gratis

  // Zona inventada y domicilio sin dirección: 400, sin pedido de por medio.
  assert.equal((await pedir({ entrega: "china" })).estado, 400);
  assert.equal((await pedir({ entrega: "cucuta" })).estado, 400);
});

// ---------- Inventario del obrador ----------

test("Inventario: no se puede pedir más de lo que queda y el agotado se cierra", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Inventario", precio_venta: 6000, cantidad_disponible: 3 }, tokAdmin);
  assert.equal(creado.estado, 201);
  assert.equal(creado.datos.cantidad_disponible, 3);
  assert.equal(creado.datos.disponible, true);
  const id = creado.datos.id;
  const pedir = (cantidad) => llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [{ producto_id: id, cantidad }],
  });

  // Pedir 4 cuando quedan 3 se rechaza, y el rechazo no descuenta nada.
  assert.equal((await pedir(4)).estado, 409);
  assert.equal((await llamar("GET", "/api/productos/" + id)).datos.cantidad_disponible, 3);

  assert.equal((await pedir(2)).estado, 201);
  assert.equal((await llamar("GET", "/api/productos/" + id)).datos.cantidad_disponible, 1);

  // La última unidad se vende y el sabor queda agotado para todos.
  assert.equal((await pedir(1)).estado, 201);
  const agotado = await llamar("GET", "/api/productos/" + id);
  assert.equal(agotado.datos.cantidad_disponible, 0);
  assert.equal(agotado.datos.disponible, false);
  assert.equal((await pedir(1)).estado, 409);
});

test("Inventario: un sabor sin inventario declarado nunca se agota", async () => {
  const libre = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Libre", precio_venta: 6000 }, tokAdmin);
  assert.equal(libre.datos.cantidad_disponible, null, "sin control de inventario no se limita");
  assert.equal(libre.datos.disponible, true);

  const pedido = await llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [{ producto_id: libre.datos.id, cantidad: 50 }],
  });
  assert.equal(pedido.estado, 201);
  assert.equal((await llamar("GET", "/api/productos/" + libre.datos.id)).datos.cantidad_disponible, null);
});

test("Inventario: cancelar un pedido devuelve las galletas y reactivarlo las reserva", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Devuelve", precio_venta: 6000, cantidad_disponible: 5 }, tokAdmin);
  const id = creado.datos.id;
  const pedido = await llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [{ producto_id: id, cantidad: 4 }],
  });
  assert.equal(pedido.estado, 201);
  assert.equal((await llamar("GET", "/api/productos/" + id)).datos.cantidad_disponible, 1);

  // Cancelado: las 4 vuelven al catálogo (1 + 4 = 5).
  assert.equal((await llamar("PUT", `/api/pedidos/${pedido.datos.id}/estado`, { estado: "cancelado" }, tokAdmin)).estado, 200);
  assert.equal((await llamar("GET", "/api/productos/" + id)).datos.cantidad_disponible, 5);

  // Reactivado: se vuelven a reservar (5 - 4 = 1).
  assert.equal((await llamar("PUT", `/api/pedidos/${pedido.datos.id}/estado`, { estado: "listo" }, tokAdmin)).estado, 200);
  assert.equal((await llamar("GET", "/api/productos/" + id)).datos.cantidad_disponible, 1);

  // Si el obrador ya vendió esas unidades, reactivar se rechaza en vez de
  // vender lo que no existe.
  await llamar("PUT", `/api/pedidos/${pedido.datos.id}/estado`, { estado: "cancelado" }, tokAdmin);
  await llamar("PUT", "/api/productos/" + id, { cantidad_disponible: 2 }, tokAdmin);
  assert.equal((await llamar("PUT", `/api/pedidos/${pedido.datos.id}/estado`, { estado: "pendiente" }, tokAdmin)).estado, 409);
});

test("Inventario: el panel marca agotado, cuenta unidades y valida el valor", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Agotado", precio_venta: 6000 }, tokAdmin);
  const id = creado.datos.id;

  const agotado = await llamar("PUT", "/api/productos/" + id, { cantidad_disponible: 0 }, tokAdmin);
  assert.equal(agotado.estado, 200);
  assert.equal(agotado.datos.disponible, false);
  // Marcar agotado no toca el resto del producto.
  assert.equal(Number(agotado.datos.precio_venta), 6000);
  assert.equal(agotado.datos.nombre_sabor, "Pixel Agotado");

  // Editar el precio no borra el inventario que el obrador tenía contado.
  await llamar("PUT", "/api/productos/" + id, { cantidad_disponible: 8 }, tokAdmin);
  const soloPrecio = await llamar("PUT", "/api/productos/" + id, { precio_venta: 6500 }, tokAdmin);
  assert.equal(soloPrecio.datos.cantidad_disponible, 8);
  assert.equal(Number(soloPrecio.datos.precio_venta), 6500);

  // Volver a disponible es quitar el control de inventario, no inventar un número.
  assert.equal((await llamar("PUT", "/api/productos/" + id, { cantidad_disponible: null }, tokAdmin)).datos.cantidad_disponible, null);

  assert.equal((await llamar("PUT", "/api/productos/" + id, { cantidad_disponible: -1 }, tokAdmin)).estado, 400);
  assert.equal((await llamar("PUT", "/api/productos/" + id, { cantidad_disponible: 2.5 }, tokAdmin)).estado, 400);
  assert.equal((await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Malo", precio_venta: 6000, cantidad_disponible: "muchas" }, tokAdmin)).estado, 400);
  // Marcar el inventario es del admin, como el resto del catálogo.
  assert.equal((await llamar("PUT", "/api/productos/" + id, { cantidad_disponible: 0 }, tokCliente)).estado, 403);
});

// ---------- Medición propia del sitio ----------

test("Medición: los eventos del sitio se registran sin cuenta y con validación", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Medido", precio_venta: 6000 }, tokAdmin);
  const idProducto = creado.datos.id;

  assert.equal((await llamar("POST", "/api/eventos", { evento: "sabor_visto", producto_id: idProducto })).estado, 201);
  assert.equal((await llamar("POST", "/api/eventos", { evento: "carrito_agregar", producto_id: idProducto, cantidad: 2 })).estado, 201);
  assert.equal((await llamar("POST", "/api/eventos", { evento: "checkout_iniciado" })).estado, 201);

  // Un evento inventado no entra: la lista blanca no es decorativa.
  assert.equal((await llamar("POST", "/api/eventos", { evento: "espiar_cliente" })).estado, 400);
  assert.equal((await llamar("POST", "/api/eventos", {})).estado, 400);
  // Un sabor que no existe no tumba la medición: se registra sin el sabor (la
  // llave ajena no puede hacer fallar el INSERT).
  assert.equal((await llamar("POST", "/api/eventos", { evento: "sabor_visto", producto_id: 99999 })).estado, 201);
});

test("Medición: el resumen del embudo es del admin y une el carrito con los pedidos confirmados", async () => {
  assert.equal((await llamar("GET", "/api/eventos/resumen")).estado, 401);
  assert.equal((await llamar("GET", "/api/eventos/resumen", null, tokCliente)).estado, 403);

  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Embudo", precio_venta: 6000 }, tokAdmin);
  const idProducto = creado.datos.id;

  // Visita que sí compra: ve el sabor, lo agrega, empieza el pedido y confirma.
  const compra = "visitaAAAA0001";
  await llamar("POST", "/api/eventos", { evento: "sabor_visto", producto_id: idProducto, visita: compra });
  await llamar("POST", "/api/eventos", { evento: "carrito_agregar", producto_id: idProducto, visita: compra });
  await llamar("POST", "/api/eventos", { evento: "checkout_iniciado", visita: compra });
  const pedido = await llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono: "3001112233", visita: compra,
    items: [{ producto_id: idProducto, cantidad: 2 }],
  });
  assert.equal(pedido.estado, 201);
  assert.equal(pedido.datos.visita, compra, "el pedido guarda la visita que lo cerró");

  // Visita que se queda a medias: agrega al carrito y no confirma nunca.
  const abandona = "visitaBBBB0002";
  await llamar("POST", "/api/eventos", { evento: "sabor_visto", producto_id: idProducto, visita: abandona });
  await llamar("POST", "/api/eventos", { evento: "carrito_agregar", producto_id: idProducto, visita: abandona });

  const { estado, datos } = await llamar("GET", "/api/eventos/resumen", null, tokAdmin);
  assert.equal(estado, 200);
  assert.equal(datos.dias, 30);
  assert.equal(datos.embudo.visitas_que_agregaron, 2, "dos visitas distintas agregaron al carrito");
  assert.equal(datos.embudo.visitas_que_empezaron_pedido, 1);
  assert.equal(datos.embudo.visitas_que_confirmaron, 1, "solo una cerró el pedido");
  assert.equal(datos.embudo.abandono, 50, "una de las dos visitas se quedó a medias");

  const medido = datos.sabores.find((s) => s.producto_id === idProducto);
  assert.equal(medido.nombre, "Pixel Embudo");
  assert.equal(medido.vistos, 2);
  assert.equal(medido.agregados, 2);
  assert.ok(datos.pedidos.cantidad >= 2);
  // La ventana se puede pedir más corta o más larga, con un tope razonable.
  assert.equal((await llamar("GET", "/api/eventos/resumen?dias=7", null, tokAdmin)).datos.dias, 7);
  assert.equal((await llamar("GET", "/api/eventos/resumen?dias=9999", null, tokAdmin)).datos.dias, 365);
});

// ---------- Estado del pedido (consulta pública) ----------

test("Estado: se consulta con número y teléfono, sin cuenta, y sin exponer a otros", async () => {
  const creado = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Estado", precio_venta: 6000 }, tokAdmin);
  const pedido = await llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono: "3137839935", direccion: "Ceiba 2", notas: "Sorpresita",
    items: [{ producto_id: creado.datos.id, cantidad: 2 }],
  });
  assert.equal(pedido.estado, 201);
  const id = pedido.datos.id;

  // Sin sesión: la consulta es pública (POST: el teléfono viaja en el cuerpo,
  // nunca en la URL, para no dejarlo en historiales ni registros).
  const bien = await llamar("POST", "/api/pedidos/estado", { id, telefono: "3137839935" });
  assert.equal(bien.estado, 200);
  assert.equal(bien.datos.estado, "pendiente");
  assert.equal(bien.datos.total, 12000);
  assert.deepEqual(bien.datos.detalles.map((d) => `${d.cantidad} × ${d.nombre_sabor}`), ["2 × Pixel Estado"]);
  // Nada que espiar: ni el nombre, ni la dirección, ni las notas, ni el
  // teléfono. Sí cómo se entrega (y cuánto costó el envío), que es del pedido.
  assert.deepEqual(Object.keys(bien.datos).sort(),
    ["creado_en", "descuento", "detalles", "entrega", "envio", "estado", "id", "total"]);

  // El mismo teléfono escrito de otra forma sirve igual (+57, espacios, guiones).
  const otroFormato = await llamar("POST", "/api/pedidos/estado", { id, telefono: "+57 313 783 9935" });
  assert.equal(otroFormato.estado, 200);
  assert.equal((await llamar("POST", "/api/pedidos/estado", { id, telefono: "313-783-9935" })).estado, 200);

  // Teléfono equivocado, pedido inexistente y parámetros malos: no se filtra nada.
  assert.equal((await llamar("POST", "/api/pedidos/estado", { id, telefono: "3009998877" })).estado, 404);
  assert.equal((await llamar("POST", "/api/pedidos/estado", { id: 999999, telefono: "3137839935" })).estado, 404);
  assert.equal((await llamar("POST", "/api/pedidos/estado", { telefono: "3137839935" })).estado, 400);
  assert.equal((await llamar("POST", "/api/pedidos/estado", { id })).estado, 400);
  assert.equal((await llamar("POST", "/api/pedidos/estado", { id, telefono: "abc" })).estado, 400);
  // La forma vieja por GET ya no consulta nada: el teléfono no puede volver a
  // la URL por ningún camino.
  assert.notEqual((await llamar("GET", `/api/pedidos/estado?id=${id}&telefono=3137839935`)).estado, 200);
  // El detalle completo (nombre, dirección, notas) sigue siendo solo del admin.
  assert.equal((await llamar("GET", `/api/pedidos/${id}`)).estado, 401);
  assert.equal((await llamar("GET", `/api/pedidos/${id}`, null, tokAdmin)).estado, 200);
});

test("Pedido: producto_id tiene que ser un entero positivo (400)", async () => {
  const { datos: producto } = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Id", precio_venta: 6000 }, tokAdmin);
  const pedir = (producto_id) => llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono: "3001112233", items: [{ producto_id, cantidad: 1 }],
  });
  for (const malo of [0, -1, 1.5, "abc", "1e2", " 1", "", null, true, [producto.id], { id: producto.id }]) {
    const r = await pedir(malo);
    assert.equal(r.estado, 400, `producto_id ${JSON.stringify(malo)}`);
    assert.match(r.datos.error, /entero positivo/);
  }
  assert.equal((await pedir(producto.id)).estado, 201);
  assert.equal((await pedir(String(producto.id))).estado, 201, "un id numérico como texto sigue valiendo");
});

test("Registro: el correo no pasa de 150 caracteres, el tope de la columna", async () => {
  const conLargo = (largo) => "a".repeat(largo - "@x.com".length) + "@x.com";
  const registrar = (correo) => llamar("POST", "/api/usuarios/registro", { nombre: "Largo", correo, contrasena: "secreto1" });
  const largo = await registrar(conLargo(151));
  assert.equal(largo.estado, 400);
  assert.match(largo.datos.error, /150 caracteres/);
  assert.equal((await registrar(conLargo(150))).estado, 201);
});

test("Teléfono: exige de 7 a 15 dígitos de verdad al pedir y al consultar", async () => {
  const { datos: producto } = await llamar("POST", "/api/productos", { nombre_sabor: "Pixel Tel", precio_venta: 6000 }, tokAdmin);
  const pedir = (cliente_telefono) => llamar("POST", "/api/pedidos", {
    cliente_nombre: "Ana", cliente_telefono, items: [{ producto_id: producto.id, cantidad: 1 }],
  });
  const consultar = (telefono) => llamar("POST", "/api/pedidos/estado", { id: 1, telefono });
  for (const malo of ["+-+-+-+", "123456", "12 34 56", "1234567890123456"]) {
    assert.equal((await pedir(malo)).estado, 400, `pedir con ${malo}`);
    assert.equal((await consultar(malo)).estado, 400, `consultar con ${malo}`);
  }
  for (const bueno of ["1234567", "123456789012345", "+57 300 111-2233"]) {
    assert.equal((await pedir(bueno)).estado, 201, `pedir con ${bueno}`);
    assert.notEqual((await consultar(bueno)).estado, 400, `consultar con ${bueno}`);
  }
});
