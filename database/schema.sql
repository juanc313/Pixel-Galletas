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
  ('Pixel Arequipe',     'Galleta con arequipe y cobertura de chocolate blanco.',            6000.00),
  ('Pixel Klim',         'Galleta con leche Klim, M&M y cobertura de chocolate blanco.',     6000.00),
  ('Pixel Special Edition', 'Edición especial: todos nuestros sabores combinados.',          7500.00);

-- Las bases de datos creadas con la versión anterior traían $4.500 como
-- precio de referencia; se corrigen solo si siguen con ese valor exacto.
UPDATE productos SET precio_venta = 6000.00 WHERE precio_venta = 4500.00;

-- La Special Edition pasó a $7.500: se corrige solo si sigue en el precio anterior,
-- para no pisar un cambio que el administrador haya hecho desde la página.
UPDATE productos SET precio_venta = 7500.00
  WHERE nombre_sabor = 'Pixel Special Edition' AND precio_venta = 6000.00;
