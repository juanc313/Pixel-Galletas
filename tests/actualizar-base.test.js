// La herramienta que crea las tablas que falten solo puede ejecutar CREATE TABLE.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { tablasDelEsquema } = require("../scripts/actualizar-base");

const esquema = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");

test("Actualizar base: encuentra las siete tablas del esquema, en orden", () => {
  assert.deepEqual(tablasDelEsquema(esquema).map((t) => t.nombre),
    ["usuarios", "productos", "pedidos", "pedido_detalles", "pedido_seguimiento", "eventos", "carrito_items"]);
});

test("Actualizar base: cada sentencia es un CREATE TABLE IF NOT EXISTS completo y nada más", () => {
  for (const { nombre, sql } of tablasDelEsquema(esquema)) {
    assert.match(sql, new RegExp(`^CREATE TABLE IF NOT EXISTS ${nombre} \\(`));
    assert.match(sql, /\) ENGINE=InnoDB$/);
    // Ninguna otra sentencia colada (ON DELETE de las claves foráneas no cuenta).
    assert.doesNotMatch(sql, /;|^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/im);
  }
});

test("Actualizar base: el carrito trae sus claves foráneas", () => {
  const carrito = tablasDelEsquema(esquema).find((t) => t.nombre === "carrito_items");
  assert.match(carrito.sql, /REFERENCES usuarios \(id\)/);
  assert.match(carrito.sql, /REFERENCES productos \(id\)/);
});
