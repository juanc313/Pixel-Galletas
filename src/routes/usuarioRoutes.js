const express = require("express");
const router = express.Router();
const UsuarioController = require("../controllers/usuarioController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");

router.post("/registro", UsuarioController.registrar);
router.post("/login", UsuarioController.login);

// La gestión de usuarios es exclusiva del administrador
router.get("/", verificarToken, verificarRol("admin"), UsuarioController.listar);
router.get("/:id", verificarToken, verificarRol("admin"), UsuarioController.obtener);
router.put("/:id", verificarToken, verificarRol("admin"), UsuarioController.actualizar);
router.delete("/:id", verificarToken, verificarRol("admin"), UsuarioController.eliminar);

module.exports = router;
