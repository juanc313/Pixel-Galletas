-- =====================================================
-- Pixel Galletas - Esquema de base de datos (MySQL 8.0)
-- Se puede ejecutar varias veces sin duplicar datos.
-- =====================================================

CREATE DATABASE IF NOT EXISTS pixel_galletas_api
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pixel_galletas_api;

-- Tabla de usuarios (módulo de autenticación)
CREATE TABLE IF NOT EXISTS usuarios (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(100) NOT NULL,
  correo      VARCHAR(150) NOT NULL,
  contrasena  VARCHAR(255) NOT NULL,
  rol         ENUM('cliente', 'admin') NOT NULL DEFAULT 'cliente',
  creado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_correo (correo)
) ENGINE=InnoDB;

-- Tabla de productos (módulo de productos)
CREATE TABLE IF NOT EXISTS productos (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre_sabor  VARCHAR(100) NOT NULL,
  descripcion   TEXT NULL,
  precio_venta  DECIMAL(10,2) NOT NULL DEFAULT 6000.00,
  -- Inventario del obrador. Es opcional a propósito:
  --   NULL  = sin control de inventario (se hornea bajo pedido)
  --   0     = agotado (el sitio no deja pedirlo)
  --   N > 0 = quedan N unidades; cada pedido las reserva y al cancelarlo vuelven
  cantidad_disponible INT UNSIGNED NULL DEFAULT NULL,
  creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_sabor (nombre_sabor)
) ENGINE=InnoDB;

-- Tabla de pedidos (módulo de pedidos)
-- El total siempre lo calcula el servidor con los precios vigentes del catálogo.
CREATE TABLE IF NOT EXISTS pedidos (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id       INT UNSIGNED NULL,
  cliente_nombre   VARCHAR(100) NOT NULL,
  cliente_telefono VARCHAR(20)  NOT NULL,
  direccion        VARCHAR(255) NULL,
  notas            TEXT NULL,
  total            DECIMAL(10,2) NOT NULL,
  -- Ahorro por volumen que el servidor aplicó al total (0 si el pedido no
  -- llegó al primer tramo). Se guarda para poder mostrarlo en el pedido.
  descuento        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  -- Forma de entrega elegida por el cliente. El costo del envío lo calcula el
  -- servidor (src/config/envio.js) y NUNCA se acepta el del navegador: recoger
  -- es gratis siempre, el domicilio cuesta según la zona y sale gratis desde
  -- 12 galletas.
  entrega          ENUM('recoger', 'cucuta', 'municipios') NOT NULL DEFAULT 'recoger',
  envio            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  -- Identificador anónimo de la visita que hizo el pedido (lo genera el
  -- navegador). Sirve para cerrar el embudo de la medición propia: cuánta gente
  -- agregó al carrito y no llegó a confirmar. No identifica a ninguna persona.
  visita           CHAR(16) NULL,
  estado           ENUM('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado')
                   NOT NULL DEFAULT 'pendiente',
  creado_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pedidos_estado (estado),
  CONSTRAINT fk_pedidos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Detalle de cada pedido. Se guarda una copia del nombre y del precio
-- al momento de comprar, para que un cambio posterior del catálogo no
-- altere los pedidos ya realizados.
CREATE TABLE IF NOT EXISTS pedido_detalles (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_id      INT UNSIGNED NOT NULL,
  producto_id    INT UNSIGNED NULL,
  nombre_sabor   VARCHAR(100) NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  cantidad       INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_detalles_pedido (pedido_id),
  CONSTRAINT fk_detalles_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos (id) ON DELETE CASCADE,
  CONSTRAINT fk_detalles_producto FOREIGN KEY (producto_id)
    REFERENCES productos (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Los seis sabores de la marca con su precio de venta real
-- (Modelo DYME: $6.000 por galleta; la Special Edition es de $7.500).
INSERT IGNORE INTO productos (nombre_sabor, descripcion, precio_venta) VALUES
  ('Pixel Monster',      'Galleta con cobertura de chocolate blanco y toque azul monstruo.', 6000.00),
  ('Pixel Red Velvet',   'Galleta red velvet con cobertura de chocolate blanco.',            6000.00),
  ('Pixel Chocolate',    'Galleta de chocolate con chips de cacao y galleta Biscolata.',     6000.00),
  ('Pixel AreKlim',      'Fusión de arequipe con leche Klim, M&M y chocolate blanco.',       6000.00),
  ('Pixel Red Monster',  'Fusión de red velvet y monster en una galleta bicolor.',          6000.00),
  ('Pixel Special Edition', 'Edición especial: todos nuestros sabores combinados.',          7500.00);

-- Las bases de datos creadas con la versión anterior traían $4.500 como
-- precio de referencia; se corrigen solo si siguen con ese valor exacto.
UPDATE productos SET precio_venta = 6000.00 WHERE precio_venta = 4500.00;

-- Renombres de catálogo. Las bases antiguas traían "Pixel Klim" y "Pixel Arequipe"
-- por separado; hoy ambas viven como "Pixel AreKlim" (fusión de los dos sabores).
-- El INSERT de arriba ya garantiza que exista "Pixel AreKlim", así que aquí se
-- retiran las dos filas viejas sin tocar la clave única. El historial de compras
-- queda intacto en pedido_detalles (guarda su propia copia del nombre).
DELETE FROM productos WHERE nombre_sabor = 'Pixel Arequipe';
DELETE FROM productos WHERE nombre_sabor = 'Pixel Klim';
-- La Chocoarequipe se retiró del catálogo por decisión del emprendedor.
DELETE FROM productos WHERE nombre_sabor = 'Pixel Chocoarequipe';

-- La Special Edition pasó a $7.500: se corrige solo si sigue en el precio anterior,
-- para no pisar un cambio que el administrador haya hecho desde la página.
UPDATE productos SET precio_venta = 7500.00
  WHERE nombre_sabor = 'Pixel Special Edition' AND precio_venta = 6000.00;

-- Descripciones que quedaron en blanco. Las tres clásicas se crearon antes de
-- que el catálogo tuviera descripción, así que el INSERT IGNORE de arriba nunca
-- las rellenó (solo inserta filas nuevas) y sus tarjetas salían sin texto. Se
-- completan únicamente si siguen vacías: una descripción escrita desde la
-- página nunca se pisa.
UPDATE productos SET descripcion = 'Galleta con cobertura de chocolate blanco y toque azul monstruo.'
  WHERE nombre_sabor = 'Pixel Monster' AND (descripcion IS NULL OR descripcion = '');
UPDATE productos SET descripcion = 'Galleta red velvet con cobertura de chocolate blanco.'
  WHERE nombre_sabor = 'Pixel Red Velvet' AND (descripcion IS NULL OR descripcion = '');
UPDATE productos SET descripcion = 'Galleta de chocolate con chips de cacao y galleta Biscolata.'
  WHERE nombre_sabor = 'Pixel Chocolate' AND (descripcion IS NULL OR descripcion = '');

-- Descuentos por volumen: la columna del ahorro es más nueva que la tabla, así
-- que las bases anteriores tienen que recibirla. MySQL no admite
-- "ADD COLUMN IF NOT EXISTS", y este archivo está pensado para ejecutarse
-- varias veces, así que la migración se guarda con information_schema.
SET @tiene_descuento := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'descuento');
SET @sql_descuento := IF(@tiene_descuento = 0,
  'ALTER TABLE pedidos ADD COLUMN descuento DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total',
  'DO 0');
PREPARE stmt_descuento FROM @sql_descuento;
EXECUTE stmt_descuento;
DEALLOCATE PREPARE stmt_descuento;

-- Inventario del obrador: las bases creadas antes de esta función no tienen
-- cantidad_disponible. Se agrega en NULL (sin control de inventario) para que
-- ninguna galleta aparezca agotada solo por actualizar el esquema: el
-- emprendedor pone las unidades que horneó cuando quiera.
SET @tiene_disponible := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'productos' AND COLUMN_NAME = 'cantidad_disponible');
SET @sql_disponible := IF(@tiene_disponible = 0,
  'ALTER TABLE productos ADD COLUMN cantidad_disponible INT UNSIGNED NULL DEFAULT NULL AFTER precio_venta',
  'DO 0');
PREPARE stmt_disponible FROM @sql_disponible;
EXECUTE stmt_disponible;
DEALLOCATE PREPARE stmt_disponible;

-- Medición propia del sitio: qué sabores se ven, cuáles se agregan al carrito y
-- dónde se abandona el pedido. Sin cookies, sin terceros y sin datos de
-- personas: `visita` es un número al azar que el navegador guarda en memoria de
-- la pestaña. Los pedidos confirmados no se duplican aquí: se cuentan desde la
-- tabla pedidos, que es la que manda.
CREATE TABLE IF NOT EXISTS eventos (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evento      VARCHAR(40) NOT NULL,
  visita      CHAR(16) NULL,
  producto_id INT UNSIGNED NULL,
  cantidad    INT UNSIGNED NULL,
  creado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eventos_creado (creado_en),
  KEY idx_eventos_evento (evento, creado_en),
  CONSTRAINT fk_eventos_producto FOREIGN KEY (producto_id)
    REFERENCES productos (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- La visita del pedido también es más nueva que la tabla: se agrega en las
-- bases anteriores (los pedidos viejos quedan en NULL y no entran al embudo).
SET @tiene_visita := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'visita');
SET @sql_visita := IF(@tiene_visita = 0,
  'ALTER TABLE pedidos ADD COLUMN visita CHAR(16) NULL AFTER descuento',
  'DO 0');
PREPARE stmt_visita FROM @sql_visita;
EXECUTE stmt_visita;
DEALLOCATE PREPARE stmt_visita;

-- Entrega y costo del envío: las bases creadas antes del domicilio no tienen
-- estas columnas. Entran como 'recoger' y $0 para que ningún pedido antiguo
-- aparezca con un cobro que nunca se hizo.
SET @tiene_entrega := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'entrega');
SET @sql_entrega := IF(@tiene_entrega = 0,
  "ALTER TABLE pedidos ADD COLUMN entrega ENUM('recoger', 'cucuta', 'municipios') NOT NULL DEFAULT 'recoger' AFTER descuento",
  'DO 0');
PREPARE stmt_entrega FROM @sql_entrega;
EXECUTE stmt_entrega;
DEALLOCATE PREPARE stmt_entrega;

SET @tiene_envio := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'envio');
SET @sql_envio := IF(@tiene_envio = 0,
  'ALTER TABLE pedidos ADD COLUMN envio DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER entrega',
  'DO 0');
PREPARE stmt_envio FROM @sql_envio;
EXECUTE stmt_envio;
DEALLOCATE PREPARE stmt_envio;
