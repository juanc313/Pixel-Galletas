# Plan de pruebas — Pixel Galletas (EV02)

**Entorno:** Windows, Node.js LTS, MySQL Server 8.0, navegador Brave, servidor en `http://localhost:3000`.
**Datos de partida:** base creada con `schema.sql` y un administrador creado con `npm run crear-admin`.

## 1. Pruebas manuales (interfaz, con MySQL real)
Marque el resultado y adjunte captura como evidencia.

| ID | Módulo | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|
| CP-01 | Catálogo | Abrir la página sin iniciar sesión | Se ven las 5 galletas con precio; no hay botones de administración | ☐ Pasó ☐ Falló |
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

## 2. Pruebas de la API (Postman o navegador)
| ID | Petición | Resultado esperado | Resultado |
|---|---|---|---|
| API-01 | `GET /api/productos` sin token | 200 con la lista | ☐ Pasó ☐ Falló |
| API-02 | `POST /api/productos` sin token | 401 | ☐ Pasó ☐ Falló |
| API-03 | `POST /api/productos` con token de cliente | 403 | ☐ Pasó ☐ Falló |
| API-04 | `POST /api/productos` con token de admin | 201 | ☐ Pasó ☐ Falló |
| API-05 | `GET /api/usuarios` con token de cliente | 403 | ☐ Pasó ☐ Falló |

## 3. Pruebas automáticas (`npm test`)
| Archivo | Qué verifica |
|---|---|
| `tests/api.test.js` (10) | Registro (rol cliente forzado, contraseña corta, correo repetido), login, catálogo público, CRUD de productos por rol, gestión de usuarios, protecciones del admin, rol vigente en la base, 404 |
| `tests/frontend.test.js` (7) | Sesión, cliente de la API (token, 401, sin conexión), modelo `Producto`, servicios CRUD de productos y usuarios |
| `tests/acceso.test.js` (1) | Pantalla de acceso: abrir, entrar, cerrar sesión y sesión vencida |

**Resultado de la última ejecución:** 18 pruebas, 18 correctas, 0 fallidas (con base de datos simulada).
