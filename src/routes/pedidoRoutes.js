const express = require("express");
const router = express.Router();
const PedidoController = require("../controllers/pedidoController");
const verificarToken = require("../middlewares/verificarToken");
const verificarTokenOpcional = require("../middlewares/verificarTokenOpcional");
const verificarRol = require("../middlewares/verificarRol");

// Cualquier cliente puede hacer un pedido (no necesita cuenta);
// si tiene sesión iniciada, se asocia el pedido a su usuario.
router.post("/", verificarTokenOpcional, PedidoController.crear);

// La gestión de pedidos es exclusiva del administrador.
router.get("/", verificarToken, verificarRol("admin"), PedidoController.listar);
router.get("/:id", verificarToken, verificarRol("admin"), PedidoController.obtener);
router.put("/:id/estado", verificarToken, verificarRol("admin"), PedidoController.actualizarEstado);

module.exports = router;
