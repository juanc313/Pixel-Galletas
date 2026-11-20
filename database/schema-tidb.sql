-- =====================================================
-- Pixel Galletas - Esquema para TiDB Cloud Starter (MySQL compatible)
-- =====================================================
-- Diferencias con database/schema.sql:
--   * TiDB Cloud Starter no deja crear bases de datos: se ejecuta dentro de
--     la base "test" que trae la instancia, por eso no hay CREATE DATABASE ni USE.
--   * Se quitaron los bloques PREPARE/EXECUTE de migración: esta instancia nace
--     vacía con todas las columnas ya creadas, así que no hay nada que migrar.
-- Se puede ejecutar varias veces sin duplicar datos.
-- =====================================================

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
);

-- Tabla de productos (módulo de productos)
CREATE TABLE IF NOT EXISTS productos (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre_sabor  VARCHAR(100) NOT NULL,
  descripcion   TEXT NULL,
  precio_venta  DECIMAL(10,2) NOT NULL DEFAULT 6000.00,
  -- NULL = sin control de inventario; 0 = agotado; N = quedan N unidades
  cantidad_disponible INT UNSIGNED NULL DEFAULT NULL,
  creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_sabor (nombre_sabor)
);

-- Tabla de pedidos (módulo de pedidos)
CREATE TABLE IF NOT EXISTS pedidos (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id       INT UNSIGNED NULL,
  cliente_nombre   VARCHAR(100) NOT NULL,
  cliente_telefono VARCHAR(20)  NOT NULL,
  direccion        VARCHAR(255) NULL,
  notas            TEXT NULL,
  total            DECIMAL(10,2) NOT NULL,
  descuento        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  entrega          ENUM('recoger', 'cucuta', 'municipios') NOT NULL DEFAULT 'recoger',
  envio            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  visita           CHAR(16) NULL,
  estado           ENUM('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado')
                   NOT NULL DEFAULT 'pendiente',
  creado_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pedidos_estado (estado),
  CONSTRAINT fk_pedidos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE SET NULL
);

-- Detalle de cada pedido (copia del nombre y precio al momento de comprar)
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
);

-- Seguimiento de la misión de cada pedido: cuándo cambió de etapa y cuántas
-- veces Pixelito lo recordó por Telegram (src/models/Seguimiento.js). Solo
-- sirve para los recordatorios; el estado de verdad sigue en pedidos.estado.
CREATE TABLE IF NOT EXISTS pedido_seguimiento (
  pedido_id      INT UNSIGNED NOT NULL,
  estado         ENUM('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado') NOT NULL,
  cambiado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recordado_en   TIMESTAMP NULL,
  recordatorios  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (pedido_id),
  CONSTRAINT fk_seguimiento_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos (id) ON DELETE CASCADE
);

-- Medición propia del sitio (sin cookies, sin datos de personas)
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
);

-- Carrito guardado en la cuenta del cliente
CREATE TABLE IF NOT EXISTS carrito_items (
  usuario_id  INT UNSIGNED NOT NULL,
  producto_id INT UNSIGNED NOT NULL,
  cantidad    INT UNSIGNED NOT NULL,
  actualizado TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, producto_id),
  CONSTRAINT fk_carrito_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_carrito_producto FOREIGN KEY (producto_id)
    REFERENCES productos (id) ON DELETE CASCADE
);

-- Los seis sabores de la marca con su precio de venta real
-- ($6.000 por galleta; la Special Edition es de $7.500).
INSERT IGNORE INTO productos (nombre_sabor, descripcion, precio_venta) VALUES
  ('Pixel Monster',      'Galleta con cobertura de chocolate blanco y toque azul monstruo.', 6000.00),
  ('Pixel Red Velvet',   'Galleta red velvet con cobertura de chocolate blanco.',            6000.00),
  ('Pixel Chocolate',    'Galleta de chocolate con chips de cacao y galleta Biscolata.',     6000.00),
  ('Pixel AreKlim',      'Fusión de arequipe con leche Klim, M&M y chocolate blanco.',       6000.00),
  ('Pixel Red Monster',  'Fusión de red velvet y monster en una galleta bicolor.',          6000.00),
  ('Pixel Special Edition', 'Edición especial: todos nuestros sabores combinados.',          7500.00);

-- Correcciones de catálogo que también sirven en una base nueva
UPDATE productos SET precio_venta = 6000.00 WHERE precio_venta = 4500.00;
DELETE FROM productos WHERE nombre_sabor = 'Pixel Arequipe';
DELETE FROM productos WHERE nombre_sabor = 'Pixel Klim';
DELETE FROM productos WHERE nombre_sabor = 'Pixel Chocoarequipe';
UPDATE productos SET precio_venta = 7500.00
  WHERE nombre_sabor = 'Pixel Special Edition' AND precio_venta = 6000.00;
UPDATE productos SET descripcion = 'Galleta con cobertura de chocolate blanco y toque azul monstruo.'
  WHERE nombre_sabor = 'Pixel Monster' AND (descripcion IS NULL OR descripcion = '');
UPDATE productos SET descripcion = 'Galleta red velvet con cobertura de chocolate blanco.'
  WHERE nombre_sabor = 'Pixel Red Velvet' AND (descripcion IS NULL OR descripcion = '');
UPDATE productos SET descripcion = 'Galleta de chocolate con chips de cacao y galleta Biscolata.'
  WHERE nombre_sabor = 'Pixel Chocolate' AND (descripcion IS NULL OR descripcion = '');
