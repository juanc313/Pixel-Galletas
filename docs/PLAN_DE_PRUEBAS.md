# Plan de pruebas — Pixel Galletas (EV02)

**Entorno:** Windows, Node.js LTS, MySQL Server 8.0, navegador Brave, servidor en `http://localhost:3000`.
**Datos de partida:** base creada con `schema.sql` y un administrador creado con `npm run crear-admin`.

## 1. Pruebas manuales (interfaz, con MySQL real)
Marque el resultado y adjunte captura como evidencia.

| ID | Módulo | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|
| CP-01 | Catálogo | Abrir la página sin iniciar sesión | Se ven las 6 galletas con precio y botón **＋ Carrito**; no hay botones de administración | ☐ Pasó ☐ Falló |
| CP-02 | Registro | Acceso → Crear cuenta con nombre, correo y contraseña de 6+ caracteres | Entra automáticamente con **Rol: cliente** | ☐ Pasó ☐ Falló |
| CP-03 | Registro | Crear cuenta con contraseña de 3 caracteres | El formulario no la acepta | ☐ Pasó ☐ Falló |
| CP-04 | Registro | Crear cuenta con un correo ya registrado | Mensaje en rojo; no crea la cuenta | ☐ Pasó ☐ Falló |
| CP-05 | Login | Entrar con contraseña incorrecta | Mensaje rojo "Credenciales inválidas" | ☐ Pasó ☐ Falló |
| CP-06 | Login | Entrar como administrador | El botón muestra el nombre; aparecen *Administrar catálogo* y *Usuarios* | ☐ Pasó ☐ Falló |
| CP-07 | Cliente | Entrar como cliente | Ve el catálogo sin Editar/Eliminar ni paneles de administración | ☐ Pasó ☐ Falló |
| CP-08 | Productos | Admin: agregar una galleta de prueba | Aparece en el catálogo con "Producto creado." | ☐ Pasó ☐ Falló |
| CP-09 | Productos | Admin: editar el precio de una galleta | El catálogo muestra el precio nuevo | ☐ Pasó ☐ Falló |
| CP-10 | Productos | Admin: eliminar la galleta de prueba | Pide confirmación y desaparece | ☐ Pasó ☐ Falló |
| CP-11 | Usuarios | Admin: ver la lista de usuarios | Aparecen las cuentas con correo y fecha | ☐ Pasó ☐ Falló |
| CP-12 | Usuarios | Admin: cambiar el rol de una cuenta de prueba | "Rol actualizado."; el cambio persiste al recargar | ☐ Pasó ☐ Falló |
| CP-13 | Usuarios | Admin: eliminar la cuenta de prueba | Pide confirmación y desaparece | ☐ Pasó ☐ Falló |
| CP-14 | Usuarios | Revisar la fila propia del admin | Marcada "(tú)" con rol y Eliminar desactivados | ☐ Pasó ☐ Falló |
| CP-15 | Sesión | Cerrar sesión | Vuelve el botón "Acceso" y desaparecen los controles de administración | ☐ Pasó ☐ Falló |
| CP-16 | Carrito | Agregar 2 galletas distintas con **＋ Carrito** y recargar | El contador, los ítems y el total se conservan; **Hacer pedido** se habilita | ☐ Pasó ☐ Falló |
| CP-17 | Pedido | Llenar nombre y teléfono y enviar | Confirmación "¡Pedido #N registrado!" con total; el carrito queda vacío | ☐ Pasó ☐ Falló |
| CP-18 | Pedido | Hacer un pedido con teléfono `abc` | El formulario no lo acepta (validación en el navegador) | ☐ Pasó ☐ Falló |
| CP-19 | WhatsApp | Tras confirmar, pulsar **Enviar por WhatsApp** | Se abre wa.me con el resumen: cliente, teléfono, productos, total y notas | ☐ Pasó ☐ Falló |
| CP-20 | Contacto | Revisar la sección Contacto | WhatsApp 313 783 9935, Instagram @pixel_galletas y ubicación Ceiba 2 enlazan correctamente | ☐ Pasó ☐ Falló |
| CP-21 | Pedidos admin | Entrar como admin | Aparece *Pedidos recibidos* con cada pedido, su detalle y un selector de estado | ☐ Pasó ☐ Falló |
| CP-22 | Pedidos admin | Cambiar el estado de un pedido a **Listo** | "Estado actualizado."; el cambio persiste al recargar | ☐ Pasó ☐ Falló |

## 2. Pruebas de la API (Postman o navegador)
| ID | Petición | Resultado esperado | Resultado |
|---|---|---|---|
| API-01 | `GET /api/productos` sin token | 200 con la lista | ☐ Pasó ☐ Falló |
| API-02 | `POST /api/productos` sin token | 401 | ☐ Pasó ☐ Falló |
| API-03 | `POST /api/productos` con token de cliente | 403 | ☐ Pasó ☐ Falló |
| API-04 | `POST /api/productos` con token de admin | 201 | ☐ Pasó ☐ Falló |
| API-05 | `GET /api/usuarios` con token de cliente | 403 | ☐ Pasó ☐ Falló |
| API-06 | `POST /api/pedidos` con items vacíos o producto inexistente | 400 con mensaje | ☐ Pasó ☐ Falló |
| API-07 | `POST /api/pedidos` válido (sin token) | 201; total calculado con los precios del catálogo, ignorando `precio_unitario` del cliente | ☐ Pasó ☐ Falló |
| API-08 | `GET /api/pedidos` sin token / con cliente / con admin | 401 / 403 / 200 con la lista y el detalle | ☐ Pasó ☐ Falló |
| API-09 | `PUT /api/pedidos/:id/estado` con estado inválido o inexistente | 400 / 404 | ☐ Pasó ☐ Falló |

## 3. Pruebas automáticas (`npm test`)
| Archivo | Qué verifica |
|---|---|
| `tests/api.test.js` (13) | Registro (rol cliente forzado, contraseña corta, correo repetido), login, catálogo público, CRUD de productos por rol, gestión de usuarios, protecciones del admin, rol vigente en la base, 404, y pedidos (validación, total del servidor, roles) |
| `tests/frontend.test.js` (7) | Sesión, cliente de la API (token, 401, sin conexión), modelo `Producto`, servicios CRUD de productos y usuarios |
| `tests/acceso.test.js` (1) | Pantalla de acceso: abrir, entrar, cerrar sesión y sesión vencida |
| `tests/pedidos.test.js` (5) | Carrito (agrupar, límites, persistencia), servicio de pedidos, mensaje de WhatsApp y enlaces de contacto |

**Resultado de la última ejecución:** 26 pruebas, 26 correctas, 0 fallidas (con base de datos simulada).
