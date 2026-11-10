// Pruebas de la copia de seguridad: el SQL que genera debe poder restaurarse tal cual.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sentenciasDeTabla, marcaDeTiempo } = require("../scripts/respaldo");

const CREAR = "CREATE TABLE `productos` (`id` int NOT NULL, `nombre_sabor` varchar(100), PRIMARY KEY (`id`))";

test("Respaldo: estructura y filas, con comillas, nulos y fechas escapados", () => {
  const sql = sentenciasDeTabla("productos", CREAR, [
    { id: 1, nombre_sabor: "Pixel O'Monster", creado_en: "2026-11-10 08:30:00", notas: null },
  ]);
  assert.match(sql, /DROP TABLE IF EXISTS `productos`;/);
  assert.ok(sql.includes(`${CREAR};`));
  assert.ok(sql.includes("INSERT INTO `productos` (`id`, `nombre_sabor`, `creado_en`, `notas`) VALUES (1, 'Pixel O\\'Monster', '2026-11-10 08:30:00', NULL);"));
});

test("Respaldo: una tabla vacía conserva su estructura sin INSERT", () => {
  const sql = sentenciasDeTabla("carrito", CREAR.replace("productos", "carrito"), []);
  assert.match(sql, /0 filas/);
  assert.doesNotMatch(sql, /INSERT/);
});

test("Respaldo: muchas filas se reparten en varios INSERT", () => {
  const filas = Array.from({ length: 450 }, (_, i) => ({ id: i + 1 }));
  assert.equal(sentenciasDeTabla("t", "CREATE TABLE `t` (`id` int)", filas).match(/INSERT INTO/g).length, 3);
});

test("Respaldo: el nombre del archivo lleva fecha y hora", () => {
  assert.equal(marcaDeTiempo(new Date(2026, 10, 10, 9, 5)), "2026-11-10_0905");
});
