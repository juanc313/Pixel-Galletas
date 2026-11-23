# Registro de versiones de Pixel Galletas

Cada actualización tiene su número y su nombre. Las versiones grandes suben el
segundo número (1.9 → 1.10) y los arreglos pequeños entre una y otra van como
parches (1.10.1, 1.10.2…).

---

## 1.13.1 · Parche
*23 de noviembre de 2026*

- «Enviar por WhatsApp» abre **directo el chat de Pixel Galletas**. En el
  celular, el botón con la foto abría «Compartir» del sistema (varias apps) y
  en WhatsApp había que buscar el chat entre todos los contactos.
- La foto llega igual: el mensaje lleva el enlace a la página del sabor
  (`/s/monster.html`…), y WhatsApp muestra la foto de la galleta en el chat.
- La imagen del pedido se sigue mostrando y se puede guardar para adjuntarla.

## 1.13 · Pedido con foto
*22 de noviembre de 2026*

- **Foto del pedido para WhatsApp:** al confirmar, el sitio arma una imagen con
  las galletas elegidas (foto real de cada sabor, cantidades y total). En el
  celular, «Enviar por WhatsApp con la foto» abre Compartir con la imagen y el
  mensaje; en el computador se puede guardar para adjuntarla en WhatsApp Web.
- **Formulario de pedido más claro:** cada campo dice qué dato va y trae un
  ejemplo («Tu nombre y apellido», «Tu WhatsApp», dirección con barrio y punto
  de referencia).
- **Pixelito revisa lo que escribes:** al salir de cada campo ordena espacios y
  mayúsculas del nombre y corrige errores comunes («porfavor» → «por favor»), y
  avisa qué cambió. El navegador subraya el resto de errores de ortografía.
- **El botón «Acceso» ahora lleva al cuadro:** si estabas más abajo en la
  página, sube hasta iniciar sesión / crear cuenta y deja el cursor listo.

## 1.12.2 · Parche
*22 de noviembre de 2026*

- Si la sesión de admin vence (dura 2 horas), los paneles «Pedidos recibidos» y
  «Usuarios» ya no se quedan mostrando «Token inválido o expirado»: la página
  avisa que la sesión venció y abre el cuadro para entrar de nuevo.

## 1.12.1 · Parche
*21 de noviembre de 2026*

- Pixel Galletas trabaja por encargo: el sitio recibe pedidos a cualquier hora,
  todos los días, y el día de entrega se acuerda por WhatsApp.
- Se quitan las frases que prometían entregas el mismo día.
- Nueva pregunta frecuente: «¿Cuándo me entregan mi pedido?».
- Pixelito explica el encargo cuando habla del domicilio.

## 1.12 · Las reglas del juego
*21 de noviembre de 2026*

- Nueva página de **política de privacidad**: qué datos pide el sitio, para qué,
  quién los guarda y cómo pedir que se corrijan o se borren (Ley 1581 de 2012).
- Nueva página de **términos y condiciones**: pedidos, precios, pago, entregas,
  pedidos grandes, cancelaciones, garantía y alérgenos.
- Aviso de privacidad junto a «Hacer pedido» y «Crear cuenta», y enlaces a las
  dos páginas en el pie.
- El punto de recogida pasa a ser el Centro Comercial La Estrella.

## 1.11.1 · Parche
*21 de noviembre de 2026*

- Al compartir el enlace del sitio por WhatsApp o redes, ahora sale la vista
  previa con foto en todas las páginas públicas.
- Mientras carga el menú de galletas aparecen tarjetas de "cargando" en vez de
  un espacio vacío.
- El catálogo cuenta "sabores" y no "galletas", y se quita el contador suelto
  que parecía un error.
- Se agrega el aviso de licencia de las letras del sitio.

## 1.11 · Pixelito ya te conoce
*21 de noviembre de 2026*

- **¿Lo de siempre?** Si ya pediste antes, con el carrito vacío aparece tu último
  pedido y lo repites con un toque, con los precios y existencias de hoy.
- **Logros:** 9 medallas para ganar comprando y jugando, como tu primera galleta,
  armar un combo, llegar al descuento máximo o jugar en la sala de juegos.
  Pixelito te avisa cuando ganas una, y las ves todas en «Mis logros».
- Pixelito recuerda la conversación: ya no se presenta dos veces, retoma lo que
  estaban hablando y te sugiere el siguiente paso.
- La primera vez que tocas un tema del chat, Pixelito te explica de qué se trata
  antes de darte los detalles, y te dice qué hace cada botón.
- Nuevo tema en el chat: las fichas de personaje de los sabores, qué significa
  cada barra y quién es quién.

## 1.10 · Pixelito se pone expresivo
*20 de noviembre de 2026*

- Pixelito vuela como superhéroe en la barra de poder del carrito.
- Estrena 12 caras nuevas y cambia de expresión según lo que pasa:
  - Saluda con la mano cuando el carrito está vacío y al darte la bienvenida.
  - Guiña el ojo cuando agregas tu primera galleta o armas un combo.
  - Explica con el dedo alzado cuando te falta poco para el descuento.
  - Mira su reloj si dejas el carrito quieto un rato.
  - En el chat se queda pensando mientras escribe y explica cuando responde.
  - Salta con confeti cuando completas tu pedido.
- La misión del pedido tiene a Pixelito en cada etapa: con su lista al recibirlo,
  de chef en el horno, con el regalo cuando está listo y con el trofeo al entregarlo.
- En la página de error aparece confundido, y en la de sin conexión, dormido.
- El botón del chat ya no tiene un cuadro detrás: ahora solo se ve Pixelito.

## 1.9 · Tu pedido, paso a paso
*19 de noviembre de 2026*

- El pedido se muestra como una misión de cuatro etapas, en la confirmación y en
  "¿Dónde va mi pedido?".
- Desde el aviso de Telegram se puede pasar el pedido a la siguiente etapa con un toque.
- Pixelito recuerda por Telegram los pedidos que llevan dos horas sin moverse.
- Se prepara la base de datos para una posible mudanza a TiDB.

## 1.8 · Hola, soy Pixelito
*10 de noviembre de 2026*

- Llega Pixelito, la mascota, que conversa con los clientes y les ayuda a escoger.
- El carrito se convierte en una barra de poder que sube de nivel con cada descuento,
  y al terminar el pedido aparece la pantalla de nivel completado.
- Efectos de sonido de 8 bits propios de Pixel Galletas.
- Cada sabor tiene su ficha de personaje en el catálogo.
- La app avisa cuando hay una versión nueva disponible.
- Copia de seguridad mensual de la base de datos.
- Portada más corta en el celular y ajustes en el catálogo.

## 1.7 · Todo en su punto
*8 y 9 de noviembre de 2026*

- Ya no se crean pedidos dobles por tocar dos veces "Hacer pedido".
- Se arregla el flujo de compra: combos, carrito guardado, sesión vencida y entrega.
- La app instalable funciona mejor con internet lento y sin conexión.
- El tema claro pasa a ser un arcade de día.
- Precios actualizados, costo del domicilio más claro y validación del teléfono.
- El carrito de una cuenta ya no se mezcla con el de otra.
- Pedidos grandes con cotización por WhatsApp.
- Vuelve la entrega gratis en la caja mensual x6.

## 1.6 · De día y de noche
*6 y 7 de noviembre de 2026*

- Se puede elegir entre tema oscuro y tema claro.
- Perfil gamer opcional en el menú de entrada.
- La entrada se decora como una máquina recreativa y se puede jugar, con nubes,
  arbolitos y galletitas caminando.
- En contacto, las galletas orbitan alrededor del logo con sus estelas.
- Modo atracción, tarjeta de combo para compartir y recordatorio de la caja mensual.
- La música elige una canción al azar en cada página.
- Arreglos para el celular en el formulario de pedido y en el seguimiento.

## 1.5 · Así las hacemos
*2 y 3 de noviembre de 2026*

- Fotos reales en la historia de la marca.
- Videos del proceso en el combo personalizado, hasta las galletas entrando al horno.
- Los videos pesan menos y cargan solo cuando aparecen en pantalla.

## 1.4 · Bienvenido a la sala arcade
*31 de octubre de 2026*

- Nueva pantalla de entrada con estilo arcade.
- Radio de música que sigue sonando al cambiar de página.
- Páginas gamer: preguntas frecuentes, memoria 8-bit y más.
- Pixel Galletas se puede instalar como app en el celular.
- Pie de página más ordenado.

## 1.3 · Tu carrito te espera
*24 de octubre de 2026*

- El carrito queda guardado en tu cuenta.
- Combos Special Edition.
- Más seguridad en toda la tienda.
- Galería de evidencias para asignar fotos a cada sabor.

## 1.2 · Ya estamos en internet
*13 y 14 de octubre de 2026*

- La tienda se publica en internet con Vercel, y la base de datos vive en Aiven.
- Limpieza automática programada y mapa del sitio para los buscadores.

## 1.1 · Con sabor a videojuego
*9 y 10 de octubre de 2026*

- Nuevo diseño retro, como un videojuego clásico.
- Cajas Pixel, fotos reales de las galletas y descuentos por cantidad.
- Mejor accesibilidad para todos.

## 1.0 · Recién salidas del horno
*8 de octubre de 2026*

- Primera versión de Pixel Galletas: catálogo, carrito y pedidos.
- Base de datos con conexión segura para funcionar en la nube.
