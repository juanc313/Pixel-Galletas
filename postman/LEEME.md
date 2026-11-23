# Postman · Pixel Galletas API

Colección con **43 peticiones y 152 comprobaciones** de la API: salud, usuarios
y sesión, productos, pedidos, carrito, medición y seguridad.

## Importar en Postman

1. Postman → **Import** → arrastra estos 3 archivos:
   - `collections/Pixel-Galletas-API.postman_collection.json`
   - `environments/Pixel-Galletas-Pruebas-locales.postman_environment.json`
   - `environments/Pixel-Galletas-Produccion.postman_environment.json`
2. Arriba a la derecha, elige el entorno.

## Pruebas locales (recomendado)

1. En la carpeta del proyecto: `npm run api:pruebas`
   (la API real con una base de datos **falsa** en memoria: no usa MySQL,
   no lee el `.env` y no manda avisos a Telegram).
2. En Postman, entorno **Pixel Galletas · Pruebas locales** → en la colección,
   botón **Run** → **Run Pixel Galletas API**.
3. Debe salir todo en verde. El admin de este entorno
   (`admin-pruebas@pixel.test`) solo existe en ese servidor de pruebas.

## Producción

- Entorno **Pixel Galletas · Producción**. Escribe tu correo y contraseña de
  admin en el entorno (la contraseña es tipo *secret*). **No** guardes esos
  valores en estos archivos ni en Git.
- Las peticiones que **crean o cambian datos se saltan solas** en producción
  (pedidos reales, avisos a Telegram, cambios al catálogo). Solo corren las de
  lectura y las de seguridad.

## Desde la terminal (sin abrir Postman)

```
npm run api:pruebas            (en una terminal)
npx newman run postman/collections/Pixel-Galletas-API.postman_collection.json -e postman/environments/Pixel-Galletas-Pruebas-locales.postman_environment.json
```
