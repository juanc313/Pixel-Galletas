# Pixel Galletas — Aplicación web (EV02)

Aplicación web de la marca **Pixel Galletas**: catálogo público de galletas, acceso con cuentas
(autenticación) y paneles de administración de productos y usuarios. Incluye **backend** (API REST con
Node.js, Express y MySQL) y **frontend** (HTML, CSS y JavaScript con clases), conectados por la API.

## Requisitos
- Node.js (versión LTS) y npm
- MySQL Server 8.0 (se usó MySQL Workbench para ejecutar el script)

## Puesta en marcha
1. Instalar dependencias: `npm install`
2. Crear la base de datos: abrir `database/schema.sql` en MySQL Workbench y ejecutarlo completo.
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
| `JWT_SECRET` | Clave para firmar los tokens. **Obligatoria**: sin ella el servidor no inicia |

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
| GET | `/api/pedidos` y `/api/pedidos/:id` | Solo `admin` |
| PUT | `/api/pedidos/:id/estado` | Solo `admin` (`pendiente`, `en_preparacion`, `listo`, `entregado`, `cancelado`) |

El token se envía en la cabecera `Authorization: Bearer <token>`. Un token inválido responde **401**;
una acción sin permisos responde **403**.

## Guía de uso
- **Visitante:** ve el catálogo sin iniciar sesión, agrega galletas al carrito y hace su pedido con nombre y teléfono.
- **Cliente:** crea su cuenta desde **Acceso → Crear cuenta** e inicia sesión; al pedir con sesión, el pedido queda asociado a su cuenta.
- **Flujo del pedido:** carrito → formulario (nombre, teléfono, dirección opcional, notas) → el servidor guarda el pedido
  con los precios vigentes → aparece un botón **Enviar por WhatsApp** con el resumen ya escrito para confirmar el pedido.
- **Administrador:** al iniciar sesión aparecen *Administrar catálogo* (agregar, editar y eliminar galletas),
  *Pedidos recibidos* (cambiar estado de cada pedido) y *Usuarios* (cambiar rol y eliminar cuentas).
  No puede eliminarse ni quitarse el rol a sí mismo.
- **Contacto:** la sección Contacto enlaza WhatsApp (313 783 9935), Instagram (@pixel_galletas) y la ubicación
  (Ceiba 2, Cúcuta). Esos datos viven en `public/js/config.js`.

## Pruebas
`npm test` ejecuta 26 pruebas automáticas (API, lógica del frontend, pantalla de acceso y pedidos/carrito/WhatsApp).
Usan una base de datos simulada en memoria, por lo que no necesitan MySQL. Las pruebas manuales sobre MySQL real
están en `docs/PLAN_DE_PRUEBAS.md`.

## Seguridad aplicada y limitaciones conocidas
- Contraseñas con hash bcrypt; consultas SQL parametrizadas; el texto del frontend se inserta con `textContent`.
- El rol se verifica en la base de datos en cada petición protegida, no solo en el token.
- Limitaciones: las respuestas de error 500 incluyen un campo `detalle`; no hay límite de intentos de inicio de
  sesión; el token se guarda en `localStorage`; el servidor funciona por HTTP (uso local).
