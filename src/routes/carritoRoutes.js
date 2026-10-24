const express = require("express");
const router = express.Router();
const CarritoController = require("../controllers/carritoController");
const verificarToken = require("../middlewares/verificarToken");

// Solo para usuarios con sesión: cada carrito pertenece a una cuenta.
router.get("/", verificarToken, CarritoController.obtener);
router.put("/", verificarToken, CarritoController.reemplazar);

module.exports = router;
