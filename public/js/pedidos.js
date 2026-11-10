import { ApiClient, Sesion } from "./api.js";
import { CONTACTO, urlWhatsApp } from "./config.js";
import { idVisita } from "./analitica.js";
import { escucharGlobal } from "./registro-global.js";
import { sonar, efectoDeNivel } from "./sonidos.js";

// Etiquetas legibles de los estados del pedido.
export const ESTADOS = {
  pendiente: "Pendiente",
  en_preparacion: "En preparación",
  listo: "Listo para entregar",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const pesos = (n) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// Descuentos por volumen: la misma escalera que aplica el servidor al guardar
// el pedido (src/config/descuentos.js). Aquí es solo para calcular el total en
// vivo; hay una prueba que compara las dos listas para que no se separen.
// Cuentan las galletas TOTALES del pedido, no las de cada sabor.
export const DESCUENTOS = [
  { desde: 12, porcentaje: 5 },
  { desde: 24, porcentaje: 8 },
  { desde: 48, porcentaje: 10 },
];

// Combos Pixel Special Edition: la MISMA regla que el servidor
// (src/config/descuentos.js y detectarCombo en pedidoController.js). El combo
// se cobra a precio fijo solo cuando las galletas del carrito coinciden
// exactamente con uno; prueba de paridad en tests.
export const NOMBRE_SPECIAL = "Pixel Special Edition";
export const COMBOS = [
  { nombre: "Combo Pixel x1", especiales: 1, normales: 2, precio: 22000 },
  { nombre: "Combo Pixel x2", especiales: 2, normales: 2, precio: 31000 },
  { nombre: "Combo Pixel x3", especiales: 3, normales: 3, precio: 46000 },
];

// items: [{ nombre, precio, cantidad }]. Devuelve el combo que aplica o null.
export function comboDe(items) {
  const numEspeciales = items.filter((i) => i.nombre === NOMBRE_SPECIAL).reduce((s, i) => s + i.cantidad, 0);
  const numNormales = items.filter((i) => i.nombre !== NOMBRE_SPECIAL).reduce((s, i) => s + i.cantidad, 0);
  if (numEspeciales === 0) return null;
  // Mejor combo para el conjunto: el de mayor precio que cabe exactamente.
  let mejor = null;
  for (const combo of COMBOS) {
    if (numEspeciales % combo.especiales !== 0) continue;
    const veces = numEspeciales / combo.especiales;
    if (numNormales !== veces * combo.normales) continue;
    if (!mejor || combo.precio > mejor.combo.precio) mejor = { combo, veces };
  }
  if (!mejor) return null;
  return { nombre: mejor.combo.nombre, veces: mejor.veces, precio: mejor.veces * mejor.combo.precio };
}

// Si hay Special sueltas y faltan galletas normales para cerrar un combo exacto,
// devuelve cuántas faltan. Solo sugiere combos que se cierran agregando normales.
export function sugerirCombo(items) {
  const numEspeciales = items.filter((i) => i.nombre === NOMBRE_SPECIAL).reduce((s, i) => s + i.cantidad, 0);
  const numNormales = items.filter((i) => i.nombre !== NOMBRE_SPECIAL).reduce((s, i) => s + i.cantidad, 0);
  if (numEspeciales === 0) return null;
  let mejor = null;
  for (const combo of COMBOS) {
    if (numEspeciales % combo.especiales !== 0) continue;
    const faltan = (numEspeciales / combo.especiales) * combo.normales - numNormales;
    if (faltan <= 0) continue;
    if (!mejor || faltan < mejor.faltan) mejor = { nombre: combo.nombre, precio: combo.precio, faltan };
  }
  return mejor;
}

// Formas de entrega: la MISMA tabla que aplica el servidor al guardar el
// pedido (src/config/envio.js). El navegador la usa para mostrar el total antes
// de pedir; el que se guarda siempre lo calcula el servidor. Hay una prueba que
// compara las dos listas para que no se separen con el tiempo.
//
//   recoger    → recoger en Ceiba 2, gratis siempre
//   cucuta     → domicilio en Cúcuta, $5.000
//   municipios → Villa del Rosario, Los Patios o El Zulia, $7.000
// Y desde 12 galletas el domicilio sale gratis, en cualquier zona.
export const ENTREGAS = {
  recoger: { nombre: "Recoger en Ceiba 2", corto: "Recoges en el obrador", costo: 0 },
  cucuta: { nombre: "Domicilio en Cúcuta", corto: "Domicilio en Cúcuta", costo: 5000 },
  municipios: {
    nombre: "Domicilio en Villa del Rosario, Los Patios o El Zulia",
    corto: "Domicilio en Villa del Rosario, Los Patios o El Zulia",
    costo: 7000,
  },
};
export const ENVIO_GRATIS_DESDE = 12;

// Cargo por distancia del domicilio: la MISMA tabla que src/config/distancia.js.
// El cliente elige el rango en el formulario; el servidor vuelve a validarlo.
export const RANGOS_DISTANCIA = {
  "0-3": 2000,
  "3-6": 4000,
  "6+": 6000,
};

// Costo del envío de un pedido de `unidades` galletas con la forma de entrega
// `entrega`. Devuelve null si la forma de entrega no existe (igual que el
// servidor: nunca se adivina una zona).
export function envioDe(unidades, entrega) {
  const zona = ENTREGAS[entrega];
  if (!zona) return null;
  if (unidades >= ENVIO_GRATIS_DESDE) return 0;
  return zona.costo;
}

// Tramo que le toca a una cantidad de galletas, y el siguiente (para poder
// decir cuánto falta).
export function tramoDescuento(unidades) {
  let actual = null;
  let siguiente = null;
  for (const tramo of DESCUENTOS) {
    if (unidades >= tramo.desde) actual = tramo;
    else { siguiente = tramo; break; }
  }
  return { actual, siguiente };
}

// Descuento de un carrito: porcentaje aplicado, lo que se ahorra y el tramo
// siguiente. El redondeo es el mismo que hace el servidor (Math.round), así
// que el total que ve el cliente es exactamente el que se guarda.
export function descuentoPara(unidades, subtotal) {
  const { actual, siguiente } = tramoDescuento(unidades);
  const porcentaje = actual ? actual.porcentaje : 0;
  return { porcentaje, valor: Math.round((subtotal * porcentaje) / 100), siguiente };
}

// Barra de poder del carrito: la escalera de descuentos dibujada como niveles.
// Se llena con las galletas que cuentan para el descuento (un combo tiene precio
// fijo, así que no la llena) y una meta solo se enciende cuando el descuento se
// aplica de verdad: nunca promete un ahorro que el total no trae.
export function progresoPoder(sueltas) {
  const tope = DESCUENTOS[DESCUENTOS.length - 1].desde;
  const { actual, siguiente } = tramoDescuento(sueltas);
  const logrados = DESCUENTOS.filter((t) => sueltas >= t.desde).length;
  return {
    nivel: logrados === DESCUENTOS.length ? "MAX" : String(logrados + 1),
    porcentaje: actual ? actual.porcentaje : 0,
    siguiente,
    faltan: siguiente ? siguiente.desde - sueltas : 0,
    llenado: Math.min(sueltas / tope, 1),
    metas: DESCUENTOS.map((t) => ({ ...t, posicion: t.desde / tope, logrado: sueltas >= t.desde })),
  };
}

// Lo que el cliente se ahorró en un pedido ya guardado: el descuento por volumen
// más la diferencia del combo frente a las mismas galletas sueltas.
export function ahorroDe(pedido) {
  const combo = comboDe(pedido.detalles);
  const sueltas = pedido.detalles.reduce((s, d) => s + d.precio * d.cantidad, 0);
  return (pedido.descuento || 0) + (combo ? Math.max(sueltas - combo.precio, 0) : 0);
}

// Habla con /api/carrito para guardar el carrito en la cuenta del cliente.
// Sin sesión no hace nada: el carrito queda solo en el navegador.
const lineasDeCuenta = (filas) => filas.map((f) => ({
  producto_id: f.producto_id,
  nombre: f.nombre_sabor,
  precio: Number(f.precio_venta),
  disponible: f.cantidad_disponible,
  cantidad: f.cantidad,
}));

export class CarritoServicio {
  constructor(api) { this.api = api; }

  hayCuenta() { return !!Sesion.obtener()?.token; }

  // Devuelve las líneas con la forma que usa Carrito.
  async obtener() {
    return lineasDeCuenta(await this.api.get("/carrito"));
  }

  // El servidor responde con lo que de verdad guardó (ya recortado al
  // inventario): se devuelve con la misma forma para poder adoptarlo.
  async guardar(items) {
    const filas = await this.api.put("/carrito", {
      items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
    });
    return Array.isArray(filas) ? lineasDeCuenta(filas) : null;
  }
}

// Carrito de compras: guarda en el navegador qué quiere comprar el cliente.
// Se persiste en localStorage para que no se pierda si recargan la página.
export class Carrito {
  static CLAVE = "pixel_galletas_carrito";
  static CLAVE_UNION = "pixel_galletas_carrito_union";
  // Marca que hay cambios en el navegador que la cuenta todavía no confirmó.
  static CLAVE_PENDIENTE = "pixel_galletas_carrito_pendiente";

  #temporizador = null;
  #version = 0; // sube con cada cambio: una respuesta vieja no pisa uno nuevo

  // servicioCuenta (opcional) sabe si hay sesión y habla con /api/carrito.
  constructor(servicioCuenta = null) {
    this.servicioCuenta = servicioCuenta;
    this.items = this.#recuperar();
    // Forma de entrega elegida en el formulario. Vive con el carrito porque el
    // total depende de ella, pero no se guarda en el navegador: cada visita
    // empieza con "recoger", que es gratis y no cambia nada por sí solo.
    this.entrega = "recoger";
    // Cargo por distancia de la dirección escrita, que consulta la vista.
    this.distancia = 0;
  }

  #recuperar() {
    try {
      const datos = JSON.parse(localStorage.getItem(Carrito.CLAVE));
      // Una línea en 0 (de versiones anteriores) bloquearía el pedido entero.
      return Array.isArray(datos) ? datos.filter((i) => i && i.cantidad >= 1) : [];
    } catch {
      return [];
    }
  }

  #guardar() {
    try {
      localStorage.setItem(Carrito.CLAVE, JSON.stringify(this.items));
    } catch {
      /* sin localStorage el carrito solo vive en memoria */
    }
    this.#version += 1;
    if (this.servicioCuenta?.hayCuenta() || Sesion.vencio()) this.#marcarPendiente();
    this.#programarEnvio();
    window.dispatchEvent(new Event("carrito-cambio"));
  }

  #marcarPendiente() {
    try { localStorage.setItem(Carrito.CLAVE_PENDIENTE, "1"); } catch { /* modo privado */ }
  }

  #olvidarPendiente() {
    try { localStorage.removeItem(Carrito.CLAVE_PENDIENTE); } catch { /* modo privado */ }
  }

  // Con sesión, el carrito también se guarda en la cuenta. Se agrupan los cambios
  // seguidos en una sola petición para no enviar una por cada clic.
  #programarEnvio() {
    if (!this.servicioCuenta?.hayCuenta()) return;
    clearTimeout(this.#temporizador);
    this.#temporizador = setTimeout(() => this.#enviar(), 400);
  }

  async #enviar() {
    if (!this.servicioCuenta?.hayCuenta()) return;
    const version = this.#version;
    try {
      await this.servicioCuenta.guardar(this.items);
      if (version === this.#version) this.#olvidarPendiente();
    } catch {
      /* sin conexión: el carrito local sigue guardado, queda marcado como
         pendiente y se reintenta en el próximo cambio o en la próxima carga */
    }
  }

  // Al iniciar sesión: se une el carrito local con el de la cuenta. Las cantidades
  // se suman por sabor y el servidor recorta al inventario disponible.
  async unirConCuenta() {
    if (!this.servicioCuenta?.hayCuenta()) {
      // Si la sesión venció, el cliente no pidió salir: su carrito se queda.
      if (Sesion.vencio()) return;
      // Al cerrar sesión, el carrito que era de la cuenta sale del navegador:
      // si no, el siguiente cliente que entre lo heredaría.
      if (localStorage.getItem(Carrito.CLAVE_UNION) !== null) {
        this.items = [];
        localStorage.removeItem(Carrito.CLAVE_UNION);
        this.#olvidarPendiente();
        try { localStorage.setItem(Carrito.CLAVE, "[]"); } catch { /* modo privado */ }
        window.dispatchEvent(new Event("carrito-cambio"));
      }
      return;
    }
    try {
      const idCuenta = String(Sesion.obtener()?.usuario?.id);
      const delServidor = await this.servicioCuenta.obtener();
      // Solo se suma la primera vez que esta cuenta entra en este navegador.
      // Después el servidor manda: sumar en cada carga duplicaba el carrito.
      // Excepto si quedaron cambios sin confirmar (falló el guardado, se cerró
      // la página o venció la sesión): ahí manda lo que el cliente ve aquí.
      const cuentaPrevia = localStorage.getItem(Carrito.CLAVE_UNION);
      const yaUnida = cuentaPrevia === idCuenta;
      // Lo guardado era de otra cuenta (su sesión venció sin cerrarla): no se hereda.
      if (cuentaPrevia !== null && !yaUnida) this.items = [];
      const pendiente = localStorage.getItem(Carrito.CLAVE_PENDIENTE) !== null;
      if (yaUnida && !pendiente) {
        this.items = delServidor;
      } else {
        if (!yaUnida) {
          const union = new Map();
          for (const item of [...delServidor, ...this.items]) {
            const previo = union.get(item.producto_id);
            if (previo) previo.cantidad += item.cantidad;
            else union.set(item.producto_id, { ...item });
          }
          this.items = [...union.values()];
        }
        try {
          localStorage.setItem(Carrito.CLAVE_UNION, idCuenta);
        } catch { /* modo privado: se volverá a unir en la próxima carga */ }
        // Si este guardado falla, la marca evita que la próxima carga lo pierda.
        this.#marcarPendiente();
        const version = this.#version;
        const antes = this.cantidadTotal;
        const confirmadas = await this.servicioCuenta.guardar(this.items);
        if (version === this.#version) {
          // El servidor recorta al inventario: se muestra lo que aceptó.
          if (Array.isArray(confirmadas)) this.items = confirmadas;
          this.#olvidarPendiente();
          if (this.cantidadTotal < antes) window.dispatchEvent(new Event("carrito-recortado"));
        }
      }
      Sesion.olvidarVencida();
      try {
        localStorage.setItem(Carrito.CLAVE, JSON.stringify(this.items));
      } catch { /* modo privado: solo en memoria */ }
      window.dispatchEvent(new Event("carrito-cambio"));
    } catch {
      /* sin conexión se queda el carrito local */
    }
  }

  // Tope de una línea: el límite de la API (100) y, si el sabor lleva control
  // de inventario, lo que quede disponible. Las líneas guardadas antes de que
  // existiera el inventario no traen el dato y se quedan con el tope de 100.
  #tope(item) {
    return item.disponible === null || item.disponible === undefined
      ? 100
      : Math.min(100, item.disponible);
  }

  // producto: { id, nombre, precio, cantidadDisponible }
  // Devuelve false cuando no se pudo agregar (agotado o ya está el tope), para
  // que la vista se lo pueda decir al cliente en el momento.
  agregar(producto) {
    const disponible = producto.cantidadDisponible ?? null;
    const existente = this.items.find((i) => i.producto_id === producto.id);
    if (disponible === 0) { // agotado: no entra, y si ya estaba, sale
      if (existente) this.quitar(producto.id);
      return false;
    }
    if (!existente) {
      this.items.push({
        producto_id: producto.id, nombre: producto.nombre, precio: producto.precio, disponible, cantidad: 1,
      });
      this.#guardar();
      return true;
    }
    existente.disponible = disponible; // el catálogo manda sobre lo guardado
    const tope = this.#tope(existente);
    // Si el obrador bajó las unidades por debajo de lo que ya había en el
    // carrito (o el sabor se agotó en otro teléfono), la línea se recorta aquí:
    // mejor que el cliente lo vea ahora y no al confirmar el pedido.
    if (existente.cantidad > tope) existente.cantidad = tope;
    if (existente.cantidad >= tope) {
      this.#guardar();
      return false;
    }
    existente.cantidad += 1;
    this.#guardar();
    return true;
  }

  cambiarCantidad(id, cantidad) {
    const item = this.items.find((i) => i.producto_id === id);
    if (!item) return;
    if (cantidad < 1) return this.quitar(id);
    // Al bajar la cantidad tampoco se sube del tope disponible. Si el tope es
    // 0 (se agotó), la línea sale: en 0 el servidor rechazaría todo el pedido.
    const tope = this.#tope(item);
    if (tope < 1) return this.quitar(id);
    item.cantidad = Math.min(tope, cantidad);
    this.#guardar();
  }

  // Cuántas unidades más de un producto caben, con lo que ya hay en el carrito.
  cuantasCaben(producto) {
    const disponible = producto.cantidadDisponible ?? null;
    const tope = disponible === null ? 100 : Math.min(100, disponible);
    const yaLleva = this.items.find((i) => i.producto_id === producto.id)?.cantidad ?? 0;
    return Math.max(0, tope - yaLleva);
  }

  // lineas: [{ producto, cantidad }]. Devuelve la primera que no cabe, o null.
  // Un combo entra entero o no entra: a medias se cobraría por galleta.
  faltaPara(lineas) {
    for (const { producto, cantidad } of lineas) {
      const caben = this.cuantasCaben(producto);
      if (cantidad > caben) return { nombre: producto.nombre, caben };
    }
    return null;
  }

  // Pone las líneas guardadas al día con el catálogo actual: nombre, precio y
  // existencias, y saca lo agotado o retirado. Devuelve los cambios en frases
  // para contárselos al cliente. Un catálogo vacío no se considera respuesta
  // válida: un fallo del servidor no debe vaciar ningún carrito.
  reconciliar(catalogo) {
    if (!Array.isArray(catalogo) || !catalogo.length) return [];
    const porId = new Map(catalogo.map((p) => [p.id, p]));
    const cambios = [];
    const lineas = [];
    let tocado = false;
    for (const item of this.items) {
      const p = porId.get(item.producto_id);
      if (!p) {
        cambios.push(`${item.nombre} ya no está en el catálogo y salió de tu carrito.`);
        tocado = true;
        continue;
      }
      const disponible = p.cantidadDisponible ?? null;
      if (disponible === 0) {
        cambios.push(`${p.nombre} se agotó y salió de tu carrito.`);
        tocado = true;
        continue;
      }
      if (item.nombre !== p.nombre) cambios.push(`${item.nombre} ahora se llama ${p.nombre}.`);
      if (item.precio !== p.precio) cambios.push(`${p.nombre} ahora cuesta ${pesos(p.precio)} (antes ${pesos(item.precio)}).`);
      const linea = { ...item, nombre: p.nombre, precio: p.precio, disponible };
      const tope = this.#tope(linea);
      if (linea.cantidad > tope) {
        linea.cantidad = tope;
        cambios.push(`De ${p.nombre} solo quedan ${tope}: ajustamos tu carrito.`);
      }
      if (["nombre", "precio", "disponible", "cantidad"].some((c) => linea[c] !== item[c])) tocado = true;
      lineas.push(linea);
    }
    if (tocado) {
      this.items = lineas;
      this.#guardar();
    }
    return cambios;
  }

  quitar(id) {
    this.items = this.items.filter((i) => i.producto_id !== id);
    this.#guardar();
  }

  vaciar() {
    this.items = [];
    this.#guardar();
  }

  get cantidadTotal() {
    return this.items.reduce((suma, i) => suma + i.cantidad, 0);
  }

  // Precio de las galletas por sabor, sin combo ni descuento.
  get subtotalSinCombo() {
    return this.items.reduce((suma, i) => suma + i.precio * i.cantidad, 0);
  }

  // Combo que reconoce el carrito (igual que el servidor), o null.
  get combo() {
    return comboDe(this.items);
  }

  // Galletas que entran al descuento por volumen: un combo no descuenta.
  get cantidadSueltas() {
    return this.combo ? 0 : this.cantidadTotal;
  }

  get subtotal() {
    return this.combo ? this.combo.precio : this.subtotalSinCombo;
  }

  // Descuento por volumen que le toca al carrito ahora mismo.
  get descuento() {
    return descuentoPara(this.cantidadSueltas, this.combo ? 0 : this.subtotalSinCombo);
  }

  // Costo del domicilio según la zona elegida y lo que hay en el carrito.
  // Con domicilio y sin galletas gratis se suma el cargo por distancia que
  // calculó el servidor para la dirección escrita (0 hasta que la consulte).
  get envio() {
    const zona = envioDe(this.cantidadTotal, this.entrega) ?? 0;
    return zona > 0 ? zona + this.distancia : 0;
  }

  // Lo que se paga de verdad: subtotal menos el descuento por volumen y más el
  // envío. Es el mismo cálculo que hace el servidor al guardar el pedido.
  get total() {
    return this.subtotal - this.descuento.valor + this.envio;
  }

  // Formato que espera la API: [{ producto_id, cantidad }]
  paraApi() {
    return this.items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad }));
  }
}

// Modelo: un pedido recibido de la API.
export class Pedido {
  constructor({ id, cliente_nombre, cliente_telefono, direccion, entrega, envio, notas, total, descuento, estado, creado_en, detalles }) {
    this.id = id;
    this.clienteNombre = cliente_nombre;
    this.clienteTelefono = cliente_telefono;
    this.direccion = direccion;
    // Cómo llega el pedido y cuánto costó el envío (lo calculó el servidor).
    this.entrega = entrega || "recoger";
    this.envio = Number(envio) || 0;
    this.notas = notas;
    this.total = Number(total);
    this.descuento = Number(descuento) || 0;
    this.estado = estado;
    this.creadoEn = creado_en;
    this.detalles = (detalles || []).map((d) => ({
      nombre: d.nombre_sabor,
      precio: Number(d.precio_unitario),
      cantidad: d.cantidad,
    }));
  }
  get estadoTexto() { return ESTADOS[this.estado] || this.estado; }
  get fecha() { return new Date(this.creadoEn).toLocaleString("es-CO"); }
  get resumen() {
    return this.detalles.map((d) => `${d.cantidad} × ${d.nombre}`).join(", ");
  }
}

// Servicio: pedidos contra la API.
export class PedidoServicio {
  constructor(api) { this.api = api; }
  crear(datos) { return this.api.post("/pedidos", datos); }
  listar() { return this.api.get("/pedidos"); }
  cambiarEstado(id, estado) { return this.api.put(`/pedidos/${id}/estado`, { estado }); }
}

// Texto del pedido para enviarlo por WhatsApp.
export function textoPedido(pedido) {
  const lineas = [
    `*¡Nuevo pedido Pixel Galletas!* #${pedido.id}`,
    "",
    `*Cliente:* ${pedido.clienteNombre}`,
    `*Teléfono:* ${pedido.clienteTelefono}`,
  ];
  if (pedido.direccion) lineas.push(`*Dirección:* ${pedido.direccion}`);
  // Cómo se entrega y cuánto costó el envío: el obrador necesita saber si el
  // pedido va a la calle o lo vienen a buscar.
  const zona = ENTREGAS[pedido.entrega];
  if (zona) lineas.push(`*Entrega:* ${zona.nombre} — ${pedido.envio > 0 ? pesos(pedido.envio) : "gratis"}`);
  lineas.push("", "*Pedido:*");
  // Un combo se cobra a precio fijo: se nombra con su precio y las galletas van
  // sin precio, porque sumadas por separado no darían el total real.
  const combo = comboDe(pedido.detalles);
  if (combo) lineas.push(`*${combo.veces > 1 ? `${combo.veces} × ` : ""}${combo.nombre}:* ${pesos(combo.precio)}`);
  for (const d of pedido.detalles) {
    lineas.push(combo ? `• ${d.cantidad} × ${d.nombre}` : `• ${d.cantidad} × ${d.nombre} — ${pesos(d.precio * d.cantidad)}`);
  }
  // El descuento por volumen se enseña solo cuando existe, y se enseña el
  // subtotal para que el total no parezca un número salido de la nada.
  if (pedido.descuento > 0) {
    lineas.push("", `*Subtotal:* ${pesos(pedido.total + pedido.descuento)}`);
    lineas.push(`*Descuento por volumen:* −${pesos(pedido.descuento)}`);
  }
  lineas.push("", `*Total:* ${pesos(pedido.total)}`);
  if (pedido.notas) lineas.push(`*Notas:* ${pedido.notas}`);
  lineas.push("", "_Enviado desde la web de Pixel Galletas_");
  return lineas.join("\n");
}

// Vista del cliente: carrito, formulario de pedido y confirmación con WhatsApp.
// Envuelve una acción asíncrona para que no pueda correr dos veces a la vez:
// mientras la primera no termine, las demás llamadas se ignoran. Sin esto, un
// doble toque en "Hacer pedido" con mala señal crea dos pedidos reales.
export function unaSolaVez(accion, alCambiar = () => {}) {
  let enCurso = false;
  return async (...args) => {
    if (enCurso) return undefined;
    enCurso = true;
    alCambiar(true);
    try {
      return await accion(...args);
    } finally {
      enCurso = false;
      alCambiar(false);
    }
  };
}

// Lo que vive fuera de <main> (contador del menú y chip flotante): existe en
// cualquier página que conserve la cabecera, tenga o no el formulario de pedido.
function pintarBarraCarrito(carrito) {
  const contador = document.getElementById("carrito-contador");
  if (contador) contador.textContent = carrito.cantidadTotal;
  const mini = document.getElementById("mini-carrito");
  if (!mini) return;
  const unidades = carrito.cantidadTotal;
  document.getElementById("mini-carrito-resumen").textContent =
    `${unidades} ${unidades === 1 ? "galleta" : "galletas"} · ${pesos(carrito.total)}`;
  mini.classList.toggle("activo", carrito.items.length > 0);
  if (!document.getElementById("pedido")) mini.classList.remove("en-pedido");
}

class PedidoVista {
  constructor(servicio, carrito) {
    this.servicio = servicio;
    this.carrito = carrito;
    this.$ = (id) => document.getElementById(id);
    this.enviando = false;
    this.crearPedido = unaSolaVez(
      (datos, formulario) => this.#crearPedido(datos, formulario),
      (enCurso) => {
        this.enviando = enCurso;
        this.$("btn-pedir").textContent = enCurso ? "Enviando…" : "Hacer pedido";
        this.$("btn-pedir").disabled = enCurso || this.carrito.items.length === 0;
      }
    );
    this.$("form-pedido").addEventListener("submit", (e) => this.enviar(e));
    // La forma de entrega cambia el total (el domicilio cuesta según la zona y
    // sale gratis desde 12 galletas): al elegirla se vuelve a pintar el carrito
    // para que el cliente vea el precio real antes de confirmar.
    this.$("form-pedido").addEventListener("change", (e) => {
      if (e.target?.name === "distancia") {
        this.carrito.distancia = RANGOS_DISTANCIA[e.target.value] ?? 0;
        this.pintarCarrito();
        return;
      }
      if (e.target?.name !== "entrega") return;
      this.carrito.entrega = e.target.value;
      this.pintarCarrito();
    });
    this.$("btn-vaciar-carrito").addEventListener("click", () => this.carrito.vaciar());
    this.$("lista-carrito").addEventListener("click", (e) => this.accionesCarrito(e));
    // Dentro de la sección de pedido el chip sobra y taparía "Vaciar carrito".
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => {
        this.$("mini-carrito")?.classList.toggle("en-pedido", e.isIntersecting);
      }).observe(this.$("pedido"));
    }
    // El carrito responde si pudo agregar: cuando el sabor está agotado o ya se
    // llevó todas las unidades disponibles, el cliente se entera al instante en
    // vez de descubrirlo al confirmar el pedido.
    escucharGlobal("pedidos:agregar-al-carrito", "agregar-al-carrito", (e) => {
      if (this.carrito.agregar(e.detail)) { sonar("moneda"); return; }
      if (this.carrito.items.find((i) => i.producto_id === e.detail?.id)?.cantidad >= 100) {
        this.#avisarTopeSabor(e.detail?.nombre);
        return;
      }
      this.mensaje(
        e.detail?.cantidadDisponible === 0
          ? `${e.detail?.nombre} está agotado por ahora.`
          : `Ya llevas todas las unidades disponibles de ${e.detail?.nombre}.`
      );
    });
    escucharGlobal("pedidos:prefill-sesion", "sesion-cambio", () => this.prefill());
    this.prefill();
    this.pintarCarrito();
  }

  // 100 es el tope por sabor del carrito: más que un error, es un pedido grande.
  #avisarTopeSabor(nombre) {
    this.mensaje(`Llegaste a 100 de ${nombre}, el máximo por sabor en el carrito. `);
    const enlace = document.createElement("a");
    enlace.href = "#pedidos-grandes";
    enlace.textContent = "Cotiza un pedido grande";
    this.$("mensaje-pedido").append(enlace);
  }

  mensaje(texto, esError = true) {
    const p = this.$("mensaje-pedido");
    p.textContent = texto;
    p.classList.toggle("ok", !esError);
  }

  // Si hay sesión iniciada, rellena nombre y teléfono del formulario.
  prefill() {
    const u = Sesion.obtener()?.usuario;
    if (u && this.$("pedido-nombre")) {
      if (!this.$("pedido-nombre").value) this.$("pedido-nombre").value = u.nombre;
      if (u.correo && !this.$("pedido-telefono").value) this.$("pedido-telefono").placeholder = "Tu número con WhatsApp";
    }
  }

  // Cambios que encontró el catálogo en lo que el cliente ya tenía guardado.
  avisoCarrito(texto) {
    this.$("aviso-carrito").textContent = texto;
    this.$("aviso-carrito").hidden = !texto;
  }

  pintarCarrito() {
    pintarBarraCarrito(this.carrito);
    const lista = this.$("lista-carrito");
    if (!lista) return; // navegación sin recarga: esta vista ya no está en pantalla
    // Con un carrito nuevo en marcha, la confirmación anterior ya no aplica.
    if (this.carrito.items.length && !this.$("confirmacion").hidden) {
      this.$("confirmacion").hidden = true;
      this.mensaje("");
    }
    lista.replaceChildren();
    for (const item of this.carrito.items) {
      const li = document.createElement("li");
      li.className = "item-carrito";
      const nombre = document.createElement("strong");
      nombre.textContent = item.nombre;
      const precio = document.createElement("span");
      precio.textContent = pesos(item.precio * item.cantidad);
      const controles = document.createElement("div");
      controles.className = "controles";
      const menos = this.#boton("−", `Quitar uno de ${item.nombre}`, item.producto_id, "menos");
      const cantidad = document.createElement("span");
      cantidad.textContent = item.cantidad;
      // Para que un lector de pantalla diga "cantidad" y no un número suelto.
      cantidad.setAttribute("aria-label", `Cantidad: ${item.cantidad}`);
      const mas = this.#boton("+", `Agregar uno de ${item.nombre}`, item.producto_id, "mas");
      const fuera = this.#boton("×", `Quitar ${item.nombre} del carrito`, item.producto_id, "quitar");
      controles.append(menos, cantidad, mas, fuera);
      li.append(nombre, precio, controles);
      // Al llegar al tope disponible, el "+" se apaga y la línea lo dice: no se
      // deja armar un pedido que el servidor va a rechazar.
      if (item.disponible !== null && item.disponible !== undefined && item.cantidad >= item.disponible) {
        mas.disabled = true;
        mas.title = `Solo quedan ${item.disponible} de ${item.nombre}`;
        const quedan = document.createElement("span");
        quedan.className = "quedan";
        quedan.textContent = `quedan ${item.disponible}`;
        li.append(quedan);
      } else if (item.cantidad >= 100) {
        mas.disabled = true;
        mas.title = `100 es el máximo de ${item.nombre} en el carrito`;
        const grande = document.createElement("a");
        grande.className = "quedan";
        grande.href = "#pedidos-grandes";
        grande.textContent = "¿Más de 100? Pedido grande";
        li.append(grande);
      }
      lista.append(li);
    }
    // Desglose del descuento por volumen: solo aparece cuando hay algo que
    // descontar, para no ensuciar el carrito de una o dos galletas.
    const { porcentaje, valor, siguiente } = this.carrito.descuento;
    const hayDescuento = porcentaje > 0;
    const envio = this.carrito.envio;
    const hayEnvio = this.carrito.entrega !== "recoger";
    // El desglose aparece cuando hay algo que explicar: descuento o domicilio.
    this.$("desglose").hidden = !hayDescuento && !hayEnvio;
    this.$("linea-descuento").hidden = !hayDescuento;
    this.$("linea-envio").hidden = !hayEnvio;
    // Los números se escriben siempre, aunque el bloque esté oculto: si alguien
    // baja de 12 galletas, el desglose no puede quedarse con las cuentas del
    // tramo anterior (0%, −$ 0, subtotal real).
    this.$("carrito-subtotal").textContent = pesos(this.carrito.subtotal);
    this.$("descuento-pct").textContent = String(porcentaje);
    this.$("carrito-descuento").textContent = `−${pesos(valor)}`;
    // Si el domicilio salió gratis por la cantidad, se dice en vez de dejar un
    // hueco: "¡Gratis!" es parte de lo que el cliente está comprando.
    this.$("carrito-envio").textContent = envio > 0 ? pesos(envio) : "¡Gratis!";
    // Aviso del tramo siguiente: es lo que empuja a subir la cantidad.
    // Un combo se cobra a precio fijo y no cuenta para el descuento: el aviso
    // de tramo solo habla de las galletas sueltas.
    const combo = this.carrito.combo;
    // Power-up cuando el carrito arma un combo (no al cargar la página con él ya armado).
    if (combo && this.comboPrevio === null) sonar("combo");
    this.comboPrevio = combo ? combo.nombre : null;
    const sueltas = this.carrito.cantidadSueltas;
    const faltan = siguiente ? siguiente.desde - sueltas : 0;
    const aviso = this.$("aviso-descuento");
    if (combo) {
      aviso.hidden = false;
      aviso.textContent = `${combo.nombre} aplicado: precio fijo de ${pesos(combo.precio)}, sin descuento por volumen.`;
    } else {
      const sugerido = sugerirCombo(this.carrito.items);
      aviso.hidden = !this.carrito.items.length || (!sugerido && !faltan);
      if (sugerido) {
        aviso.hidden = false;
        aviso.textContent = `Te faltan ${sugerido.faltan} galleta${sugerido.faltan === 1 ? "" : "s"} normal${sugerido.faltan === 1 ? "" : "es"} para armar el ${sugerido.nombre} a ${pesos(sugerido.precio)}.`;
      } else if (this.$("barra-poder")) {
        aviso.hidden = true; // la barra de poder ya dice cuánto falta para el siguiente descuento
      } else if (!aviso.hidden) {
        aviso.textContent = hayDescuento
          ? `Con ${siguiente.desde} galletas el descuento sube al ${siguiente.porcentaje}%: te faltan ${faltan}.`
          : `Suma ${faltan} galleta${faltan === 1 ? "" : "s"} más y el pedido lleva ${siguiente.porcentaje}% de descuento.`;
      }
    }
    this.$("carrito-total").textContent = pesos(this.carrito.total);
    this.#pintarPoder();
    this.$("vacio").hidden = this.carrito.items.length > 0;
    this.$("btn-pedir").disabled = this.enviando || this.carrito.items.length === 0;
    // Sin galletas no hay nada que vaciar: el botón se apaga en vez de quedarse
    // ahí como una acción muerta al lado del aviso de carrito vacío.
    this.$("btn-vaciar-carrito").disabled = this.carrito.items.length === 0;
  }

  // Barra de poder: se oculta sin galletas y con combo (precio fijo, sin
  // descuento por volumen; el aviso de arriba ya lo explica).
  #nivelPintado = null;
  #pintarPoder() {
    const barra = this.$("barra-poder");
    if (!barra) return;
    const visible = this.carrito.items.length > 0 && !this.carrito.combo;
    barra.hidden = !visible;
    if (!visible) { this.#nivelPintado = null; return; }
    const p = progresoPoder(this.carrito.cantidadSueltas);

    const pista = this.$("poder-pista");
    if (!pista.querySelector(".barra-poder-meta")) {
      for (const meta of p.metas) {
        const marca = document.createElement("span");
        marca.className = "barra-poder-meta";
        marca.dataset.desde = meta.desde;
        marca.style.left = `${meta.posicion * 100}%`;
        const pct = document.createElement("b");
        pct.textContent = `${meta.porcentaje}%`;
        const unidades = document.createElement("small");
        unidades.textContent = meta.desde;
        marca.append(pct, unidades);
        pista.append(marca);
      }
    }
    for (const marca of pista.querySelectorAll(".barra-poder-meta")) {
      marca.classList.toggle("logrado", this.carrito.cantidadSueltas >= Number(marca.dataset.desde));
    }
    this.$("poder-relleno").style.transform = `scaleX(${p.llenado})`;
    const corredor = this.$("poder-pixelito");
    if (corredor) {
      // Pegado al borde del relleno sin salirse de la barra en 0 ni en el tope.
      corredor.style.left = `${p.llenado * 100}%`;
      corredor.style.translate = `${-p.llenado * 100}% 0`;
    }
    pista.setAttribute("aria-valuenow", String(Math.min(this.carrito.cantidadSueltas, p.metas.at(-1).desde)));

    this.$("poder-nivel").textContent = `Nivel ${p.nivel}`;
    this.$("poder-premio").textContent = p.siguiente
      ? `${p.faltan === 1 ? "Falta" : "Faltan"} ${p.faltan} para el ${p.siguiente.porcentaje}%${p.siguiente.desde <= ENVIO_GRATIS_DESDE ? " + envío gratis" : ""}`
      : `${p.porcentaje}% de descuento: ¡nivel máximo!`;
    barra.classList.toggle("max", !p.siguiente);

    // "¡LEVEL UP!" solo cuando el cliente sube de nivel, no al cargar la página.
    const subio = this.#nivelPintado !== null && p.nivel !== this.#nivelPintado && (p.nivel === "MAX" || Number(p.nivel) > Number(this.#nivelPintado));
    this.#nivelPintado = p.nivel;
    if (subio) {
      sonar(efectoDeNivel(p.nivel)); // 12, 24 y 48 suenan cada vez más épicos
      barra.classList.remove("subio");
      void barra.offsetWidth; // reinicia la animación si sube dos veces seguidas
      barra.classList.add("subio");
    }
  }

  #boton(texto, titulo, id, accion) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = texto;
    b.title = titulo;
    b.dataset.accion = accion;
    b.dataset.id = id;
    return b;
  }

  accionesCarrito(e) {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    const id = Number(b.dataset.id);
    const item = this.carrito.items.find((i) => i.producto_id === id);
    if (!item) return;
    sonar(b.dataset.accion === "mas" ? "moneda" : "clic");
    if (b.dataset.accion === "mas") this.carrito.cambiarCantidad(id, item.cantidad + 1);
    else if (b.dataset.accion === "menos") this.carrito.cambiarCantidad(id, item.cantidad - 1);
    else if (b.dataset.accion === "quitar") this.carrito.quitar(id);
  }

  async enviar(e) {
    e.preventDefault();
    if (this.enviando) return undefined;
    const f = new FormData(e.target);
    if (!this.carrito.items.length) return this.mensaje("Tu carrito está vacío: agrega galletas primero.");
    // El domicilio sin dirección no se puede servir: se avisa aquí, en el
    // momento, en vez de dejar que el servidor lo rechace después.
    const entrega = String(f.get("entrega") || "recoger");
    const direccion = String(f.get("direccion") || "").trim();
    if (entrega !== "recoger" && !direccion) {
      return this.mensaje("Para el domicilio necesitamos la dirección de entrega.");
    }
    // Igual que el servidor: la distancia solo se cobra si el domicilio tiene cargo de zona.
    const cobraDomicilio = (envioDe(this.carrito.cantidadTotal, entrega) ?? 0) > 0;
    if (cobraDomicilio && !f.get("distancia")) {
      return this.mensaje("Elige la distancia del domicilio desde La Estrella.");
    }

    const datos = {
      cliente_nombre: String(f.get("nombre") || "").trim(),
      cliente_telefono: String(f.get("telefono") || "").trim(),
      entrega: String(f.get("entrega") || "recoger"),
      direccion: String(f.get("direccion") || "").trim() || undefined,
      distancia: String(f.get("distancia") || "") || undefined,
      notas: String(f.get("notas") || "").trim() || undefined,
      items: this.carrito.paraApi(),
    };
    // La visita anónima cierra el embudo de la medición: permite saber cuánta
    // gente agregó al carrito y no llegó a confirmar. Si el navegador no deja
    // guardarla, el pedido se manda igual, sin visita.
    const visita = idVisita();
    if (visita) datos.visita = visita;

    return this.crearPedido(datos, e.target);
  }

  async #crearPedido(datos, formulario) {
    try {
      const pedido = await this.servicio.crear(datos);
      // El formulario vuelve a "recoger": el carrito siguiente también, o
      // seguiría cobrando el domicilio de este pedido con el formulario en cero.
      this.carrito.entrega = "recoger";
      this.carrito.distancia = 0;
      this.carrito.vaciar();
      this.avisoCarrito("");
      formulario.reset();
      this.prefill();
      this.#confirmar(new Pedido(pedido));
    } catch (error) {
      this.mensaje(error.message);
      if (error.message.includes("Token")) window.dispatchEvent(new Event("sesion-vencida"));
    }
  }

  #confirmar(pedido) {
    this.mensaje(`¡Pedido #${pedido.id} registrado! Total ${pesos(pedido.total)}. Te esperamos.`, false);
    const enlace = this.$("btn-whatsapp-pedido");
    enlace.href = urlWhatsApp(textoPedido(pedido));
    // Marcador de "¡Nivel completado!": lo que el cliente logró con su pedido.
    const galletas = pedido.detalles.reduce((s, d) => s + d.cantidad, 0);
    const ahorro = ahorroDe(pedido);
    const poner = (id, texto) => { const n = this.$(id); if (n) n.textContent = texto; };
    poner("completado-pedido", `#${pedido.id}`);
    poner("completado-galletas", String(galletas));
    poner("completado-ahorro", pesos(ahorro));
    poner("completado-total", pesos(pedido.total));
    const filaAhorro = this.$("completado-ahorro-fila");
    if (filaAhorro) {
      filaAhorro.hidden = ahorro <= 0;
      filaAhorro.parentElement?.classList.toggle("sin-ahorro", ahorro <= 0);
    }
    this.#lluviaDePixeles();
    sonar("victoria");
    this.$("confirmacion").hidden = false;
    this.$("confirmacion").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Píxeles de colores que caen sobre el marcador. Es decoración (aria-hidden) y
  // con "reducir movimiento" el CSS no la anima ni la muestra.
  #lluviaDePixeles() {
    const capa = this.$("completado-lluvia");
    if (!capa) return;
    const colores = ["var(--masa)", "var(--moneda)", "var(--diamante)", "var(--corazon)"];
    capa.replaceChildren();
    for (let i = 0; i < 28; i++) {
      const px = document.createElement("i");
      px.style.setProperty("--x", `${Math.round(Math.random() * 100)}%`);
      px.style.setProperty("--retraso", `${(Math.random() * 0.9).toFixed(2)}s`);
      px.style.setProperty("--giro", `${Math.round(Math.random() * 360)}deg`);
      px.style.setProperty("--color", colores[i % colores.length]);
      capa.append(px);
    }
  }
}

// Vista del administrador: lista de pedidos y cambio de estado.
class PedidosAdminVista {
  constructor(servicio) {
    this.servicio = servicio;
    this.pedidos = [];
    this.$ = (id) => document.getElementById(id);
    this.$("lista-pedidos").addEventListener("change", (e) => this.cambiarEstado(e));
    escucharGlobal("pedidos-admin:sesion", "sesion-cambio", () => this.alCambiarSesion());
    this.alCambiarSesion();
  }

  get esAdmin() { return Sesion.obtener()?.usuario?.rol === "admin"; }

  mensaje(texto, esError = true) {
    const p = this.$("mensaje-pedidos");
    p.textContent = texto;
    p.classList.toggle("ok", !esError);
  }

  alCambiarSesion() {
    this.$("seccion-pedidos-admin").hidden = !this.esAdmin;
    if (this.esAdmin) this.cargar();
    else {
      this.pedidos = [];
      this.$("lista-pedidos").replaceChildren();
      this.mensaje("");
    }
  }

  async cargar() {
    try {
      this.pedidos = (await this.servicio.listar()).map((p) => new Pedido(p));
      this.pintar();
    } catch (error) { this.mensaje(error.message); }
  }

  pintar() {
    const lista = this.$("lista-pedidos");
    lista.replaceChildren();
    for (const p of this.pedidos) {
      const li = document.createElement("li");
      li.className = "producto";
      const info = document.createElement("div");
      const titulo = document.createElement("strong");
      titulo.textContent = `#${p.id} · ${p.clienteNombre} · ${pesos(p.total)}`;
      const detalle = document.createElement("small");
      detalle.textContent =
        `${p.resumen} — ${p.clienteTelefono}${p.direccion ? " — " + p.direccion : ""}` +
        ` — ${ENTREGAS[p.entrega]?.nombre ?? p.entrega} — ${p.fecha}`;
      info.append(titulo, document.createElement("br"), detalle);

      const selector = document.createElement("select");
      selector.dataset.id = p.id;
      selector.setAttribute("aria-label", `Estado del pedido ${p.id}`);
      for (const [valor, texto] of Object.entries(ESTADOS)) {
        const o = document.createElement("option");
        o.value = valor;
        o.textContent = texto;
        o.selected = p.estado === valor;
        selector.append(o);
      }
      li.append(info, selector);
      lista.append(li);
    }
  }

  async cambiarEstado(e) {
    const select = e.target.closest("select[data-id]");
    if (!select) return;
    try {
      await this.servicio.cambiarEstado(Number(select.dataset.id), select.value);
      this.mensaje("Estado actualizado.", false);
      await this.cargar();
    } catch (error) {
      this.mensaje(error.message);
      await this.cargar();
    }
  }
}

// Calculadora automática: según cuántas Special y normales elija el cliente,
// calcula el combo que aplica, su precio y lo que se ahorra frente a comprar
// las galletas sueltas. Usa la misma regla del servidor (comboDe).
export function calcularCombo(especiales, normales, precioSueltaEspecial, precioSueltaNormal) {
  const items = [
    { nombre: NOMBRE_SPECIAL, precio: precioSueltaEspecial, cantidad: especiales },
    { nombre: "normal", precio: precioSueltaNormal, cantidad: normales },
  ];
  const combo = comboDe(items);
  const sueltas = especiales * precioSueltaEspecial + normales * precioSueltaNormal;
  const galletas = especiales + normales;
  if (!combo) return { valido: false, galletas, sueltas };
  return {
    valido: true,
    nombre: combo.nombre,
    veces: combo.veces,
    galletas,
    precio: combo.precio,
    sueltas,
    ahorro: sueltas - combo.precio,
    porGalleta: Math.round(combo.precio / galletas),
  };
}

// Vista de la calculadora: lee el catálogo real (precio de la Special y de una
// normal) y recalcula cada vez que el cliente cambia las cantidades.
// Forma que entiende el carrito a partir de una fila de GET /productos.
const disponibleDe = (p) =>
  (p.cantidad_disponible === null || p.cantidad_disponible === undefined ? null : Number(p.cantidad_disponible));
const hayUnidades = (p) => disponibleDe(p) !== 0;
const productoParaCarrito = (p) => ({
  id: p.id, nombre: p.nombre_sabor, precio: Number(p.precio_venta), cantidadDisponible: disponibleDe(p),
});

export class CalculadoraCombos {
  constructor(carrito) {
    this.carrito = carrito;
    this.$ = (id) => document.getElementById(id);
    this.productos = [];
    // En la página del combo personalizado el armador va siempre visible y se
    // rehace al cambiar las cantidades; en la portada no existe.
    const armador = () => { if (this.$("btn-armador-agregar") && this.productos.length) this.abrirArmador(); };
    this.$("calc-especiales").addEventListener("input", () => { this.pintar(); armador(); });
    this.$("calc-normales").addEventListener("input", () => { this.pintar(); armador(); });
    if (this.$("btn-armador-agregar")) {
      this.$("btn-armador-agregar").addEventListener("click", () => this.agregarArmador());
      this.$("armador-sabores").addEventListener("change", () => this.pintarArmador());
    }
    if (this.$("btn-armador-compartir")) {
      this.$("btn-armador-compartir").addEventListener("click", () => this.compartirCombo());
    }
    // Un clic en el asiento del botón mientras no hay catálogo no debe quedarse
    // en silencio: el aviso ya está escrito en #calc-resultado.
  }

  // Armador: un selector de sabor por cada galleta normal del combo.
  abrirArmador() {
    const { especiales, normales } = this.cantidades();
    const area = this.$("armador-sabores");
    area.replaceChildren();
    const normalesCatalogo = this.productos.filter((p) => p.nombre_sabor !== NOMBRE_SPECIAL);
    // Lo agotado no se ofrece, pero se dice: si no, el cliente busca su sabor.
    const sabores = normalesCatalogo.filter(hayUnidades);
    const agotados = normalesCatalogo.filter((p) => !hayUnidades(p)).map((p) => p.nombre_sabor);
    const aviso = this.$("armador-aviso");
    if (aviso) aviso.textContent = agotados.length ? `Agotado por ahora: ${agotados.join(", ")}.` : "";
    for (let i = 0; sabores.length && i < normales; i++) {
      const label = document.createElement("label");
      label.textContent = `Galleta normal ${i + 1}`;
      const select = document.createElement("select");
      select.dataset.indice = String(i);
      for (const p of sabores) {
        const o = document.createElement("option");
        o.value = String(p.id);
        o.textContent = `${p.nombre_sabor} (${pesos(Number(p.precio_venta))})`;
        select.append(o);
      }
      label.append(select);
      area.append(label);
    }
    this.$("armador-combo").hidden = normales === 0 || especiales === 0;
    this.pintarArmador();
  }

  pintarArmador() {
    const { especiales, normales } = this.cantidades();
    const special = this.productos.find((p) => p.nombre_sabor === NOMBRE_SPECIAL);
    const selects = [...this.$("armador-sabores").querySelectorAll("select")];
    const elegidos = selects.map((sel) => this.productos.find((x) => String(x.id) === sel.value)).filter(Boolean);
    const total = selects.reduce((s, sel) => {
      const p = this.productos.find((x) => String(x.id) === sel.value);
      return s + (p ? Number(p.precio_venta) : 0);
    }, 0);
    const combo = special && comboDe([
      { nombre: NOMBRE_SPECIAL, cantidad: especiales },
      { nombre: "normal", cantidad: selects.length },
    ]);
    const sinSpecial = especiales > 0 && (!special || !hayUnidades(special));
    const sinSabores = normales > 0 && selects.length === 0;
    const falta = combo && !sinSpecial ? this.carrito.faltaPara(this.#lineasCombo(especiales, special, elegidos)) : null;
    const sePuede = combo && !sinSpecial && !sinSabores && !falta;
    const txt = this.$("armador-total");
    this.$("btn-armador-agregar").disabled = !sePuede;
    const btnCompartir = this.$("btn-armador-compartir");
    if (btnCompartir) btnCompartir.hidden = !sePuede;
    if (sinSpecial) txt.textContent = `${NOMBRE_SPECIAL} está agotada por ahora: sin ella no podemos armar el combo. Escríbenos por WhatsApp y te contamos cuándo vuelve.`;
    else if (sinSabores) txt.textContent = "No nos quedan sabores normales por ahora, así que no podemos armar el combo. Escríbenos por WhatsApp y te contamos cuándo vuelven.";
    else if (falta) txt.textContent = falta.caben
      ? `De ${falta.nombre} solo puedes agregar ${falta.caben} más: cambia el sabor o la cantidad.`
      : `Ya no puedes agregar más ${falta.nombre}: cambia el sabor o la cantidad.`;
    else txt.textContent = combo
      ? `${combo.nombre}: ${pesos(combo.precio)} (sabores elegidos: ${pesos(total)} sueltos)`
      : "Este número de galletas no forma un combo: revisa la cantidad de Special y de normales.";
  }

  // Galletas del combo agrupadas por sabor, como las espera el carrito.
  #lineasCombo(especiales, special, elegidos) {
    const lineas = new Map();
    for (const p of [...Array(especiales).fill(special), ...elegidos]) {
      const linea = lineas.get(p.id);
      if (linea) linea.cantidad += 1;
      else lineas.set(p.id, { producto: productoParaCarrito(p), cantidad: 1 });
    }
    return [...lineas.values()];
  }

  // Tarjeta del combo lista para el grupo de WhatsApp: se dibuja aquí mismo,
  // sin servidor, y se comparte como imagen. Si el navegador no sabe compartir
  // archivos (o el usuario cancela), queda descargada para adjuntarla a mano.
  async compartirCombo() {
    const { especiales } = this.cantidades();
    const selects = [...this.$("armador-sabores").querySelectorAll("select")];
    const sabores = selects
      .map((sel) => this.productos.find((x) => String(x.id) === sel.value)?.nombre_sabor)
      .filter(Boolean);
    const combo = comboDe([
      { nombre: NOMBRE_SPECIAL, cantidad: especiales },
      { nombre: "normal", cantidad: sabores.length },
    ]);
    const aviso = this.$("armador-aviso");
    if (!combo) {
      if (aviso) aviso.textContent = "Elige un número de galletas que forme un combo.";
      return;
    }

    const ancho = 1080, alto = 1350;
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    // La tipografía de la marca ya está cargada por CSS; si el navegador no
    // deja pedirla aquí, el lienzo cae a la monoespaciada del sistema.
    try { await Promise.all([document.fonts.load('700 56px Silkscreen'), document.fonts.load('700 56px "Cifras Pixel"', "0")]); } catch { /* fuente del sistema */ }
    const titulo = '700 56px "Cifras Pixel", Silkscreen, monospace';
    const chico = '700 30px "Cifras Pixel", Silkscreen, monospace';

    // Fondo índigo con la rejilla pixel de la marca.
    ctx.fillStyle = "#15094F";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.strokeStyle = "rgba(245, 144, 47, .13)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= ancho; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, alto); ctx.stroke(); }
    for (let y = 0; y <= alto; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ancho, y); ctx.stroke(); }

    ctx.strokeStyle = "#F5902F";
    ctx.lineWidth = 10;
    ctx.strokeRect(36, 36, ancho - 72, alto - 72);
    ctx.strokeStyle = "rgba(255, 243, 220, .35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(58, 58, ancho - 116, alto - 116);

    ctx.textAlign = "center";
    ctx.fillStyle = "#FFF3DC";
    ctx.font = titulo;
    ctx.fillText("PIXEL GALLETAS", ancho / 2, 190);
    ctx.font = chico;
    ctx.fillStyle = "#F5B41F";
    ctx.fillText("DE LA PANTALLA A TU PALADAR", ancho / 2, 245);

    ctx.fillStyle = "#F5902F";
    ctx.font = '700 44px "Cifras Pixel", Silkscreen, monospace';
    ctx.fillText(combo.nombre.toUpperCase(), ancho / 2, 390);

    ctx.fillStyle = "#F5B41F";
    ctx.font = '700 104px "Cifras Pixel", Silkscreen, monospace';
    ctx.fillText(pesos(combo.precio), ancho / 2, 540);
    ctx.font = chico;
    ctx.fillStyle = "rgba(255, 243, 220, .7)";
    ctx.fillText(`${especiales + sabores.length} galletas`, ancho / 2, 600);

    // Lo que lleva, agrupado por sabor para que quepa en una línea por tipo.
    const conteo = new Map();
    sabores.forEach((sabor) => conteo.set(sabor, (conteo.get(sabor) || 0) + 1));
    const lineas = [`${especiales} × ${NOMBRE_SPECIAL}`, ...[...conteo].map(([sabor, n]) => `${n} × ${sabor}`)];
    ctx.textAlign = "left";
    ctx.font = '700 32px "Cifras Pixel", Silkscreen, monospace';
    let y = 720;
    lineas.slice(0, 8).forEach((linea) => {
      ctx.fillStyle = "#FFF3DC";
      ctx.fillText(linea.length > 34 ? `${linea.slice(0, 33)}…` : linea, 110, y);
      y += 58;
    });

    ctx.textAlign = "center";
    ctx.font = chico;
    ctx.fillStyle = "#FFF3DC";
    ctx.fillText("PÍDELO POR WHATSAPP", ancho / 2, 1140);
    ctx.fillStyle = "#F5902F";
    ctx.font = '700 48px "Cifras Pixel", Silkscreen, monospace';
    ctx.fillText("313 783 9935", ancho / 2, 1200);
    ctx.font = chico;
    ctx.fillStyle = "rgba(255, 243, 220, .6)";
    ctx.fillText(location.host, ancho / 2, 1265);

    const texto = [
      `${combo.nombre} · ${pesos(combo.precio)}`,
      lineas.join(" · "),
      "Pixel Galletas · Cúcuta",
      location.origin,
    ].join("\n");

    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/png"));
    if (!blob) return;
    const archivo = new File([blob], "combo-pixel-galletas.png", { type: "image/png" });
    let puedeCompartir = false;
    try { puedeCompartir = !!(navigator.canShare && navigator.canShare({ files: [archivo] })); } catch { puedeCompartir = false; }
    if (puedeCompartir) {
      try {
        await navigator.share({ files: [archivo], text: texto, title: combo.nombre });
        if (aviso) aviso.textContent = "Combo compartido.";
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }

    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = "combo-pixel-galletas.png";
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
    if (aviso) aviso.textContent = "Imagen descargada: adjúntala en tu chat de WhatsApp.";
  }

  // Agrega las galletas del armador (cada normal con su sabor elegido).
  agregarArmador() {
    const { especiales } = this.cantidades();
    const special = this.productos.find((p) => p.nombre_sabor === NOMBRE_SPECIAL);
    const selects = [...this.$("armador-sabores").querySelectorAll("select")];
    const elegidos = selects.map((sel) => this.productos.find((x) => String(x.id) === sel.value)).filter(Boolean);
    const combo = special && comboDe([
      { nombre: NOMBRE_SPECIAL, cantidad: especiales },
      { nombre: "normal", cantidad: elegidos.length },
    ]);
    if (!combo) return;
    const lineas = this.#lineasCombo(especiales, special, elegidos);
    // Se revisa todo antes de agregar nada: un combo a medias no es un combo.
    // pintarArmador ya explica en pantalla qué sabor es el que no alcanza.
    if (this.carrito.faltaPara(lineas)) return this.pintarArmador();
    for (const { producto, cantidad } of lineas) {
      for (let i = 0; i < cantidad; i++) this.carrito.agregar(producto);
    }
    const aviso = this.$("armador-aviso");
    if (aviso) {
      aviso.textContent = this.carrito.combo
        ? `¡Listo! ${combo.nombre} en tu carrito.`
        : `¡Listo! Agregamos tu ${combo.nombre}. Con lo que ya tenías en el carrito no forma un combo exacto, así que se cobra por galleta: revísalo antes de pedir.`;
    }
    const irCarrito = this.$("armador-ir-carrito");
    if (irCarrito) irCarrito.hidden = false;
    this.pintarArmador();
  }

  // productos: los que devuelve GET /productos (ya con precio_venta real).
  cargarProductos(productos) {
    this.productos = productos;
    this.pintar();
    if (this.$("btn-armador-agregar")) this.abrirArmador();
  }

  #precios() {
    const special = this.productos.find((p) => p.nombre_sabor === NOMBRE_SPECIAL);
    // Las normales tienen precios distintos: para lo suelto se usa su promedio.
    const normales = this.productos.filter((p) => p.nombre_sabor !== NOMBRE_SPECIAL);
    const promedio = normales.length
      ? normales.reduce((s, p) => s + Number(p.precio_venta), 0) / normales.length
      : null;
    return {
      special, normal: normales[0],
      precioSpecial: special ? Number(special.precio_venta) : null,
      precioNormal: promedio,
    };
  }

  cantidades() {
    const leer = (id) => Math.max(0, Math.min(30, Math.floor(Number(this.$(id).value) || 0)));
    return { especiales: leer("calc-especiales"), normales: leer("calc-normales") };
  }

  // Un cuadrito pixel por galleta: amarillo para la Special, naranja para la normal.
  #marcador(especiales, normales) {
    const m = this.$("calc-marcador");
    m.replaceChildren();
    const piezas = [
      ...Array(especiales).fill("special"),
      ...Array(normales).fill("normal"),
    ];
    piezas.forEach((tipo, i) => {
      const s = document.createElement("span");
      s.className = `calc-pieza calc-pieza-${tipo}`;
      s.style.setProperty("--i", String(i));
      m.append(s);
    });
  }

  pintar() {
    const { especiales, normales } = this.cantidades();
    const { special, normal, precioSpecial, precioNormal } = this.#precios();
    const res = this.$("calc-resultado");
    const det = this.$("calc-detalle");
    const tabla = this.$("calc-tabla-cuerpo");
    tabla.replaceChildren();
    if (!special || !normal) {
      res.textContent = "Cargando precios…";
      det.textContent = "";
      return;
    }
    const c = calcularCombo(especiales, normales, precioSpecial, precioNormal);
    this.#marcador(especiales, normales);
    if (c.galletas === 0) {
      res.textContent = "Elige al menos una galleta.";
      det.textContent = "";
    } else if (!c.valido) {
      res.textContent = `${c.galletas} galleta${c.galletas === 1 ? "" : "s"} sueltas: ${pesos(c.sueltas)}`;
      det.textContent = "Para precio de combo lleva 1 Special + 2 normales, 2 Special + 2 normales o 3 Special + 3 normales.";
    } else {
      res.textContent = `${c.nombre} · ${c.galletas} galletas · ${pesos(c.precio)}`;
      det.textContent = c.ahorro > 0
        ? `Ahorras ${pesos(c.ahorro)} frente a comprarlas sueltas (${pesos(c.porGalleta)} por galleta).`
        : `Precio de combo: ${pesos(c.porGalleta)} por galleta.`;
    }
    // Tabla: los tres combos, para comparar sin cambiar los números.
    for (const combo of COMBOS) {
      const fila = document.createElement("tr");
      const galletas = combo.especiales + combo.normales;
      for (const texto of [combo.nombre, String(galletas), pesos(combo.precio), pesos(Math.round(combo.precio / galletas))]) {
        const td = document.createElement("td");
        td.textContent = texto;
        fila.append(td);
      }
      tabla.append(fila);
    }
  }

}

// Solo arrancan cuando existe la página (así los módulos también se prueban sin navegador).
if (typeof document !== "undefined") {
  const carrito = new Carrito(new CarritoServicio(new ApiClient()));
  let unida = carrito.unirConCuenta().catch(() => {}); // si ya hay sesión al cargar, une los dos carritos
  const vista = document.getElementById("form-pedido") ? new PedidoVista(new PedidoServicio(new ApiClient()), carrito) : null;
  // Aquí y no en la vista: al navegar sin recargar este módulo se vuelve a
  // ejecutar y su carrito es el vigente, aunque la página nueva no tenga
  // formulario. Sin esto, la página del combo seguía pintando el carrito viejo.
  escucharGlobal("pedidos:carrito-cambio", "carrito-cambio", () => {
    if (vista) vista.pintarCarrito();
    else pintarBarraCarrito(carrito);
  });
  pintarBarraCarrito(carrito);

  // Dónde se le cuenta al cliente que su carrito guardado cambió.
  const avisar = (cambios) => {
    if (!cambios.length) return;
    const texto = cambios.join(" ");
    if (vista) vista.avisoCarrito(texto);
    else if (document.getElementById("armador-aviso")) {
      // Se suma a lo que ya dice el aviso (los sabores agotados), no lo borra.
      const aviso = document.getElementById("armador-aviso");
      aviso.textContent = [aviso.textContent, texto].filter(Boolean).join(" ");
    }
  };
  // Siempre después de unir con la cuenta: las líneas del servidor también
  // pasan por el catálogo, y un ajuste hecho antes de que la cuenta responda
  // quedaría como cambio del cliente y pisaría lo que ella tiene guardado.
  let catalogo = null;
  const ponerAlDia = (lista) => {
    if (lista) catalogo = lista;
    return unida.then(() => avisar(carrito.reconciliar(catalogo)));
  };
  escucharGlobal("carrito:unir-sesion", "sesion-cambio", () => {
    unida = carrito.unirConCuenta().catch(() => {});
    ponerAlDia();
  });
  escucharGlobal("carrito:recortado", "carrito-recortado", () => avisar(["Ajustamos tu carrito a las unidades disponibles."]));
  // El catálogo lo pide productos.js; si llegó antes que este módulo, queda
  // guardado en window y se usa igual.
  escucharGlobal("carrito:catalogo", "catalogo-cargado", (e) => ponerAlDia(e.detail));
  if (window.__catalogoPixel) ponerAlDia(window.__catalogoPixel);
  if (document.getElementById("lista-pedidos")) new PedidosAdminVista(new PedidoServicio(new ApiClient()));
  // La calculadora solo existe en la página del combo personalizado.
  if (document.getElementById("calc-especiales")) {
    const calculadora = new CalculadoraCombos(carrito);
    const url = new URLSearchParams(location.search);
    if (url.has("especiales")) calculadora.$("calc-especiales").value = url.get("especiales");
    if (url.has("normales")) calculadora.$("calc-normales").value = url.get("normales");
    // Si el catálogo no responde, la página no puede quedarse muda: sin
    // sabores no hay armador ni botón de compartir, y el cliente merece saber
    // por qué y qué hacer mientras tanto.
    new ApiClient().get("/productos").then((p) => {
      calculadora.cargarProductos(p);
      // El armador cuenta lo que ya hay en el carrito: se repinta con él al día.
      ponerAlDia(p.map(productoParaCarrito)).then(() => {
        if (calculadora.$("btn-armador-agregar")) calculadora.pintarArmador();
      });
    }).catch(() => {
      const aviso = document.getElementById("calc-resultado");
      if (aviso) {
        aviso.textContent = "No pudimos cargar los sabores: el catálogo no está disponible en este momento. Escríbenos por WhatsApp y armamos tu combo contigo.";
      }
      const armador = document.getElementById("armador-combo");
      if (armador) armador.hidden = true;
    });
  }
}
