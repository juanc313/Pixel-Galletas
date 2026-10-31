const express = require("express");
const router = express.Router();
const PedidoController = require("../controllers/pedidoController");
const verificarToken = require("../middlewares/verificarToken");
const verificarTokenOpcional = require("../middlewares/verificarTokenOpcional");
const verificarRol = require("../middlewares/verificarRol");

// Cualquier cliente puede hacer un pedido (no necesita cuenta);
// si tiene sesión iniciada, se asocia el pedido a su usuario.
router.post("/", verificarTokenOpcional, PedidoController.crear);

// La consulta pública de estado NO lleva token: se valida el número del pedido
// Y el teléfono con el que se hizo. Va ANTES de /:id, o Express la capturaría
// como si "estado" fuera un id y devolvería 401.
//
// Va en POST y no en GET a propósito: en una URL el teléfono del cliente
// quedaría en el historial del navegador, en los registros del servidor y en
// cualquier proxy por el que pase la petición. En el cuerpo del POST viaja
// solo donde debe viajar.
router.post("/estado", PedidoController.consultarEstado);

// Tabla de rangos de distancia del domicilio (pública, para el formulario).
router.get("/tarifas-distancia", PedidoController.tarifasDistancia);

// La gestión de pedidos es exclusiva del administrador.
router.get("/", verificarToken, verificarRol("admin"), PedidoController.listar);
router.get("/:id", verificarToken, verificarRol("admin"), PedidoController.obtener);
router.put("/:id/estado", verificarToken, verificarRol("admin"), PedidoController.actualizarEstado);

module.exports = router;
