import { ApiClient, Sesion } from "./api.js";
import { escucharGlobal } from "./registro-global.js";
import { STATS_MAX, BARRAS_STATS, statsDe } from "./stats-sabores.js";
import { idSabor, FOTOS } from "./sabores.js";

// Modelo: un producto del catálogo. Convierte el precio (la API lo envía como texto "4500.00").
export class Producto {
  constructor({ id, nombre_sabor, descripcion, precio_venta, cantidad_disponible }) {
    this.id = id;
    this.nombre = nombre_sabor;
    this.descripcion = descripcion ?? "";
    this.precio = Number(precio_venta);
    // Inventario: null = sin control (se hornea bajo pedido), 0 = agotado,
    // N = unidades que quedan. `disponible` es la pregunta del resto del sitio.
    this.cantidadDisponible =
      cantidad_disponible === null || cantidad_disponible === undefined ? null : Number(cantidad_disponible);
  }
  get disponible() { return this.cantidadDisponible === null || this.cantidadDisponible > 0; }
  // Aviso de inventario de la tarjeta: vacío cuando no hay nada que decir.
  get avisoStock() {
    if (!this.disponible) return "Agotado por ahora";
    if (this.cantidadDisponible !== null && this.cantidadDisponible <= 6) return `Quedan ${this.cantidadDisponible}`;
    return null;
  }
  get precioTexto() {
    return this.precio.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  }
}

// Servicio: el CRUD de productos contra la API.
export class ProductoServicio {
  constructor(api) { this.api = api; }
  async listar() { return (await this.api.get("/productos")).map((p) => new Producto(p)); }
  crear(datos) { return this.api.post("/productos", datos); }
  actualizar(id, datos) { return this.api.put(`/productos/${id}`, datos); }
  eliminar(id) { return this.api.eliminar(`/productos/${id}`); }
}

// idSabor y FOTOS viven en sabores.js (también los usa la foto del pedido).

// Familia de cada sabor, para los filtros del catálogo.
//   clasica = sabor individual de la marca
//   fusion  = mezcla de dos sabores en una galleta
//   edicion = edición especial con precio distinto
// Un sabor creado por el admin (que no esté aquí) no tiene familia, así que
// solo aparece cuando el cliente elige "Todas": nunca se le asigna una mentira.
export const FAMILIAS = {
  "monster": "clasica",
  "red-velvet": "clasica",
  "chocolate": "clasica",
  "areklim": "fusion",
  "chocoarequipe": "fusion",
  "red-monster": "fusion",
  "special-edition": "edicion",
};

// Etiquetas y orden de las familias del catálogo. El catálogo se dibuja como
// secciones separadas (una por familia) para que el cliente distinga de un
// vistazo los sabores clásicos de las fusiones y la edición especial.
export const FAMILIAS_INFO = {
  clasica: { titulo: "Clásicas", descripcion: "Los sabores de siempre de la marca: los que no fallan." },
  fusion:  { titulo: "Fusiones",  descripcion: "Dos sabores en una sola galleta, para los que no se deciden." },
  edicion: { titulo: "Edición especial", descripcion: "Lanzamientos limitados con combinación única." },
};
const ORDEN_FAMILIAS = ["clasica", "fusion", "edicion"];

// Sigilo de cada familia: el sprite pixel que sella la tarjeta del catálogo en
// su esquina (la galleta de las clásicas, la gema de las fusiones y la estrella
// de la edición especial). Es decoración de colección, no una afirmación sobre
// el producto: un sabor sin familia declarada no recibe sigilo.
export const SIGILOS = {
  clasica: { sprite: "galleta-pixel", vista: "0 0 16 16" },
  fusion: { sprite: "gema-pixel", vista: "0 0 12 12" },
  edicion: { sprite: "estrella-pixel", vista: "0 0 12 12" },
};

// Familia de un producto concreto (recibe su id de sabor ya normalizado).
export const familiaDe = (idSab) => FAMILIAS[idSab] || null;

// Vista: dibuja el catálogo (público) y el panel de administración (solo admin).
class ProductosVista {
  constructor(servicio) {
    this.servicio = servicio;
    this.productos = [];
    this.editandoId = null;
    this.familia = "todas"; // filtro activo del catálogo
    this.$ = (id) => document.getElementById(id);
    // Observador que revela las tarjetas del catálogo al entrar en pantalla
    // (con desfase). Se comparte entre redibujos para no crear uno por render.
    this.obsTarjetas = ("IntersectionObserver" in window)
      ? new IntersectionObserver((entradas) => {
          entradas.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add("visible");
            // La primera vez que una tarjeta entra en pantalla cuenta como que
            // el cliente vio ese sabor. Se avisa una sola vez por tarjeta: el
            // módulo de medición lo manda a la API (ver analitica.js).
            if (!e.target.dataset.visto) {
              e.target.dataset.visto = "1";
              window.dispatchEvent(new CustomEvent("sabor-visto", { detail: { id: Number(e.target.dataset.producto) } }));
            }
            this.obsTarjetas.unobserve(e.target); // una vez revelada, no se vuelve a animar
          });
        }, { threshold: 0, rootMargin: "0px 0px -40px 0px" })
      : null;
    this.$("form-producto").addEventListener("submit", (e) => this.guardar(e));
    this.$("btn-cancelar").addEventListener("click", () => this.limpiarForm());
    this.$("lista-productos").addEventListener("click", (e) => this.accion(e));
    this.$("filtros-catalogo").addEventListener("click", (e) => this.alFiltrar(e));
    escucharGlobal("productos:sesion", "sesion-cambio", () => this.pintar());
    this.cargar();
  }

  // Marca la categoría elegida y redibuja el catálogo. Los botones siguen
  // funcionando como atajo para ir directo a esa sección del catálogo.
  alFiltrar(e) {
    const boton = e.target.closest("button[data-familia]");
    if (!boton) return;
    this.familia = boton.dataset.familia;
    for (const f of this.$("filtros-catalogo").querySelectorAll("button[data-familia]")) {
      const activo = f === boton;
      f.classList.toggle("activo", activo);
      f.setAttribute("aria-pressed", String(activo));
      if (activo) { // pulso breve de confirmación en el botón elegido
        f.classList.remove("pulso");
        void f.offsetWidth; // reinicia la animación si ya estaba
        f.classList.add("pulso");
      }
    }
    this.pintar();
    // Al elegir una familia concreta se lleva el ojo a su sección.
    if (this.familia !== "todas") {
      document.getElementById(`familia-${this.familia}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  get esAdmin() { return Sesion.obtener()?.usuario?.rol === "admin"; }

  mensaje(texto, esError = true) {
    const p = this.$("mensaje-productos");
    p.textContent = texto;
    p.classList.toggle("ok", !esError);
  }

  // Mientras llega el menú: tarjetas de "cargando" en vez de un hueco vacío,
  // que con internet lento parecía que no hubiera galletas. pintar() las
  // reemplaza al llegar el catálogo; si falla, se quitan y queda el mensaje.
  #pintarCargando() {
    const lista = this.$("lista-productos");
    if (lista.children.length) return;
    lista.setAttribute("aria-busy", "true");
    const tarjetas = Array.from({ length: 3 }, (_, i) => {
      const li = document.createElement("li");
      li.className = "producto-cargando";
      li.setAttribute("aria-hidden", "true");
      li.style.setProperty("--retraso", `${i * 0.15}s`);
      for (const clase of ["cargando-galleta", "cargando-linea", "cargando-linea corta"]) {
        const parte = document.createElement("span");
        parte.className = clase;
        li.append(parte);
      }
      return li;
    });
    const aviso = document.createElement("li");
    aviso.className = "cargando-texto";
    aviso.textContent = "Sacando las galletas del horno…";
    lista.replaceChildren(aviso, ...tarjetas);
  }

  async cargar() {
    window.__catalogoPixel = null; // el de la página anterior ya no vale
    this.#pintarCargando();
    try {
      this.productos = await this.servicio.listar();
      this.$("lista-productos").removeAttribute("aria-busy");
      this.pintar();
      // El carrito guardado se pone al día con esto (ver pedidos.js).
      window.__catalogoPixel = this.productos;
      window.dispatchEvent(new CustomEvent("catalogo-cargado", { detail: this.productos }));
    } catch (error) {
      const lista = this.$("lista-productos");
      lista.removeAttribute("aria-busy");
      lista.replaceChildren(); // sin tarjetas de "cargando" eternas
      this.mensaje(error.message);
    }
  }

  // Sello de familia de una tarjeta: una placa con el sigilo de su familia.
  // Devuelve null cuando el sabor no tiene familia (por ejemplo, uno creado
  // desde el panel de administración): mejor sin sello que con uno falso.
  sello(p) {
    const familia = familiaDe(idSabor(p.nombre));
    const sigilo = SIGILOS[familia];
    if (!sigilo) return null;
    const placa = document.createElement("span");
    placa.className = "sello-sabor";
    placa.dataset.familia = familia;
    placa.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", sigilo.vista);
    svg.setAttribute("shape-rendering", "crispEdges");
    const uso = document.createElementNS("http://www.w3.org/2000/svg", "use");
    uso.setAttribute("href", `#${sigilo.sprite}`);
    svg.append(uso);
    placa.append(svg);
    return placa;
  }

  // Ficha de personaje desplegable ("Ver stats"). <details> nativo: se abre con
  // toque o teclado y los lectores de pantalla lo anuncian sin código extra.
  ficha(idSab) {
    const s = statsDe(idSab);
    if (!s) return null;
    const detalles = document.createElement("details");
    detalles.className = "ficha-sabor";
    const resumen = document.createElement("summary");
    resumen.textContent = "Ver stats";
    const clase = document.createElement("p");
    clase.className = "ficha-clase";
    clase.textContent = s.clase;
    const lista = document.createElement("ul");
    lista.className = "ficha-barras";
    for (const barra of BARRAS_STATS) {
      const fila = document.createElement("li");
      const etiqueta = document.createElement("span");
      etiqueta.className = "ficha-nombre";
      etiqueta.textContent = `${barra.icono} ${barra.nombre}`;
      const medidor = document.createElement("span");
      medidor.className = "ficha-medidor";
      medidor.setAttribute("role", "img");
      medidor.setAttribute("aria-label", `${barra.nombre}: ${s[barra.clave]} de ${STATS_MAX}`);
      for (let i = 1; i <= STATS_MAX; i++) {
        const bloque = document.createElement("i");
        if (i <= s[barra.clave]) bloque.className = "lleno";
        medidor.append(bloque);
      }
      fila.append(etiqueta, medidor);
      lista.append(fila);
    }
    const nota = document.createElement("p");
    nota.className = "ficha-nota";
    nota.textContent = "Como todas: crujiente por fuera, suave por dentro.";
    detalles.append(resumen, clase, lista, nota);
    return detalles;
  }

  // Dibuja una tarjeta de producto del catálogo (foto, nombre, precio y botón).
  tarjeta(p) {
    const li = document.createElement("li");
    li.className = "producto";
    li.dataset.sabor = idSabor(p.nombre);
    li.dataset.producto = p.id; // para la medición ("vio este sabor")
    // Un sabor agotado se apaga sin desaparecer: el cliente ve que existe y que
    // hoy no hay, en vez de preguntarse por qué falta del catálogo.
    if (!p.disponible) li.classList.add("agotado");
    if (FOTOS.has(li.dataset.sabor)) {
      li.dataset.foto = "si";
      const foto = document.createElement("img");
      foto.className = "foto-sabor";
      // En la tarjeta basta la de 320 px (el navegador elige con srcset);
      // al ampliarla, visor.js usa la grande (data-grande).
      const grande = `/img/sabores/${li.dataset.sabor}.webp`;
      foto.sizes = "(max-width: 40rem) 38vw, 200px";
      foto.srcset = `/img/sabores/chico/${li.dataset.sabor}.webp 320w, ${grande} 480w`;
      foto.src = grande;
      foto.dataset.grande = grande;
      foto.alt = `Galleta real ${p.nombre}`;
      foto.width = 480;
      foto.height = 480;
      foto.loading = "lazy";
      li.append(foto);
    }
    const info = document.createElement("div");
    const nombre = document.createElement("strong");
    nombre.textContent = p.nombre;
    info.append(nombre);
    // La descripción solo entra si existe: un producto sin descripción (por
    // ejemplo uno creado desde el panel sin rellenarla) no deja una línea
    // vacía debajo del nombre. El <br> de debajo va oculto por el CSS.
    if (p.descripcion.trim()) {
      const desc = document.createElement("small");
      desc.textContent = p.descripcion;
      info.append(document.createElement("br"), desc);
    }
    const ficha = this.ficha(li.dataset.sabor);
    if (ficha) info.append(ficha);
    // "Quedan 3" empuja la decisión; "Agotado" evita que el cliente arme un
    // carrito que no se puede servir.
    const aviso = p.avisoStock;
    if (aviso) {
      const stock = document.createElement("small");
      stock.className = p.disponible ? "stock stock-pocas" : "stock stock-agotado";
      stock.textContent = aviso;
      info.append(document.createElement("br"), stock);
    }
    const precio = document.createElement("b");
    precio.textContent = p.precioTexto;
    li.append(info, precio);
    // Sello de familia en la esquina (decorativo y fuera de la rejilla: va
    // posicionado, así no altera las filas de la tarjeta).
    const sello = this.sello(p);
    if (sello) li.append(sello);
    // Botón para agregar la galleta al carrito de pedidos (para todos).
    const agregar = document.createElement("button");
    agregar.type = "button";
    agregar.className = "btn-agregar";
    agregar.dataset.agregar = p.id;
    if (p.disponible) {
      agregar.textContent = "＋ Carrito";
      agregar.title = `Agregar ${p.nombre} al carrito`;
    } else {
      // El botón sigue visible pero desactivado: así el cliente entiende por qué
      // no puede agregarlo (no se puede vender lo que no hay).
      agregar.textContent = "Agotado";
      agregar.title = `${p.nombre} está agotado por ahora`;
      agregar.disabled = true;
    }
    li.append(agregar);
    if (this.esAdmin) {
      const acciones = document.createElement("div");
      acciones.className = "acciones";
      // El botón de inventario cambia de nombre según el estado: desde la
      // misma tarjeta el obrador deja un sabor agotado o lo vuelve a poner.
      for (const [accion, texto] of [
        ["editar", "Editar"],
        ["agotar", p.disponible ? "Marcar agotado" : "Volver a disponible"],
        ["eliminar", "Eliminar"],
      ]) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = texto;
        b.dataset.accion = accion; b.dataset.id = p.id;
        acciones.append(b);
      }
      li.append(acciones);
    }
    return li;
  }

  // Crea el encabezado de una sección de familia (etiqueta + título + recuento).
  cabeceraFamilia(clave, cantidad) {
    const info = FAMILIAS_INFO[clave];
    const cab = document.createElement("li");
    cab.className = "familia-cabecera";
    // Ancla de la sección: al pulsar un filtro ("Clásicas", "Fusiones"…) el
    // catálogo se desplaza hasta aquí. Sin este id, el getElementById de
    // alFiltrar no encontraba nada y el ojo se quedaba donde estaba.
    cab.id = `familia-${clave}`;
    const etiqueta = document.createElement("p");
    etiqueta.className = "etiqueta";
    // "sabores" y no "galletas": son opciones del menú, no unidades del pedido.
    etiqueta.textContent = `${cantidad} ${cantidad === 1 ? "sabor" : "sabores"}`;
    const titulo = document.createElement("h3");
    titulo.textContent = info.titulo;
    const desc = document.createElement("p");
    desc.className = "familia-desc";
    desc.textContent = info.descripcion;
    cab.append(etiqueta, titulo, desc);
    return cab;
  }

  // La cifra de sabores que anuncia el sitio (la portada, la banda de comunidad
  // y la consola de la pantalla de título) sigue al catálogo REAL en vez de
  // quedarse escrita a mano: cuando se retiró la Chocoarequipe el sitio se
  // quedó anunciando 7 sabores con 6 en la base de datos. Ahora, si el admin
  // agrega o retira un sabor, las tres cifras se corrigen solas.
  sincronizarSabores() {
    const total = this.productos.length;
    document.querySelectorAll("[data-sabores]").forEach((el) => {
      const texto = el.dataset.sabores === "cifra" ? String(total) : `> CARGANDO ${total} SABORES…`;
      if (el.textContent !== texto) el.textContent = texto;
    });
  }

  // Todo el texto entra con textContent: nunca se interpreta como HTML.
  // El catálogo se divide en secciones por familia para evitar confusión.
  pintar() {
    this.$("admin-productos").hidden = !this.esAdmin;
    this.sincronizarSabores();
    const lista = this.$("lista-productos");
    // Si hay un observador previo, se suelta antes de vaciar la lista.
    if (this.obsTarjetas) this.obsTarjetas.disconnect();
    lista.replaceChildren();
    let visibles = 0;
    const familias = this.familia === "todas" ? ORDEN_FAMILIAS : [this.familia];
    for (const clave of familias) {
      const items = this.productos.filter((p) => familiaDe(idSabor(p.nombre)) === clave);
      if (!items.length) continue; // una familia vacía no dibuja su sección
      lista.append(this.cabeceraFamilia(clave, items.length));
      items.forEach((p, indice) => {
        const tarjeta = this.tarjeta(p);
        tarjeta.style.setProperty("--i", indice); // desfase escalonado por índice
        lista.append(tarjeta);
        // Sin soporte de IntersectionObserver la tarjeta queda visible desde el inicio.
        if (this.obsTarjetas) this.obsTarjetas.observe(tarjeta);
        else tarjeta.classList.add("visible");
        visibles++;
      });
    }
    // Contador para el lector de pantalla: al filtrar, anuncia cuántos sabores
    // quedan. En pantalla no se ve (suelto a la derecha parecía un error, y
    // cada familia ya dice cuántos sabores tiene).
    this.$("catalogo-contador").textContent =
      visibles === this.productos.length
        ? `${visibles} ${visibles === 1 ? "sabor" : "sabores"} en el menú`
        : `Mostrando ${visibles} de ${this.productos.length} sabores`;
  }

  // Ejecuta una operación; si la API responde que la sesión venció, avisa a la vista de acceso.
  async ejecutar(operacion, textoOk) {
    const habiaSesion = !!Sesion.obtener();
    try {
      await operacion();
      this.mensaje(textoOk, false);
      await this.cargar();
      return true;
    } catch (error) {
      this.mensaje(error.message);
      if (habiaSesion && !Sesion.obtener()) window.dispatchEvent(new Event("sesion-vencida"));
      return false;
    }
  }

  async guardar(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    // Inventario: el campo vacío significa "sin control de inventario" (se
    // hornea bajo pedido), que es distinto de 0 (agotado).
    const disponibles = String(f.get("disponibles") ?? "").trim();
    const datos = {
      nombre_sabor: f.get("nombre").trim(),
      descripcion: f.get("descripcion").trim(),
      precio_venta: Number(f.get("precio")),
      cantidad_disponible: disponibles === "" ? null : Number(disponibles),
    };
    const id = this.editandoId;
    const ok = await this.ejecutar(
      () => (id ? this.servicio.actualizar(id, datos) : this.servicio.crear(datos)),
      id ? "Producto actualizado." : "Producto creado."
    );
    if (ok) this.limpiarForm(false);
  }

  accion(e) {
    // Botón "＋ Carrito": avisa al módulo de pedidos que este producto se agrega.
    const agregar = e.target.closest("button[data-agregar]");
    if (agregar) {
      const producto = this.productos.find((p) => p.id === Number(agregar.dataset.agregar));
      if (producto) window.dispatchEvent(new CustomEvent("agregar-al-carrito", { detail: producto }));
      return;
    }
    const boton = e.target.closest("button[data-accion]");
    if (!boton) return;
    const producto = this.productos.find((p) => p.id === Number(boton.dataset.id));
    if (!producto) return;
    if (boton.dataset.accion === "agotar") {
      // Marcar agotado es poner 0 unidades; volver a disponible es quitar el
      // control de inventario (null), no poner un número inventado.
      this.ejecutar(
        () => this.servicio.actualizar(producto.id, { cantidad_disponible: producto.disponible ? 0 : null }),
        producto.disponible ? "Sabor marcado como agotado." : "Sabor disponible otra vez."
      );
      return;
    }
    if (boton.dataset.accion === "editar") {
      const f = this.$("form-producto");
      f.nombre.value = producto.nombre;
      f.descripcion.value = producto.descripcion;
      f.precio.value = producto.precio;
      f.disponibles.value = producto.cantidadDisponible ?? "";
      this.editandoId = producto.id;
      this.$("btn-guardar").textContent = "Guardar cambios";
      this.$("btn-cancelar").hidden = false;
      this.mensaje("");
      f.nombre.focus();
    } else if (confirm(`¿Eliminar "${producto.nombre}"?`)) {
      this.ejecutar(() => this.servicio.eliminar(producto.id), "Producto eliminado.");
    }
  }

  limpiarForm(borrarMensaje = true) {
    this.$("form-producto").reset();
    this.editandoId = null;
    this.$("btn-guardar").textContent = "Agregar galleta";
    this.$("btn-cancelar").hidden = true;
    if (borrarMensaje) this.mensaje("");
  }
}

// Solo arranca cuando existe la página (así los módulos también se pueden probar sin navegador).
if (typeof document !== "undefined") new ProductosVista(new ProductoServicio(new ApiClient()));
