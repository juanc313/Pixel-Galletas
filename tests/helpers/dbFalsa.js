// Base de datos simulada en memoria: permite probar la API sin MySQL.
function instalarDbFalsa() {
  const usuarios = [], productos = [], pedidos = [], detalles = [];
  let uid = 1, pid = 1, did = 1, dtdid = 1;
  const sinClave = ({ contrasena, ...resto }) => resto;
  const pool = {
    async query(sql, p = []) {
      if (sql.startsWith("SELECT * FROM usuarios WHERE correo")) return [usuarios.filter((u) => u.correo === p[0])];
      if (sql.startsWith("INSERT INTO usuarios")) { usuarios.push({ id: uid, nombre: p[0], correo: p[1], contrasena: p[2], rol: p[3], creado_en: new Date() }); return [{ insertId: uid++ }]; }
      if (sql.startsWith("SELECT id, nombre, correo, rol, creado_en FROM usuarios WHERE id")) return [usuarios.filter((u) => u.id == p[0]).map(sinClave)];
      if (sql.startsWith("SELECT id, nombre, correo, rol, creado_en FROM usuarios ORDER")) return [usuarios.map(sinClave)];
      if (sql.startsWith("UPDATE usuarios")) { const u = usuarios.find((x) => x.id == p[3]); if (u) { u.nombre = p[0] ?? u.nombre; u.correo = p[1] ?? u.correo; u.rol = p[2] ?? u.rol; } return [{}]; }
      if (sql.startsWith("DELETE FROM usuarios")) { const i = usuarios.findIndex((x) => x.id == p[0]); if (i >= 0) usuarios.splice(i, 1); return [{ affectedRows: i >= 0 ? 1 : 0 }]; }
      if (sql.startsWith("INSERT INTO productos")) { productos.push({ id: pid, nombre_sabor: p[0], descripcion: p[1], precio_venta: p[2], creado_en: new Date() }); return [{ insertId: pid++ }]; }
      if (sql.startsWith("SELECT * FROM productos WHERE id")) return [productos.filter((x) => x.id == p[0])];
      if (sql.startsWith("SELECT * FROM productos ORDER")) return [productos];
      if (sql.startsWith("UPDATE productos")) { const x = productos.find((y) => y.id == p[3]); if (x) { x.nombre_sabor = p[0] ?? x.nombre_sabor; x.descripcion = p[1] ?? x.descripcion; x.precio_venta = p[2] ?? x.precio_venta; } return [{}]; }
      if (sql.startsWith("DELETE FROM productos")) { const i = productos.findIndex((x) => x.id == p[0]); if (i >= 0) productos.splice(i, 1); return [{ affectedRows: i >= 0 ? 1 : 0 }]; }
      if (sql.startsWith("INSERT INTO pedidos")) { pedidos.push({ id: did, usuario_id: p[0], cliente_nombre: p[1], cliente_telefono: p[2], direccion: p[3], notas: p[4], total: p[5], estado: "pendiente", creado_en: new Date() }); return [{ insertId: did++ }]; }
      if (sql.startsWith("INSERT INTO pedido_detalles")) { detalles.push({ id: dtdid++, pedido_id: p[0], producto_id: p[1], nombre_sabor: p[2], precio_unitario: p[3], cantidad: p[4] }); return [{ insertId: dtdid }]; }
      if (sql.startsWith("SELECT * FROM pedidos WHERE id")) return [pedidos.filter((x) => x.id == p[0])];
      if (sql.startsWith("SELECT * FROM pedidos ORDER")) return [pedidos.slice().reverse()];
      if (sql.startsWith("SELECT producto_id, nombre_sabor")) return [detalles.filter((d) => d.pedido_id == p[0]).map(({ pedido_id, ...r }) => r)];
      if (sql.startsWith("SELECT pedido_id, producto_id")) return [detalles.map(({ pedido_id, ...r }) => ({ pedido_id, ...r }))];
      if (sql.startsWith("UPDATE pedidos SET estado")) { const x = pedidos.find((y) => y.id == p[1]); if (x) x.estado = p[0]; return [{ affectedRows: x ? 1 : 0 }]; }
      throw new Error("Consulta SQL no contemplada en la base simulada: " + sql);
    },
    // Transacción falsa: guarda los datos al confirmar y los descarta si hay rollback.
    async getConnection() {
      const enMemoria = { pedidos: [], detalles: [] };
      return {
        async beginTransaction() {},
        async query(sql, p = []) {
          if (sql.startsWith("INSERT INTO pedidos")) {
            const id = did++;
            enMemoria.pedidos.push({ id, usuario_id: p[0], cliente_nombre: p[1], cliente_telefono: p[2], direccion: p[3], notas: p[4], total: p[5], estado: "pendiente", creado_en: new Date() });
            return [{ insertId: id }];
          }
          if (sql.startsWith("INSERT INTO pedido_detalles")) { enMemoria.detalles.push({ pedido_id: p[0], producto_id: p[1], nombre_sabor: p[2], precio_unitario: p[3], cantidad: p[4] }); return [{ insertId: 1 }]; }
          return pool.query(sql, p);
        },
        async commit() {
          for (const pedido of enMemoria.pedidos) pedidos.push(pedido);
          for (const d of enMemoria.detalles) detalles.push({ id: dtdid++, ...d });
          enMemoria.pedidos.length = 0; enMemoria.detalles.length = 0;
        },
        async rollback() { enMemoria.pedidos.length = 0; enMemoria.detalles.length = 0; },
        release() {},
      };
    },
  };
  const ruta = require.resolve("../../src/config/db.js");
  require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: pool };
  return { agregarUsuario(nombre, correo, contrasena, rol) { usuarios.push({ id: uid, nombre, correo, contrasena, rol, creado_en: new Date() }); return uid++; } };
}
module.exports = { instalarDbFalsa };
