// Recordatorio de la caja mensual: descarga un evento .ics que el teléfono
// guarda en su calendario. Sin permisos de notificaciones, sin servidor y
// sin suscripción: un archivo que el propio sistema abre.
const boton = document.getElementById("btn-recordar-mensual");
const aviso = document.getElementById("mensual-recordatorio");

const dos = (n) => String(n).padStart(2, "0");
const fechaLocal = (d) =>
  `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}T${dos(d.getHours())}${dos(d.getMinutes())}00`;

// El 1.º del mes siguiente a las 10:00, hora local: el aviso llega con el mes
// empezando, así hay tiempo de elegir sabores antes de la primera entrega.
function proximaFecha() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1, 10, 0, 0);
}

if (boton) {
  boton.addEventListener("click", () => {
    const inicio = proximaFecha();
    const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
    const escapar = (texto) =>
      texto.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    // DTSTART va en hora local flotante (sin Z ni TZID): el calendario lo
    // interpreta en la zona del teléfono, que es justo lo que queremos.
    const evento = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Pixel Galletas//Caja mensual//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:caja-mensual-${inicio.getTime()}@pixel-galletas`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART:${fechaLocal(inicio)}`,
      `DTEND:${fechaLocal(fin)}`,
      `SUMMARY:${escapar("Pedir mi caja mensual Pixel Galletas")}`,
      `DESCRIPTION:${escapar("Elige sabores y confirma por WhatsApp al 313 783 9935. Entrega gratis en Cúcuta y alrededores.")}`,
      `URL:${location.origin}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([evento], { type: "text/calendar;charset=utf-8" }));
    enlace.download = "caja-mensual-pixel-galletas.ics";
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);

    if (aviso) {
      aviso.textContent = "Recordatorio descargado: ábrelo para guardarlo en tu calendario.";
      setTimeout(() => {
        if (aviso.textContent.startsWith("Recordatorio")) aviso.textContent = "";
      }, 8000);
    }
  });
}
