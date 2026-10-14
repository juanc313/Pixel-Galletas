const pool = require("../config/db");

// Medición propia del sitio: eventos anónimos que el navegador manda a esta
// misma API. Sin cookies, sin servicios de terceros y sin datos de personas:
// `visita` es un número al azar que el navegador guarda en sessionStorage y
// sirve solo para unir los pasos de UNA visita (vio un sabor, lo agregó al
// carrito, empezó el pedido).
//
// Los pedidos confirmados NO se duplican aquí: se cuentan desde la tabla
// pedidos, que es la fuente de verdad. Así el embudo no puede mentir por un
// evento perdido.
const EVENTOS = {
  sabor_visto: "Una tarjeta de sabor entró en pantalla",
  carrito_agregar: "Agregó una galleta al carrito",
  checkout_iniciado: "Empezó a llenar los datos de entrega",
};

class Evento {
  static get validos() {
    return Object.keys(EVENTOS);
  }

  // Retención: los eventos sirven para el embudo reciente, no para guardar la
  // historia de cada visita. Borra lo más antiguo que `dias`.
  static async purgarAntiguos(dias = 180) {
    const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const [resultado] = await pool.query("DELETE FROM eventos WHERE creado_en < ?", [limite]);
    return resultado?.affectedRows ?? 0;
  }

  static async registrar({ evento, visita, producto_id, cantidad }) {
    await pool.query(
      "INSERT INTO eventos (evento, visita, producto_id, cantidad) VALUES (?, ?, ?, ?)",
      [evento, visita ?? null, producto_id ?? null, cantidad ?? null]
    );
  }

  // Resumen del embudo para el panel. La suma se hace en JavaScript a
  // propósito: con el tráfico de esta pyme (unas pocas visitas al día) leer las
  // filas de la ventana es más simple —y mucho más fácil de probar— que media
  // docena de GROUP BY.
  static async resumen(dias = 30) {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const [filas] = await pool.query(
      "SELECT evento, producto_id, visita, cantidad FROM eventos WHERE creado_en >= ?",
      [desde]
    );
    const [pedidos] = await pool.query(
      "SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS dinero FROM pedidos WHERE creado_en >= ?",
      [desde]
    );
    const [confirmadas] = await pool.query(
      "SELECT COUNT(DISTINCT visita) AS total FROM pedidos WHERE visita IS NOT NULL AND creado_en >= ?",
      [desde]
    );

    const porEvento = {};
    for (const nombre of Object.keys(EVENTOS)) porEvento[nombre] = 0;
    const visitas = {};
    const sabores = new Map();

    for (const fila of filas) {
      if (porEvento[fila.evento] !== undefined) porEvento[fila.evento] += 1;
      if (fila.visita) {
        (visitas[fila.evento] ||= new Set()).add(fila.visita);
      }
      if (!fila.producto_id) continue;
      const sabor = sabores.get(fila.producto_id) || { producto_id: fila.producto_id, vistos: 0, agregados: 0 };
      if (fila.evento === "sabor_visto") sabor.vistos += 1;
      if (fila.evento === "carrito_agregar") sabor.agregados += 1;
      sabores.set(fila.producto_id, sabor);
    }

    // Los nombres al día: un sabor retirado del catálogo sigue apareciendo en su
    // medición (es útil saber que se veía mucho antes de retirarlo).
    const Producto = require("./Producto");
    const nombres = new Map((await Producto.listarTodos()).map((p) => [p.id, p.nombre_sabor]));

    const agregaron = visitas.carrito_agregar?.size ?? 0;
    const confirmaron = Number(confirmadas[0].total) || 0;

    return {
      dias,
      eventos: porEvento,
      embudo: {
        visitas_que_vieron: visitas.sabor_visto?.size ?? 0,
        visitas_que_agregaron: agregaron,
        visitas_que_empezaron_pedido: visitas.checkout_iniciado?.size ?? 0,
        visitas_que_confirmaron: confirmaron,
        // Se acota a 0 porque un pedido hecho sin que el navegador alcanzara a
        // mandar sus eventos no puede dar un abandono negativo.
        abandono: agregaron ? Math.max(0, Math.round(((agregaron - confirmaron) / agregaron) * 100)) : 0,
      },
      pedidos: { cantidad: Number(pedidos[0].total) || 0, dinero: Number(pedidos[0].dinero) || 0 },
      sabores: [...sabores.values()]
        .map((s) => ({ ...s, nombre: nombres.get(s.producto_id) || "Sabor retirado del catálogo" }))
        .sort((a, b) => b.vistos + b.agregados - (a.vistos + a.agregados)),
    };
  }
}

module.exports = Evento;
