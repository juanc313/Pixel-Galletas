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
| `JWT_SECRET` | Clave para firmar los tokens. **Obligatoria**: sin ella el servidor no inicia |
| `TELEGRAM_BOT_TOKEN` | Llave del bot de Telegram que avisa al obrador de cada pedido nuevo (opcional) |
| `TELEGRAM_CHAT_ID` | Chat que recibe el aviso (opcional). Sin las dos variables, el aviso no sale y nada más cambia |

## Estructura
```
database/schema.sql      Script de la base de datos (usuarios, productos, pedidos y detalle)
scripts/crearAdmin.js    Crea el primer administrador
server.js                Punto de entrada
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
  alrededores, gratis desde 12 galletas; recoger en Ceiba 2 siempre gratis. Esos números están en el HTML
  (FAQ, «Cómo se entrega y se paga», Power up y caja mensual): si cambian, hay que tocarlos en esos cuatro sitios.

## Pruebas
`npm test` ejecuta 63 pruebas automáticas (API, lógica del frontend, pantalla de acceso, pedidos/carrito/WhatsApp,
inventario del obrador y aviso por Telegram). Usan una base de datos simulada en memoria, por lo que no necesitan
MySQL. Las pruebas manuales sobre MySQL real están en `docs/PLAN_DE_PRUEBAS.md`.

Dos pruebas cuidan de que el precio que ve el cliente sea el que se cobra: una compara la escalera de descuentos
del frontend con la del servidor, y las de inventario comprueban que un pedido rechazado por falta de unidades no
descuente nada (ni al guardar ni al cancelar).

## Desplegar en DigitalOcean (App Platform + MySQL gestionado)

Elegido porque la app es un Express con pool de conexiones que debe estar siempre encendido: Vercel ejecuta
funciones que se suspenden y hay que adaptar el pool (`attachDatabasePool`), así que no encaja tal cual.
Costo de referencia (octubre de 2026): US$5/mes el contenedor de 512 MiB + US$15/mes el MySQL gestionado de
un nodo, más el dominio al registrador (unos US$10-15 al año).

1. **Base de datos:** crear un clúster *Managed MySQL* en la misma región que la app. Anotar host, puerto,
   usuario, contraseña y nombre de la base.
2. **App:** en App Platform, *Create App* desde el repositorio de GitHub. Detecta Node solo; el comando de
   arranque es `npm start` y el puerto lo toma de `PORT`, que DigitalOcean inyecta.
3. **Variables de entorno** (Settings → Environment): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
   `DB_NAME`, `JWT_SECRET` y **`DB_SSL=true`** (la base gestionada exige TLS; `db.js` ya lo soporta).
   Si además quieres el aviso por Telegram: `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.
4. **Esquema:** ejecutar `database/schema.sql` contra un clúster nuevo y vacío. No volver a ejecutar el script
   completo sobre datos existentes sin revisar y respaldar la base: incluye operaciones que borran sabores y
   modifican algunos precios o descripciones. Para una base existente, aplicar solo las migraciones necesarias.
5. **Administrador:** correr `npm run crear-admin` apuntando a esa base (o crearlo desde la consola del
   contenedor) para poder entrar al panel.
6. **Dominio:** añadirlo en el App Platform y apuntar los DNS del registrador; el certificado TLS se emite solo.

Sobre límites de los planes gratuitos, por si se comparan: el servicio gratis de Render duerme a los 15 minutos
sin tráfico y su base gratuita es PostgreSQL (caduca a los 30 días); el MySQL gratis de Aiven tiene 1 GB y
puede apagarse sin aviso. Para una tienda que recibe pedidos, conviene un plan que no duerma.

## Seguridad aplicada y limitaciones conocidas
- Contraseñas con hash bcrypt; consultas SQL parametrizadas; el texto del frontend se inserta con `textContent`.
- El rol se verifica en la base de datos en cada petición protegida, no solo en el token.
- Medición propia (analítica): eventos anónimos en la tabla `eventos`, sin cookies ni terceros. No se guarda IP,
  ni nombre, ni ningún dato que identifique a una persona; `visita` es un número al azar que el navegador guarda
  en `sessionStorage` y muere al cerrar la pestaña. El endpoint `POST /api/eventos` acepta solo tres eventos
  (`sabor_visto`, `carrito_agregar`, `checkout_iniciado`) y el resumen es solo del admin.
- Límites de tasa: inicio de sesión, registro, pedidos, consulta de estado y una red general para `/api`.
  Detrás de un proxy, se activa con `TRUST_PROXY=1` para contar al cliente real.
- Los errores 500 responden solo un mensaje genérico; el detalle va al log del servidor.
- Cabeceras de seguridad con helmet y una CSP estricta: sin scripts inline (el arranque está en `public/js/arranque.js`)
  y sin estilos inline salvo los atributos `style` de las brasas (`style-src-attr`).
- Retención: los eventos de la medición de más de 180 días se borran al arrancar y cada 24 horas.
- Limitaciones: el token se guarda en `localStorage`; el servidor funciona por HTTP (uso local); `POST /api/eventos`
  es público (un script puede inflar la medición, aunque no puede tocar precios ni pedidos).
- Integración continua: `.github/workflows/ci.yml` instala con el lockfile, verifica sintaxis y ejecuta `npm test`.
