import { CONTACTO, urlWhatsApp } from "./config.js";

// Rellena los enlaces de contacto de la página (WhatsApp, Instagram y ubicación).
// Existe como módulo propio para poder probarlo sin navegador.
export function enlazarContacto(doc = document) {
  const mensaje = "¡Hola Pixel Galletas! Vengo de su página web y quiero hacer un pedido 🍪";
  const poner = (id, href, texto) => {
    const el = doc.getElementById(id);
    if (!el) return;
    el.href = href;
    if (texto !== undefined) el.textContent = texto;
  };
  poner("link-whatsapp", urlWhatsApp(mensaje));
  poner("link-whatsapp-fijo", urlWhatsApp(mensaje));
  // Botón fijo de la esquina ("Pedir por WhatsApp"): es el enlace más visible
  // de la página y sin esta línea se quedaba en href="#" —pulsarlo no hacía
  // nada—, porque es el único que no vive dentro de una sección con contacto.
  poner("link-whatsapp-fijo-barra", urlWhatsApp(mensaje));
  poner("link-instagram", CONTACTO.instagramUrl, `@${CONTACTO.instagram}`);
  poner("link-ubicacion", CONTACTO.ubicacionUrl, CONTACTO.ubicacion.split(",")[0]);
  // Enlaces del pie de página (mismos datos, otro lugar de la página).
  poner("link-whatsapp-pie", urlWhatsApp(mensaje));
  poner("link-instagram-pie", CONTACTO.instagramUrl);
  poner("link-ubicacion-pie", CONTACTO.ubicacionUrl);
  // Suscripción a la caja mensual (mensaje distinto al del pedido general).
  poner("link-caja-mensual", urlWhatsApp("¡Hola Pixel Galletas! Vengo de su página web y me interesa la caja mensual (6 o 12 galletas al mes) 📦"));
  // Banda de acción "Power up": su propio enlace de WhatsApp.
  poner("link-powerup-wa", urlWhatsApp(mensaje));
  // Comunidad: proponer sabores al obrador (tono distinto, más de conversación).
  poner("link-comunidad", urlWhatsApp("¡Hola Pixel Galletas! Vengo de su página web y les cuento la idea de sabor que tengo 🎮🍪"));
}

// Solo arranca cuando existe la página.
if (typeof document !== "undefined") enlazarContacto();
