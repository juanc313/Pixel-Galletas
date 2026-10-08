// Datos de contacto de la marca (tomados del modelo DYME Pixel Galletas).
// Un solo lugar para cambiarlos si el número o el usuario de Instagram cambian.
export const CONTACTO = {
  // Formato internacional sin "+" ni espacios, para armar enlaces wa.me
  whatsapp: "573137839935",
  whatsappTexto: "313 783 9935",
  instagram: "pixel_galletas",
  instagramUrl: "https://www.instagram.com/pixel_galletas/",
  ubicacion: "Ceiba 2, Cúcuta, Norte de Santander",
  ubicacionUrl: "https://www.google.com/maps/search/?api=1&query=Ceiba%202%2C%20C%C3%BAcuta%2C%20Norte%20de%20Santander",
  propuestaValor: "De la pantalla a tu paladar",
};

// Arma un enlace de WhatsApp con el mensaje ya escrito.
export function urlWhatsApp(texto, numero = CONTACTO.whatsapp) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
