// Base de datos simulada en memoria: permite probar la API sin MySQL.
function instalarDbFalsa() {
  const usuarios = [], productos = [], pedidos = [], detalles = [], eventos = [], carrito = [];
  let uid = 1, pid = 1, did = 1, dtdid = 1, eid = 1;
  const sinClave = ({ contrasena, ...resto }) => resto;
  const pool = {
    async query(sql, p = []) {
      if (sql.startsWith("SELECT * FROM usuarios WHERE correo")) return [usuarios.filter((u) => u.correo === p[0])];
      if (sql.startsWith("INSERT INTO usuarios")) { usuarios.push({ id: uid, nombre: p[0], correo: p[1], contrasena: p[2], rol: p[3], creado_en: new Date() }); return [{ insertId: uid++ }]; }
      if (sql.startsWith("SELECT id, nombre, correo, rol, creado_en FROM usuarios WHERE id")) return [usuarios.filter((u) => u.id == p[0]).map(sinClave)];
      if (sql.startsWith("SELECT id, nombre, correo, rol, creado_en FROM usuarios ORDER")) return [usuarios.map(sinClave)];
      if (sql.startsWith("UPDATE usuarios")) { const u = usuarios.find((x) => x.id == p[3]); if (u) { u.nombre = p[0] ?? u.nombre; u.correo = p[1] ?? u.correo; u.rol = p[2] ?? u.rol; } return [{}]; }
      if (sql.startsWith("DELETE FROM usuarios")) { const i = usuarios.findIndex((x) => x.id == p[0]); if (i >= 0) usuarios.splice(i, 1); return [{ affectedRows: i >= 0 ? 1 : 0 }]; }
      if (sql.startsWith("INSERT INTO productos")) { productos.push({ id: pid, nombre_sabor: p[0], descripcion: p[1], precio_venta: p[2], cantidad_disponible: p[3] ?? null, creado_en: new Date() }); return [{ insertId: pid++ }]; }
      if (sql.startsWith("SELECT * FROM productos WHERE id")) return [productos.filter((x) => x.id == p[0])];
      if (sql.startsWith("SELECT * FROM productos ORDER")) return [productos];
      // Inventario. Estos tres van ANTES de la rama genérica de UPDATE productos.
      // Descuento por pedido: NULL significa "sin control de inventario" (acierta
      // la fila sin cambiar nada) y sin unidades suficientes no acierta ninguna.
      if (sql.startsWith("UPDATE productos SET cantidad_disponible = IF(")) {
        const x = productos.find((y) => y.id == p[1]);
        if (!x) return [{ affectedRows: 0 }];
        if (x.cantidad_disponible == null) return [{ affectedRows: 1 }];
        if (x.cantidad_disponible < p[0]) return [{ affectedRows: 0 }];
        x.cantidad_disponible -= p[0];
        return [{ affectedRows: 1 }];
      }
      // Devolución al cancelar: los sabores sin control de inventario no cambian.
      if (sql.startsWith("UPDATE productos SET cantidad_disponible = cantidad_disponible + ?")) {
        const x = productos.find((y) => y.id == p[1]);
        if (!x || x.cantidad_disponible == null) return [{ affectedRows: 0 }];
        x.cantidad_disponible += p[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("UPDATE productos SET cantidad_disponible = ? WHERE id")) {
        const x = productos.find((y) => y.id == p[1]);
        if (x) x.cantidad_disponible = p[0];
        return [{ affectedRows: x ? 1 : 0 }];
      }
      if (sql.startsWith("UPDATE productos")) { const x = productos.find((y) => y.id == p[3]); if (x) { x.nombre_sabor = p[0] ?? x.nombre_sabor; x.descripcion = p[1] ?? x.descripcion; x.precio_venta = p[2] ?? x.precio_venta; } return [{}]; }
      if (sql.startsWith("DELETE FROM productos")) { const i = productos.findIndex((x) => x.id == p[0]); if (i >= 0) productos.splice(i, 1); return [{ affectedRows: i >= 0 ? 1 : 0 }]; }
      if (sql.startsWith("INSERT INTO pedidos")) { pedidos.push({ id: did, usuario_id: p[0], cliente_nombre: p[1], cliente_telefono: p[2], direccion: p[3], entrega: p[4], envio: p[5], notas: p[6], total: p[7], descuento: p[8], visita: p[9] ?? null, estado: "pendiente", creado_en: new Date() }); return [{ insertId: did++ }]; }
      if (sql.startsWith("INSERT INTO pedido_detalles")) { detalles.push({ id: dtdid++, pedido_id: p[0], producto_id: p[1], nombre_sabor: p[2], precio_unitario: p[3], cantidad: p[4] }); return [{ insertId: dtdid }]; }
      if (sql.startsWith("SELECT * FROM pedidos WHERE id")) return [pedidos.filter((x) => x.id == p[0])];
      if (sql.startsWith("SELECT * FROM pedidos ORDER")) return [pedidos.slice().reverse()];
      if (sql.startsWith("SELECT producto_id, nombre_sabor")) return [detalles.filter((d) => d.pedido_id == p[0]).map(({ pedido_id, ...r }) => r)];
      if (sql.startsWith("SELECT pedido_id, producto_id")) return [detalles.map(({ pedido_id, ...r }) => ({ pedido_id, ...r }))];
      // ---------- Medición propia ----------
      if (sql.startsWith("INSERT INTO eventos")) {
        eventos.push({ id: eid, evento: p[0], visita: p[1], producto_id: p[2], cantidad: p[3], creado_en: new Date() });
        return [{ insertId: eid++ }];
      }
      if (sql.startsWith("SELECT evento, producto_id, visita, cantidad FROM eventos")) {
        return [eventos.filter((e) => e.creado_en >= new Date(p[0]))];
      }
      if (sql.startsWith("SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS dinero FROM pedidos")) {
        const enVentana = pedidos.filter((x) => x.creado_en >= new Date(p[0]));
        // Las consultas de conteo devuelven una fila: [[fila]], igual que pool.query.
        return [[{ total: enVentana.length, dinero: enVentana.reduce((suma, x) => suma + Number(x.total), 0) }]];
      }
      if (sql.startsWith("SELECT COUNT(DISTINCT visita) AS total FROM pedidos")) {
        const unicas = new Set(pedidos.filter((x) => x.visita && x.creado_en >= new Date(p[0])).map((x) => x.visita));
        return [[{ total: unicas.size }]];
      }
      if (sql.startsWith("UPDATE pedidos SET estado")) { const x = pedidos.find((y) => y.id == p[1]); if (x) x.estado = p[0]; return [{ affectedRows: x ? 1 : 0 }]; }
      if (sql.startsWith("SELECT estado FROM pedidos WHERE id")) {
        const x = pedidos.find((y) => y.id == p[0]);
        return [x ? [{ estado: x.estado }] : []];
      }
      if (sql.startsWith("SELECT producto_id, cantidad, nombre_sabor FROM pedido_detalles")) {
        return [detalles.filter((d) => d.pedido_id == p[0]).map(({ id, pedido_id, ...resto }) => resto)];
      }
      // ---------- Carrito guardado en la cuenta ----------
      if (sql.startsWith("SELECT cantidad_disponible FROM productos WHERE id")) {
        const x = productos.find((y) => y.id == p[0]);
        return [x ? [{ cantidad_disponible: x.cantidad_disponible }] : []];
      }
      if (sql.startsWith("SELECT c.producto_id, p.nombre_sabor")) {
        return [carrito
          .filter((c) => c.usuario_id == p[0])
          .map((c) => {
            const x = productos.find((y) => y.id == c.producto_id);
            return { producto_id: c.producto_id, nombre_sabor: x.nombre_sabor, precio_venta: x.precio_venta, cantidad_disponible: x.cantidad_disponible, cantidad: c.cantidad, pid: x.id };
          })
          .sort((a, b) => a.pid - b.pid)
          .map(({ pid, ...r }) => r)];
      }
      if (sql.startsWith("DELETE FROM carrito_items")) {
        for (let i = carrito.length - 1; i >= 0; i--) if (carrito[i].usuario_id == p[0]) carrito.splice(i, 1);
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith("INSERT INTO carrito_items")) {
        carrito.push({ usuario_id: p[0], producto_id: p[1], cantidad: p[2] });
        return [{ insertId: carrito.length }];
      }
      throw new Error("Consulta SQL no contemplada en la base simulada: " + sql);
    },
    // Transacción falsa: guarda los datos al confirmar y los descarta si hay rollback.
    async getConnection() {
      const enMemoria = { pedidos: [], detalles: [] };
      // Foto del inventario al abrir la transacción: si hay rollback se devuelve
      // tal como estaba, igual que haría MySQL (si no, un pedido rechazado
      // dejaría el stock descontado para siempre).
      const inventario = productos.map((p) => p.cantidad_disponible);
      return {
        async beginTransaction() {},
        async query(sql, p = []) {
          if (sql.startsWith("INSERT INTO pedidos")) {
            const id = did++;
            enMemoria.pedidos.push({ id, usuario_id: p[0], cliente_nombre: p[1], cliente_telefono: p[2], direccion: p[3], entrega: p[4], envio: p[5], notas: p[6], total: p[7], descuento: p[8], visita: p[9] ?? null, estado: "pendiente", creado_en: new Date() });
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
        async rollback() {
          enMemoria.pedidos.length = 0; enMemoria.detalles.length = 0;
          productos.forEach((p, i) => { p.cantidad_disponible = inventario[i]; });
        },
        release() {},
      };
    },
  };
  const ruta = require.resolve("../../src/config/db.js");
  require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: pool };
  return {
    agregarUsuario(nombre, correo, contrasena, rol) { usuarios.push({ id: uid, nombre, correo, contrasena, rol, creado_en: new Date() }); return uid++; },
    async agregarProducto({ nombre_sabor, descripcion, precio_venta, cantidad_disponible = null }) {
      productos.push({ id: pid, nombre_sabor, descripcion, precio_venta, cantidad_disponible, creado_en: new Date() });
      return pid++;
    },
  };
}
module.exports = { instalarDbFalsa };
