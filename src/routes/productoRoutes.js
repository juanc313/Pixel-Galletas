const express = require("express");
const router = express.Router();
const ProductoController = require("../controllers/productoController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");

// Públicas: cualquiera puede ver el catálogo
router.get("/", ProductoController.listar);
router.get("/:id", ProductoController.obtener);

// Solo el administrador modifica el catálogo
router.post("/", verificarToken, verificarRol("admin"), ProductoController.crear);
router.put("/:id", verificarToken, verificarRol("admin"), ProductoController.actualizar);
router.delete("/:id", verificarToken, verificarRol("admin"), ProductoController.eliminar);

module.exports = router;
