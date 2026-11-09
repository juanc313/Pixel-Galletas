// Página sin conexión: el service worker la entrega en la misma dirección que
// el cliente quería abrir, así que recargar es volver a intentarlo.
document.getElementById("offline-reintentar").addEventListener("click", () => location.reload());
window.addEventListener("online", () => location.reload());
