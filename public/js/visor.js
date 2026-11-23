// Visor de fotos del sitio.
//
// Cualquier foto ampliable (las de portada, comunidad, marca y catálogo) se
// abre a pantalla completa al pulsarla. Va en un <dialog> nativo: el navegador
// se encarga de atrapar el foco, de cerrar con Esc y de devolvérmelo a la
// página, así que aquí solo hay que llenar la foto y el pie.
//
// Las fotos se recogen en el momento de abrir, no al cargar la página: las del
// catálogo llegan después de que responda la API y también deben abrirse. El
// clic se escucha de forma delegada en el documento por el mismo motivo.
//
// La imagen que se muestra es la que el navegador ya tiene cargada
// (currentSrc), así que ampliar una foto no descarga nada nuevo.

export function pieDeFoto(img) {
  const figura = img.closest("figure");
  const pie = figura && figura.querySelector("figcaption");
  return (pie && pie.textContent.trim()) || img.alt || "Foto de Pixel Galletas";
}

export function iniciarVisor(doc = document) {
  const visor = doc.getElementById("visor");
  const foto = doc.getElementById("visor-img");
  const pie = doc.getElementById("visor-pie");
  if (!visor || !foto || !pie || typeof visor.showModal !== "function") return null;

  const anteriores = doc.getElementById("visor-anterior");
  const siguientes = doc.getElementById("visor-siguiente");
  const cerrar = doc.getElementById("visor-cerrar");
  const AMPLIABLES = "img[data-zoom], #lista-productos img";
  // Entran todas las fotos ampliables, tengan píxeles o no: las del catálogo
  // son perezosas y hasta que no se llega a ellas no se descargan, así que
  // filtrarlas hacía que el pie mintiera ("2 de 5" con seis sabores). Navegar
  // a una que aún no bajó la trae en ese momento.
  const seleccionables = () => [...doc.querySelectorAll(AMPLIABLES)];

  // Las fotos se abren también con el teclado y con lector de pantalla: se
  // marcan como botones —el texto alternativo hace de nombre— y responden a
  // Enter y al espacio. Las del catálogo llegan después de que responda la
  // API, así que la lista se vuelve a revisar cuando cambia.
  const marcar = (img) => {
    if (img.dataset.ampliable) return;
    img.dataset.ampliable = "1";
    img.tabIndex = 0;
    img.setAttribute("role", "button");
  };
  const marcarTodas = (raiz = doc) => raiz.querySelectorAll(AMPLIABLES).forEach(marcar);
  marcarTodas();
  const listaProductos = doc.getElementById("lista-productos");
  if (listaProductos && "MutationObserver" in window) {
    new MutationObserver(() => marcarTodas(listaProductos)).observe(listaProductos, { childList: true, subtree: true });
  }

  let lista = [];
  let indice = 0;

  const pintar = () => {
    const img = lista[indice];
    if (!img) return;
    // data-grande: la foto grande, si la tarjeta muestra una versión chica
    // (srcset); al ampliar se ve nítida. Sin data-grande, la que ya se ve.
    foto.src = img.dataset.grande || img.currentSrc || img.src;
    foto.alt = img.alt || "";
    pie.textContent = `${pieDeFoto(img)} · ${indice + 1} de ${lista.length}`;
    const varias = lista.length > 1;
    if (anteriores) anteriores.hidden = !varias;
    if (siguientes) siguientes.hidden = !varias;
  };

  const mover = (paso) => {
    if (!lista.length) return;
    indice = (indice + paso + lista.length) % lista.length;
    pintar();
  };

  const abrir = (img) => {
    lista = seleccionables();
    indice = Math.max(0, lista.indexOf(img));
    if (!lista.length) return;
    pintar();
    visor.showModal();
  };

  // Delegado: funciona también con las fotos que aparecen más tarde.
  doc.addEventListener("click", (e) => {
    const img = e.target.closest?.("img[data-zoom], #lista-productos img");
    if (!img || !img.naturalWidth) return;
    e.preventDefault();
    abrir(img);
  });

  anteriores?.addEventListener("click", () => mover(-1));
  siguientes?.addEventListener("click", () => mover(1));
  cerrar?.addEventListener("click", () => visor.close());
  // Clic en el fondo oscuro (fuera del marco) cierra, como en cualquier visor.
  visor.addEventListener("click", (e) => { if (e.target === visor) visor.close(); });
  visor.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); mover(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); mover(1); }
  });
  // Enter o espacio sobre una foto enfocada la abre, como cualquier botón.
  doc.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const img = e.target.closest?.(AMPLIABLES);
    if (!img || visor.open) return;
    e.preventDefault();
    abrir(img);
  });

  return { abrir, mover };
}

if (typeof document !== "undefined") iniciarVisor();
