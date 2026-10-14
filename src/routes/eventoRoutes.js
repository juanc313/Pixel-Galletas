const express = require("express");
const router = express.Router();
const EventoController = require("../controllers/eventoController");
const verificarToken = require("../middlewares/verificarToken");
const verificarRol = require("../middlewares/verificarRol");

// El registro es público: el sitio mide lo que pasa sin pedir cuenta.
router.post("/", EventoController.registrar);

// Purga de retención para el cron de Vercel (vercel.json). Exige CRON_SECRET.
router.get("/cron/purgar", EventoController.purgarAntiguos);

// El resumen es del obrador.
router.get("/resumen", verificarToken, verificarRol("admin"), EventoController.resumen);

module.exports = router;
