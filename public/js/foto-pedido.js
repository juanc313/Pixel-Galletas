// Foto del pedido para WhatsApp: una imagen con las galletas que el cliente
// eligió (foto real de cada sabor, cantidad y total), lista para enviar junto
// con el mensaje.
//
// Por qué así: un enlace de WhatsApp (wa.me) solo puede llevar TEXTO; ningún
// sitio web puede adjuntar una imagen a un chat directamente. Lo que sí existe
// es "Compartir" del celular (Web Share API): abre la hoja de compartir con la
// imagen y el texto, y el cliente elige el chat de Pixel Galletas. Donde no se
// puede (la mayoría de computadores), se ofrece guardar la imagen para
// adjuntarla a mano en WhatsApp Web.

import { fotoDeSabor } from "./sabores.js";

const ANCHO = 1080;
const MARGEN = 48;
const COLUMNAS = 2;
const LADO_FOTO = (ANCHO - MARGEN * (COLUMNAS + 1)) / COLUMNAS; // 468 px
const ALTO_CABECERA = 230;
const ALTO_ETIQUETA = 96;
const ALTO_PIE = 170;
const MAX_SABORES = 8; // más que esto se resume en "y N sabores más"

const COLORES = { fondo: "#FFF6E5", tinta: "#2B1E4A", acento: "#E8731C", suave: "#6B5E80", tarjeta: "#FFFFFF" };

const pesos = (n) => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");

// Sabores del pedido, sin repetir, con su cantidad y su foto (o null).
export function itemsParaFoto(detalles) {
  const porNombre = new Map();
  for (const d of detalles || []) {
    const nombre = String(d?.nombre || "").trim();
    if (!nombre) continue;
    const previo = porNombre.get(nombre);
    if (previo) previo.cantidad += Number(d.cantidad) || 0;
    else porNombre.set(nombre, { nombre, cantidad: Number(d.cantidad) || 0, foto: fotoDeSabor(nombre) });
  }
  return [...porNombre.values()];
}

// Alto total de la imagen según cuántos sabores se dibujan.
export function altoDeImagen(cantidadSabores) {
  const n = Math.min(Math.max(cantidadSabores, 1), MAX_SABORES);
  const filas = Math.ceil(n / COLUMNAS);
  return ALTO_CABECERA + filas * (LADO_FOTO + ALTO_ETIQUETA + MARGEN) + ALTO_PIE;
}

export function nombreArchivo(pedido) {
  return `pedido-pixel-galletas-${pedido?.id ?? "nuevo"}.jpg`;
}

// ¿El navegador puede compartir una imagen (hoja de compartir del celular)?
export function puedeCompartirArchivos(nav = globalThis.navigator) {
  try {
    if (typeof File === "undefined" || !nav?.canShare) return false;
    return nav.canShare({ files: [new File(["x"], "prueba.jpg", { type: "image/jpeg" })] });
  } catch { return false; }
}

function cargarImagen(src) {
  return new Promise((resolver) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null); // sin foto se dibuja la galleta pixelada
    img.src = src;
  });
}

// Recorta la imagen para llenar el cuadro sin deformarla (como object-fit: cover).
function dibujarCubriendo(ctx, img, x, y, lado) {
  const escala = Math.max(lado / img.width, lado / img.height);
  const w = img.width * escala, h = img.height * escala;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, lado, lado); ctx.clip();
  ctx.drawImage(img, x + (lado - w) / 2, y + (lado - h) / 2, w, h);
  ctx.restore();
}

// Galleta pixelada de respaldo para sabores sin foto real.
function dibujarGalletaPixel(ctx, x, y, lado) {
  const celda = lado / 12;
  const mapa = [
    "....XXXX....", "..XXXXXXXX..", ".XXXoXXXXXX.", ".XXXXXXXoXX.", "XXoXXXXXXXXX", "XXXXXXoXXXXX",
    "XXXXXXXXXoXX", "XoXXXXXXXXXX", ".XXXXoXXXXX.", ".XXXXXXXoXX.", "..XXXXXXXX..", "....XXXX....",
  ];
  mapa.forEach((fila, f) => [...fila].forEach((c, k) => {
    if (c === ".") return;
    ctx.fillStyle = c === "o" ? "#5A3A1E" : "#D99A4E";
    ctx.fillRect(x + k * celda, y + f * celda, Math.ceil(celda), Math.ceil(celda));
  }));
}

function textoAjustado(ctx, texto, anchoMax) {
  if (ctx.measureText(texto).width <= anchoMax) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + "…").width > anchoMax) t = t.slice(0, -1);
  return t + "…";
}

// Dibuja la foto del pedido y la devuelve como JPG (Blob).
export async function dibujarFotoPedido(pedido, { doc = globalThis.document } = {}) {
  const items = itemsParaFoto(pedido.detalles);
  if (!items.length) return null; // sin galletas no hay foto que mostrar
  const visibles = items.slice(0, MAX_SABORES);
  const lienzo = doc.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = altoDeImagen(visibles.length);
  const ctx = lienzo.getContext("2d");

  // Letra de la marca si ya está cargada; si no, una de respaldo.
  try { await doc.fonts?.load?.("700 40px Silkscreen"); } catch { /* sin fuentes web */ }
  const letraMarca = (tam) => `700 ${tam}px Silkscreen, "Courier New", monospace`;
  const letraTexto = (tam, peso = 600) => `${peso} ${tam}px Rubik, system-ui, sans-serif`;

  ctx.fillStyle = COLORES.fondo;
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);

  // Cabecera: logo, marca y número de pedido.
  const logo = await cargarImagen("/img/logo-256.webp");
  if (logo) ctx.drawImage(logo, MARGEN, 40, 140, 140);
  ctx.fillStyle = COLORES.tinta;
  ctx.font = letraMarca(54);
  ctx.fillText("PIXEL GALLETAS", MARGEN + 170, 110);
  ctx.fillStyle = COLORES.acento;
  ctx.font = letraTexto(40, 700);
  ctx.fillText(`Pedido #${pedido.id}`, MARGEN + 172, 165);
  ctx.fillRect(MARGEN, ALTO_CABECERA - 26, ANCHO - MARGEN * 2, 6);

  // Una tarjeta por sabor: foto y "2 × Monster".
  const fotos = await Promise.all(visibles.map((it) => (it.foto ? cargarImagen(it.foto) : null)));
  visibles.forEach((it, i) => {
    const col = i % COLUMNAS, fila = Math.floor(i / COLUMNAS);
    const x = MARGEN + col * (LADO_FOTO + MARGEN);
    const y = ALTO_CABECERA + fila * (LADO_FOTO + ALTO_ETIQUETA + MARGEN);
    ctx.fillStyle = COLORES.tarjeta;
    ctx.fillRect(x - 8, y - 8, LADO_FOTO + 16, LADO_FOTO + ALTO_ETIQUETA + 16);
    if (fotos[i]) dibujarCubriendo(ctx, fotos[i], x, y, LADO_FOTO);
    else dibujarGalletaPixel(ctx, x + LADO_FOTO * 0.15, y + LADO_FOTO * 0.15, LADO_FOTO * 0.7);
    ctx.fillStyle = COLORES.tinta;
    ctx.font = letraTexto(40, 700);
    ctx.fillText(textoAjustado(ctx, `${it.cantidad} × ${it.nombre}`, LADO_FOTO), x, y + LADO_FOTO + 60);
  });

  // Pie: sabores que no cupieron, total y sitio.
  const yPie = lienzo.height - ALTO_PIE + 40;
  ctx.fillStyle = COLORES.suave;
  ctx.font = letraTexto(32, 500);
  if (items.length > visibles.length) ctx.fillText(`y ${items.length - visibles.length} sabores más (ver el mensaje)`, MARGEN, yPie - 4);
  ctx.fillStyle = COLORES.tinta;
  ctx.font = letraTexto(52, 800);
  ctx.fillText(`Total ${pesos(pedido.total)}`, MARGEN, yPie + 60);
  ctx.fillStyle = COLORES.suave;
  ctx.font = letraTexto(30, 500);
  ctx.textAlign = "right";
  ctx.fillText("pixel-galletas.vercel.app", ANCHO - MARGEN, yPie + 56);
  ctx.textAlign = "left";

  return new Promise((resolver) => lienzo.toBlob((b) => resolver(b), "image/jpeg", 0.86));
}

// Blob -> "data:image/jpeg;base64,..." (para mostrarla y para "Guardar").
export function comoDataUrl(blob) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result);
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(blob);
  });
}

// Abre la hoja de compartir del celular con la foto y el texto del pedido.
// Debe llamarse dentro del toque del cliente (el navegador lo exige), por eso
// la foto se dibuja ANTES, al confirmar el pedido, y aquí solo se comparte.
export async function compartirFoto(blob, pedido, texto, nav = globalThis.navigator) {
  const archivo = new File([blob], nombreArchivo(pedido), { type: "image/jpeg" });
  if (!nav?.canShare?.({ files: [archivo] })) return "no-soportado";
  try {
    await nav.share({ files: [archivo], text: texto });
    return "compartido";
  } catch (error) {
    return error?.name === "AbortError" ? "cancelado" : "error";
  }
}
