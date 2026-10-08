const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

class UsuarioController {
  static async registrar(req, res) {
    try {
      const { nombre, correo, contrasena } = req.body;
      if (!nombre || !correo || !contrasena) {
        return res.status(400).json({ error: "nombre, correo y contrasena son obligatorios" });
      }
      if (contrasena.length < 6) {
        return res.status(400).json({ error: "La contrasena debe tener al menos 6 caracteres" });
      }
      const existente = await Usuario.buscarPorCorreoConClave(correo);
      if (existente) {
        return res.status(409).json({ error: "Ya existe un usuario con ese correo" });
      }
      const contrasenaHasheada = await bcrypt.hash(contrasena, 10);
      const nuevoUsuario = await Usuario.crear({ nombre, correo, contrasenaHasheada });
      return res.status(201).json(nuevoUsuario);
    } catch (error) {
      return res.status(500).json({ error: "Error al registrar usuario", detalle: error.message });
    }
  }

  static async login(req, res) {
    try {
      const { correo, contrasena } = req.body;
      if (!correo || !contrasena) {
        return res.status(400).json({ error: "correo y contrasena son obligatorios" });
      }
      const usuario = await Usuario.buscarPorCorreoConClave(correo);
      if (!usuario) return res.status(401).json({ error: "Credenciales inválidas" });

      const coincide = await bcrypt.compare(contrasena, usuario.contrasena);
      if (!coincide) return res.status(401).json({ error: "Credenciales inválidas" });

      const token = jwt.sign(
        { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );

      return res.json({
        mensaje: "Autenticación exitosa",
        token,
        usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
      });
    } catch (error) {
      return res.status(500).json({ error: "Error al iniciar sesión", detalle: error.message });
    }
  }

  static async listar(req, res) {
    try {
      const usuarios = await Usuario.listarTodos();
      return res.json(usuarios);
    } catch (error) {
      return res.status(500).json({ error: "Error al listar usuarios", detalle: error.message });
    }
  }

  static async obtener(req, res) {
    try {
      const usuario = await Usuario.buscarPorId(req.params.id);
      if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
      return res.json(usuario);
    } catch (error) {
      return res.status(500).json({ error: "Error al consultar usuario", detalle: error.message });
    }
  }

  static async actualizar(req, res) {
    try {
      const existente = await Usuario.buscarPorId(req.params.id);
      if (!existente) return res.status(404).json({ error: "Usuario no encontrado" });
      const { rol } = req.body;
      if (rol !== undefined && !["cliente", "admin"].includes(rol)) {
        return res.status(400).json({ error: "rol debe ser 'cliente' o 'admin'" });
      }
      if (Number(req.params.id) === req.usuario.id && rol !== undefined && rol !== "admin") {
        return res.status(400).json({ error: "No puedes quitarte tu propio rol de administrador" });
      }
      const actualizado = await Usuario.actualizar(req.params.id, req.body);
      return res.json(actualizado);
    } catch (error) {
      return res.status(500).json({ error: "Error al actualizar usuario", detalle: error.message });
    }
  }

  static async eliminar(req, res) {
    try {
      if (Number(req.params.id) === req.usuario.id) {
        return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
      }
      const eliminado = await Usuario.eliminar(req.params.id);
      if (!eliminado) return res.status(404).json({ error: "Usuario no encontrado" });
      return res.json({ mensaje: "Usuario eliminado correctamente" });
    } catch (error) {
      return res.status(500).json({ error: "Error al eliminar usuario", detalle: error.message });
    }
  }
}

module.exports = UsuarioController;