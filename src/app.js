const express = require("express");
const cors = require("cors");
const path = require("path");

const usuarioRoutes = require("./routes/usuarioRoutes");
const productoRoutes = require("./routes/productoRoutes");
const pedidoRoutes = require("./routes/pedidoRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api", (req, res) => {
  res.json({
    mensaje: "API Pixel Galletas funcionando correctamente",
    evidencia: "GA4-220501096-AA1-EV02",
    endpoints: { usuarios: "/api/usuarios", productos: "/api/productos", pedidos: "/api/pedidos" },
  });
});

app.use("/api/usuarios", usuarioRoutes);
app.use("/api/productos", productoRoutes);
app.use("/api/pedidos", pedidoRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

module.exports = app;