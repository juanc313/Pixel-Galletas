# Pixel Galletas — Aplicación web (EV02)

Aplicación web de la marca **Pixel Galletas**: catálogo público de galletas, acceso con cuentas
(autenticación) y paneles de administración de productos y usuarios. Incluye **backend** (API REST con
Node.js, Express y MySQL) y **frontend** (HTML, CSS y JavaScript con clases), conectados por la API.

## Requisitos
- Node.js (versión LTS) y npm
- MySQL Server 8.0 (se usó MySQL Workbench para ejecutar el script)

## Puesta en marcha
1. Instalar dependencias: `npm install`
2. Para una base nueva y vacía, abrir `database/schema.sql` en MySQL Workbench y ejecutarlo completo. **No ejecutar el script completo sobre una base existente sin revisarlo y respaldarla:** contiene `DELETE` y `UPDATE` que pueden borrar sabores y modificar precios o descripciones. Para actualizar una base existente, revisar y aplicar únicamente las migraciones necesarias.
3. Copiar `.env.example` como `.env` y completar los valores (contraseña de MySQL y un `JWT_SECRET` propio).
4. Crear el primer administrador: `npm run crear-admin`
5. Iniciar el servidor: `npm start` y abrir `http://localhost:3000`

## Variables de entorno (`.env`)
| Variable | Descripción |
|---|---|
| `DB_HOST`, `DB_PORT` | Servidor y puerto de MySQL (por defecto `localhost` y `3306`) |
| `DB_USER`, `DB_PASSWORD` | Usuario y contraseña de MySQL |
| `DB_NAME` | Nombre de la base (`pixel_galletas_api`) |
| `PORT` | Puerto de la aplicación (por defecto `3000`) |
| `SITIO_URL` | Dominio público (`https://…`). Activa `/sitemap.xml`; vacía, el sitemap responde 404 |
| `DB_SSL` | `true` para conectar con TLS (obligatorio en Aiven); `false` en local |
| `DB_SSL_CA` | Ruta al `ca.pem` del proveedor (para servidores con archivos propios) |
| `DB_SSL_CA_PEM` | El mismo certificado como texto, con `\n` literales si va en una línea. Es el que se usa en Vercel y manda sobre `DB_SSL_CA` |
| `DB_SSL_VERIFY` | `false` omite verificar el certificado; por defecto se verifica |
| `JWT_SECRET` | Clave para firmar los tokens. **Obligatoria**: sin ella el servidor no inicia. En producción debe tener al menos 32 caracteres |
| `CRON_SECRET` | Secreto del cron de Vercel que purga eventos antiguos. Sin él, la ruta de purga no existe |
| `TRUST_PROXY` | Número de proxies delante de la app, para que los límites de tasa cuenten al cliente real. En Vercel no hace falta |
| `ORIGENES_PERMITIDOS` | Orígenes extra que pueden llamar a la API, separados por comas. Normalmente vacía |
| `TELEGRAM_BOT_TOKEN` | Llave del bot de Telegram que avisa al obrador de cada pedido nuevo (opcional) |
| `TELEGRAM_CHAT_ID` | Chat que recibe el aviso (opcional). Sin las dos variables, el aviso no sale y nada más cambia |

## Estructura
```
database/schema.sql      Script de la base de datos (usuarios, productos, pedidos y detalle)
scripts/crearAdmin.js    Crea el primer administrador
server.js                Punto de entrada en local
api/index.js             Punto de entrada en Vercel
src/                     Backend: config, models, controllers, middlewares, routes
public/                  Frontend: index.html, css/, img/ (logo y fotos), js/
                         (api.js, auth.js, productos.js, pedidos.js, contacto.js, config.js, usuarios.js)
tests/                   Pruebas automáticas
docs/PLAN_DE_PRUEBAS.md  Casos de prueba manuales y automáticos
```

## API REST
| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/usuarios/registro` | Público (siempre crea rol `cliente`) |
| POST | `/api/usuarios/login` | Público (devuelve token JWT de 2 horas) |
| GET · PUT · DELETE | `/api/usuarios` y `/api/usuarios/:id` | Solo `admin` |
| GET | `/api/productos` y `/api/productos/:id` | Público |
| POST · PUT · DELETE | `/api/productos` y `/api/productos/:id` | Solo `admin` |
| POST | `/api/pedidos` | Público (sin cuenta; el total lo calcula el servidor) |
| POST | `/api/pedidos/estado` (cuerpo JSON `{ id, telefono }`) | Público (sin cuenta: exige número de pedido Y teléfono; devuelve solo estado, fecha, total y lo pedido). Es POST para que el teléfono no quede en URLs, logs ni historial |
| GET | `/api/pedidos?pagina=1&limite=50` (límite máximo 100) y `/api/pedidos/:id` | Solo `admin` |
| PUT | `/api/pedidos/:id/estado` | Solo `admin` (`pendiente`, `en_preparacion`, `listo`, `entregado`, `cancelado`) |

El token se envía en la cabecera `Authorization: Bearer <token>`. Un token inválido responde **401**;
una acción sin permisos responde **403**.

## Guía de uso
- **Visitante:** ve el catálogo sin iniciar sesión, agrega galletas al carrito y hace su pedido con nombre y teléfono.
- **Cliente:** crea su cuenta desde **Acceso → Crear cuenta** e inicia sesión; al pedir con sesión, el pedido queda asociado a su cuenta.
- **Flujo del pedido:** carrito → formulario (nombre, teléfono, dirección opcional, notas) → el servidor guarda el pedido
  con los precios vigentes → aparece un botón **Enviar por WhatsApp** con el resumen ya escrito para confirmar el pedido.
- **Estado del pedido:** la sección *Estado del pedido* (sin cuenta) consulta con el número de pedido y el teléfono con el que
  se hizo. El servidor compara los teléfonos ignorando espacios, guiones y el +57, y solo devuelve estado, fecha, total y lo
  pedido: nunca el nombre, la dirección ni el teléfono de quien pidió.
- **Administrador:** al iniciar sesión aparecen *Administrar catálogo* (agregar, editar y eliminar galletas),
  *Pedidos recibidos* (cambiar estado de cada pedido) y *Usuarios* (cambiar rol y eliminar cuentas).
  No puede eliminarse ni quitarse el rol a sí mismo.
- **Inventario del obrador:** en el panel, *Unidades disponibles* deja el sabor con unidades contadas
  (cada pedido las descuenta y cancelar un pedido las devuelve), en **0** queda agotado (el sitio desactiva
  el botón y no acepta pedidos) y **vacío** significa que se hornea bajo pedido, sin límite. Desde la misma
  tarjeta del catálogo, el botón *Marcar agotado* / *Volver a disponible* hace lo mismo en un clic.
- **Descuentos por volumen:** 12 galletas un 5%, 24 un 8% y 48 o más un 10%. El carrito muestra subtotal,
  ahorro y total, y el servidor vuelve a calcularlo al guardar el pedido (nunca acepta el total del navegador).
- **Aviso al obrador:** con las variables de Telegram configuradas, cada pedido nuevo llega al chat del obrador
  con cliente, teléfono, dirección, sabores y total. Si Telegram falla, el pedido igual queda guardado.
- **Contacto:** la sección Contacto enlaza WhatsApp (313 783 9935), Instagram (@pixel_galletas) y la ubicación
  (Ceiba 2, Cúcuta). Esos datos viven en `public/js/config.js`.
- **Entrega:** Cúcuta, Villa del Rosario, Los Patios y El Zulia. Domicilio $5.000 en Cúcuta y $7.000 en los
  alrededores, más un cargo por distancia desde el Centro Comercial La Estrella ($2.000 de 0 a 3 km, $4.000 de 3 a
  6 km y $6.000 a más de 6 km). Desde 12 galletas el domicilio es gratis, distancia incluida; recoger en Ceiba 2
  siempre gratis. El cobro sale de `src/config/envio.js` y `src/config/distancia.js`, con su copia en
  `public/js/pedidos.js`. Los textos están en cuatro sitios: en `public/index.html`, las preguntas frecuentes (la
  sección visible y los datos estructurados del `<head>`), «Cómo se entrega y se paga» y las opciones del formulario
  de pedido; y en `public/preguntas-gamer.html`. Si cambian los números, hay que tocarlos en todos. `tests/mensajes.test.js`
  avisa si un texto se queda sin la distancia.
- **Teléfono:** al pedir y al consultar el estado se exigen de 7 a 15 dígitos; puede llevar `+`, espacios o guiones.

## Pruebas
`npm test` ejecuta 146 pruebas automáticas (API, lógica del frontend, pantalla de acceso, pedidos/carrito/WhatsApp,
inventario del obrador, aviso por Telegram, seguridad, límites de tasa, PWA y textos de la tienda). Usan una base de datos simulada en memoria, por lo que no necesitan
MySQL. Las pruebas manuales sobre MySQL real están en `docs/PLAN_DE_PRUEBAS.md`.

Dos pruebas cuidan de que el precio que ve el cliente sea el que se cobra: una compara la escalera de descuentos
del frontend con la del servidor, y las de inventario comprueban que un pedido rechazado por falta de unidades no
descuente nada (ni al guardar ni al cancelar).

## Despliegue actual: Vercel + Aiven

La tienda está publicada en Vercel (https://pixel-galletas.vercel.app) y la base de datos es un MySQL de Aiven.
Vercel sirve `public/` directamente, y `api/index.js` atiende `/api/*` y `/sitemap.xml` como función
(`vercel.json`). `.vercelignore` deja fuera del sitio publicado lo que no debe salir: secretos, pruebas,
documentación y la herramienta interna de fotos (`public/_fotos-dyme.html` y `public/img/_dyme/`).

**Variables en Vercel** (Settings → Environment Variables): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME`, `DB_SSL=true`, `DB_SSL_CA_PEM` (el certificado de Aiven como texto), `JWT_SECRET`, `CRON_SECRET` y
`SITIO_URL`. Si además quieres el aviso por Telegram: `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.

Si `JWT_SECRET` falta o tiene menos de 32 caracteres, la API de producción no arranca a medias: responde **503** con
`codigo: "JWT_SECRET_INVALIDO"` y deja el motivo en los registros de Vercel.

**Si el servicio de Aiven se detiene, la tienda se cae.** El plan gratis de Aiven (1 GB) puede apagarse sin aviso.
La página carga, pero el catálogo, los pedidos y el acceso dependen de la base y responden 500 con un `codigo` de
conexión (como `ETIMEDOUT`, `ECONNREFUSED` o `ENOTFOUND`). Se arregla encendiendo otra vez el servicio en la
consola de Aiven. Para una tienda que recibe pedidos, conviene un plan que no se apague.

**Esquema:** ejecutar `database/schema.sql` solo contra una base nueva y vacía. No volver a ejecutar el script
completo sobre datos existentes sin revisar y respaldar la base: incluye operaciones que borran sabores y
modifican algunos precios o descripciones. Para una base existente, aplicar solo las migraciones necesarias.

**Administrador:** correr `npm run crear-admin` apuntando a esa base para poder entrar al panel.

## Seguridad aplicada y limitaciones conocidas
- Contraseñas con hash bcrypt; consultas SQL parametrizadas; el texto del frontend se inserta con `textContent`.
- El rol se verifica en la base de datos en cada petición protegida, no solo en el token.
- Medición propia (analítica): eventos anónimos en la tabla `eventos`, sin cookies ni terceros. No se guarda IP,
  ni nombre, ni ningún dato que identifique a una persona; `visita` es un número al azar que el navegador guarda
  en `sessionStorage` y muere al cerrar la pestaña. El endpoint `POST /api/eventos` acepta solo tres eventos
  (`sabor_visto`, `carrito_agregar`, `checkout_iniciado`) y el resumen es solo del admin.
- Límites de tasa: inicio de sesión, registro, pedidos, consulta de estado y una red general para `/api`.
  Detrás de un proxy, se activa con `TRUST_PROXY=1` para contar al cliente real.
- Los errores 500 responden un mensaje genérico y, si lo hay, el `codigo` del error de MySQL o de red
  (por ejemplo `ER_ACCESS_DENIED_ERROR` o `ETIMEDOUT`) para poder diagnosticar. El código no revela usuario, host
  ni SQL; el detalle completo va al log del servidor.
- Cabeceras de seguridad con helmet y una CSP estricta: sin scripts inline (el arranque está en `public/js/arranque.js`)
  y sin estilos inline salvo los atributos `style` de las brasas (`style-src-attr`).
- Retención: los eventos de la medición de más de 180 días se borran al arrancar y cada 24 horas.
- Limitaciones: el token se guarda en `localStorage`; en local el servidor funciona por HTTP (Vercel publica por HTTPS); `POST /api/eventos`
  es público (un script puede inflar la medición, aunque no puede tocar precios ni pedidos).
- Integración continua: `.github/workflows/ci.yml` instala con el lockfile, verifica sintaxis y ejecuta `npm test`.
