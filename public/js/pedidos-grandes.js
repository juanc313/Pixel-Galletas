// Pedidos grandes (torneos, LAN parties, empresas): arma una solicitud de
// cotización por WhatsApp. No crea pedidos ni dice precios: el dueño cierra cada
// venta en el chat. Un encargo con poco tiempo no se bloquea: se avisa y se
// deja escribir, porque el dueño es quien sabe si alcanza a hornearlo.
import { urlWhatsApp } from "./config.js";

export const MINIMO_GALLETAS = 24;

// Días de aviso según la cantidad. Con 17 galletas por tanda y una tanda al día,
// 50 galletas son 3 tandas y 100 son 6. Más de 100 se acuerda con el cliente.
export function diasDeAviso(cantidad) {
  if (cantidad <= 50) return 4;
  if (cantidad <= 100) return 8;
  return null;
}

// La fecha llega como "AAAA-MM-DD" y se lee en hora local: new Date("AAAA-MM-DD")
// la tomaría en UTC y en Colombia daría el día anterior.
function fechaLocal(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function diasHasta(iso, hoy) {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((fechaLocal(iso) - inicio) / 86400000);
}

// Texto bajo el formulario. `justo` indica que la fecha queda antes del plazo.
export function avisoDePlazo(cantidad, fecha, hoy = new Date()) {
  if (!Number.isInteger(cantidad) || cantidad < MINIMO_GALLETAS) return { justo: false, texto: "" };
  const dias = diasDeAviso(cantidad);
  if (dias === null) return { justo: false, texto: "Para más de 100 galletas acordamos el plazo contigo." };
  if (!fecha) return { justo: false, texto: `Para ${cantidad} galletas pedimos al menos ${dias} días de aviso.` };
  if (diasHasta(fecha, hoy) < dias) {
    return {
      justo: true,
      texto: `Esa fecha queda antes de los ${dias} días de aviso que pedimos. Escríbenos igual y miramos si alcanzamos.`,
    };
  }
  return { justo: false, texto: `Tu fecha cumple los ${dias} días de aviso.` };
}

export function mensajeCotizacion({ cantidad, ocasion, fecha, zona, nombre }, justo = false) {
  const fechaTexto = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" })
    .format(fechaLocal(fecha));
  const lineas = [
    `¡Hola Pixel Galletas! Soy ${nombre}. Quiero cotizar un pedido grande:`,
    `• Cantidad: ${cantidad} galletas`,
    `• Ocasión: ${ocasion}`,
    `• Fecha: ${fechaTexto}`,
    `• Ciudad o zona: ${zona}`,
  ];
  if (justo) lineas.push("", "Sé que la fecha está cerca: ¿alcanzan a tenerlas?");
  return lineas.join("\n");
}

function isoLocal(d) {
  const dos = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

const form = typeof document === "undefined" ? null : document.getElementById("form-grandes");

if (form) {
  const aviso = document.getElementById("grandes-plazo");
  const cantidadDe = () => Number(form.elements.cantidad.value);

  const pintarPlazo = () => {
    const { justo, texto } = avisoDePlazo(cantidadDe(), form.elements.fecha.value);
    aviso.textContent = texto;
    aviso.classList.toggle("justo", justo);
  };

  form.elements.fecha.min = isoLocal(new Date());
  form.addEventListener("input", pintarPlazo);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const datos = new FormData(form);
    const cantidad = cantidadDe();
    const fecha = String(datos.get("fecha"));
    const texto = mensajeCotizacion(
      {
        cantidad,
        ocasion: String(datos.get("ocasion")),
        fecha,
        zona: String(datos.get("zona")).trim(),
        nombre: String(datos.get("nombre")).trim(),
      },
      avisoDePlazo(cantidad, fecha).justo
    );
    const url = urlWhatsApp(texto);
    // Si el navegador bloquea la pestaña nueva, se abre en esta misma.
    const ventana = window.open(url, "_blank");
    if (ventana) ventana.opener = null;
    else window.location.href = url;
  });
}
