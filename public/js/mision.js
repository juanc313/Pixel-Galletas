// ============================================================================
// El pedido como misión
// ----------------------------------------------------------------------------
// Los cuatro estados normales del pedido son las cuatro etapas de una misión.
// Es solo otra forma de mostrar el mismo estado que guarda el servidor: no
// inventa pasos ni promete tiempos. "Cancelado" no es una etapa: apaga la ruta.
// La usan la confirmación del pedido (pedidos.js) y la consulta de estado
// (estado.js); por eso vive aparte y no importa nada.
// ============================================================================
export const ETAPAS_MISION = [
  { estado: "pendiente", icono: "📜", titulo: "Pedido recibido", pose: "lista" },
  { estado: "en_preparacion", icono: "🔥", titulo: "En el horno", pose: "chef" },
  { estado: "listo", icono: "🎁", titulo: "Listo", pose: "regalo" },
  { estado: "entregado", icono: "🏆", titulo: "Entregado", pose: "trofeo" },
];

// Lo que la vista necesita para dibujar la misión, sin tocar el DOM (se prueba aparte).
// Devuelve null si el estado no es conocido: entonces se muestra solo el texto.
export function misionDe(pedido) {
  const cancelada = pedido.estado === "cancelado";
  const indice = ETAPAS_MISION.findIndex((e) => e.estado === pedido.estado);
  if (indice < 0 && !cancelada) return null;
  // "Listo" dice qué sigue según cómo llega: recoger en el C.C. La Estrella o domicilio.
  const listo = pedido.entrega === "recoger" ? "Listo para recoger" : "Listo para salir";
  const etapas = ETAPAS_MISION.map((e, i) => ({
    ...e,
    titulo: e.estado === "listo" ? listo : e.titulo,
    paso: cancelada ? "apagada" : i < indice ? "hecha" : i === indice ? "actual" : "pendiente",
  }));
  const total = ETAPAS_MISION.length;
  const cumplida = pedido.estado === "entregado";
  let cabeza;
  if (cancelada) cabeza = "Misión cancelada";
  else if (cumplida) cabeza = "¡Misión cumplida!";
  else cabeza = `Etapa ${indice + 1} de ${total} · ${etapas[indice].titulo}`;
  return { etapas, cancelada, cumplida, cabeza, etapa: cancelada ? 0 : indice + 1, total };
}

// Texto para presumir la entrega. No lleva número de pedido, nombre ni teléfono:
// se comparte con quien sea y no puede filtrar nada del pedido.
export function textoVictoria(origen = globalThis.location?.origin || "") {
  const enlace = origen ? ` Pide las tuyas en ${origen}` : "";
  return `🏆 ¡Misión cumplida! Ya llegaron mis Pixel Galletas 🍪.${enlace}`;
}

// La ruta de la misión: una lista ordenada de verdad (el lector de pantalla
// dice "paso 2 de 4, actual"); lo de 8 bits lo pone el CSS con clases,
// porque la CSP no deja estilos en línea.
export function rutaMision(mision) {
  const bloque = document.createElement("div");
  const extra = mision.cancelada ? " mision-cancelada" : mision.cumplida ? " mision-cumplida" : "";
  bloque.className = `mision mision-etapa-${mision.etapa}${extra}`;

  const cabeza = document.createElement("p");
  cabeza.className = "mision-cabeza";
  cabeza.textContent = mision.cabeza;
  bloque.append(cabeza);

  // Pixelito acompaña la etapa en curso con su dibujo (lista, chef, regalo,
  // trofeo). Va dentro de la cabeza: es decorativo y no cambia su texto; el
  // CSS lo sube encima del texto.
  const pose = mision.cancelada ? null : ETAPAS_MISION[mision.etapa - 1]?.pose;
  if (pose) {
    const img = document.createElement("img");
    img.className = "mision-pixelito";
    img.src = `/img/pixelito-${pose}.webp`;
    img.alt = "";
    img.width = 120;
    img.height = 120;
    img.decoding = "async";
    cabeza.append(img);
  }

  const lista = document.createElement("ol");
  lista.className = "mision-ruta";
  lista.setAttribute("aria-label", "Etapas de tu pedido");
  const leyenda = { hecha: "completada", actual: "en curso", pendiente: "por venir", apagada: "cancelada" };
  for (const etapa of mision.etapas) {
    const li = document.createElement("li");
    li.className = `mision-paso paso-${etapa.paso}`;
    if (etapa.paso === "actual" || (mision.cumplida && etapa.estado === "entregado")) li.setAttribute("aria-current", "step");
    const icono = document.createElement("span");
    icono.className = "mision-icono";
    icono.setAttribute("aria-hidden", "true");
    icono.textContent = etapa.icono;
    const texto = document.createElement("span");
    texto.className = "mision-texto";
    texto.textContent = etapa.titulo;
    const lector = document.createElement("span");
    lector.className = "mision-lector";
    lector.textContent = ` (${leyenda[etapa.paso]})`;
    li.append(icono, texto, lector);
    lista.append(li);
  }
  bloque.append(lista);
  return bloque;
}
