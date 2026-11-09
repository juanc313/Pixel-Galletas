const bcrypt = require("bcryptjs");
const errorInterno = require("../util/errorInterno");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

// Hash de referencia: si el correo no existe, se compara igual contra este hash
// para que la respuesta tarde lo mismo y no se pueda averiguar qué cuentas existen.
const HASH_REFERENCIA = bcrypt.hashSync("referencia-tiempos-login", 10);

class UsuarioController {
  static async registrar(req, res) {
    try {
      const { nombre, correo, contrasena } = req.body;
      if (!nombre || !correo || !contrasena || typeof nombre !== "string" || typeof correo !== "string" || typeof contrasena !== "string" || nombre.length > 100) {
        return res.status(400).json({ error: "nombre, correo y contrasena son obligatorios" });
      }
      // El mismo tope de la columna (VARCHAR(150) en database/schema.sql).
      if (correo.length > 150) {
        return res.status(400).json({ error: "El correo no puede tener más de 150 caracteres" });
      }
      if (contrasena.length < 8 || contrasena.length > 72) {
        return res.status(400).json({ error: "La contrasena debe tener entre 8 y 72 caracteres" });
      }
      const existente = await Usuario.buscarPorCorreoConClave(correo);
      if (existente) {
        return res.status(409).json({ error: "Ya existe un usuario con ese correo" });
      }
      const contrasenaHasheada = await bcrypt.hash(contrasena, 10);
      const nuevoUsuario = await Usuario.crear({ nombre, correo, contrasenaHasheada });
      return res.status(201).json(nuevoUsuario);
    } catch (error) {
      return errorInterno(res, "Error al registrar usuario", error);
    }
  }

  static async login(req, res) {
    try {
      const { correo, contrasena } = req.body;
      if (!correo || !contrasena || typeof correo !== "string" || typeof contrasena !== "string") {
        return res.status(400).json({ error: "correo y contrasena son obligatorios" });
      }
      const usuario = await Usuario.buscarPorCorreoConClave(correo);
      const coincide = await bcrypt.compare(contrasena, usuario ? usuario.contrasena : HASH_REFERENCIA);
      if (!usuario || !coincide) return res.status(401).json({ error: "Credenciales inválidas" });

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
      return errorInterno(res, "Error al iniciar sesión", error);
    }
  }

  static async listar(req, res) {
    try {
      const usuarios = await Usuario.listarTodos();
      return res.json(usuarios);
    } catch (error) {
      return errorInterno(res, "Error al listar usuarios", error);
    }
  }

  static async obtener(req, res) {
    try {
      const usuario = await Usuario.buscarPorId(req.params.id);
      if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
      return res.json(usuario);
    } catch (error) {
      return errorInterno(res, "Error al consultar usuario", error);
    }
  }

  static async actualizar(req, res) {
    try {
      const existente = await Usuario.buscarPorId(req.params.id);
      if (!existente) return res.status(404).json({ error: "Usuario no encontrado" });
      const { rol, nombre, correo } = req.body;
      // Solo texto: un objeto aquí llegaría a la consulta SQL como pares columna = valor.
      if ((nombre !== undefined && typeof nombre !== "string") || (correo !== undefined && typeof correo !== "string")) {
        return res.status(400).json({ error: "nombre y correo deben ser texto" });
      }
      if (rol !== undefined && !["cliente", "admin"].includes(rol)) {
        return res.status(400).json({ error: "rol debe ser 'cliente' o 'admin'" });
      }
      if (Number(req.params.id) === req.usuario.id && rol !== undefined && rol !== "admin") {
        return res.status(400).json({ error: "No puedes quitarte tu propio rol de administrador" });
      }
      const actualizado = await Usuario.actualizar(req.params.id, req.body);
      return res.json(actualizado);
    } catch (error) {
      return errorInterno(res, "Error al actualizar usuario", error);
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
      return errorInterno(res, "Error al eliminar usuario", error);
    }
  }
}

module.exports = UsuarioController;