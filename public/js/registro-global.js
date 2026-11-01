// Listeners globales que se pueden volver a registrar sin duplicarse.
// Al navegar sin recargar, los módulos se vuelven a ejecutar: con esto cada
// clave (p. ej. "pedidos:agregar-al-carrito") conserva un único handler.
const registrados = new Map();

export function escucharGlobal(clave, evento, handler, destino = window) {
  const existente = registrados.get(clave);
  if (existente) {
    existente.handler = handler;
    return;
  }
  const entrada = { handler };
  registrados.set(clave, entrada);
  destino.addEventListener(evento, (e) => entrada.handler(e));
}
