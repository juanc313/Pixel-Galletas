// Efectos de la página: revelado al hacer scroll, cinta animada, pulso de
// bienvenida, destellos en botones, contador de carrito con latido,
// barra de progreso, menú activo, tarjetas con inclinación 3D y galleta
// que vuela hacia el carrito. Si algo falla aquí, se desactiva el modo
// animación para que todo siga visible.

try {
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const puedeTocar = matchMedia("(hover: hover)").matches;

  // ===== Revelado de secciones al hacer scroll =====
  const observables = document.querySelectorAll("[data-reveal]");
  if (reducido || !("IntersectionObserver" in window)) {
    observables.forEach((el) => el.classList.add("visible"));
  } else {
    const o = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("visible");
          o.unobserve(e.target);
        });
      },
      { threshold: 0, rootMargin: "0px 0px -40px 0px" }
    );
    observables.forEach((el) => o.observe(el));
  }

  // ===== Cinta de sabores: se rellena con los nombres y se desplaza =====
  const pista = document.querySelector(".cinta-pista");
  if (pista) {
    fetch("/api/productos")
      .then((r) => (r.ok ? r.json() : []))
      .then((productos) => {
        const nombres = (Array.isArray(productos) ? productos : [])
          .map((p) => p.nombre_sabor ?? p.nombre)
          .filter(Boolean);
        if (!nombres.length) return;
        const items = nombres.map((n) => `<span>${n}</span><b aria-hidden="true">◆</b>`).join("");
        pista.innerHTML = items + items; // dos copias: el desplazamiento -50% queda sin costura
      })
      .catch(() => {});
  }

  // ===== Barra de progreso de lectura y estado de la barra superior =====
  const barra = document.querySelector(".barra");
  const progreso = document.querySelector(".progreso-lectura");
  if (barra || progreso) {
    let pendiente = false;
    addEventListener("scroll", () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        if (barra) barra.classList.toggle("desplazada", scrollY > 8);
        if (progreso) {
          const max = document.documentElement.scrollHeight - innerHeight;
          progreso.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
        }
      });
    }, { passive: true });
  }

  // ===== Enlace del menú de la sección que se está viendo =====
  const enlaces = new Map(
    [...document.querySelectorAll('.menu a[href^="#"]')].map((a) => [a.getAttribute("href").slice(1), a])
  );
  const secciones = [...enlaces.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  if (secciones.length && "IntersectionObserver" in window) {
    const obsSecciones = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (!e.isIntersecting) return;
          enlaces.forEach((a) => a.classList.remove("actual"));
          enlaces.get(e.target.id)?.classList.add("actual");
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    secciones.forEach((s) => obsSecciones.observe(s));
  }

  // ===== Tarjetas del catálogo con inclinación 3D =====
  // Se delega en la lista porque el catálogo se vuelve a dibujar con cada carga.
  const lista = document.getElementById("lista-productos");
  if (lista && !reducido && puedeTocar) {
    let tarjetaActual = null;
    const limpiar = (t) => {
      t.style.setProperty("--rx", "0deg");
      t.style.setProperty("--ry", "0deg");
    };
    lista.addEventListener("mousemove", (e) => {
      const tarjeta = e.target.closest(".producto");
      if (tarjeta !== tarjetaActual) {
        if (tarjetaActual) limpiar(tarjetaActual);
        tarjetaActual = tarjeta;
      }
      if (!tarjeta) return;
      const r = tarjeta.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      tarjeta.style.setProperty("--rx", `${(-y * 5).toFixed(2)}deg`);
      tarjeta.style.setProperty("--ry", `${(x * 6).toFixed(2)}deg`);
    });
    lista.addEventListener("mouseleave", () => {
      if (tarjetaActual) limpiar(tarjetaActual);
      tarjetaActual = null;
    });
  }

  // ===== Galleta que vuela hacia el carrito al agregar una =====
  const contador = document.getElementById("carrito-contador");
  let tarjetaOrigen = null;
  document.addEventListener(
    "click",
    (e) => {
      const boton = e.target.closest(".btn-agregar");
      if (boton) tarjetaOrigen = boton.closest(".producto");
    },
    true
  );
  window.addEventListener("agregar-al-carrito", () => {
    if (reducido || !tarjetaOrigen || !contador) return;
    const fuente = tarjetaOrigen.querySelector(".foto-sabor");
    if (!fuente || !fuente.animate) return;
    const a = fuente.getBoundingClientRect();
    const z = contador.getBoundingClientRect();
    const clon = fuente.cloneNode(true);
    clon.className = "galleta-voladora";
    const lado = a.width * 0.6;
    Object.assign(clon.style, {
      left: `${a.left + (a.width - lado) / 2}px`,
      top: `${a.top + (a.height - lado) / 2}px`,
      width: `${lado}px`,
      height: `${lado}px`,
    });
    document.body.append(clon);
    const dx = z.left + z.width / 2 - (a.left + a.width / 2);
    const dy = z.top + z.height / 2 - (a.top + a.height / 2);
    const vuelo = clon.animate(
      [
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.35 - 90}px) scale(.85) rotate(170deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(.15) rotate(420deg)`, opacity: 0.25 },
      ],
      { duration: 750, easing: "cubic-bezier(.3,.7,.4,1)" }
    );
    // onfinish no llega en todos los navegadores: se elimina por promesa y por red de seguridad.
    const fuera = () => clon.remove();
    vuelo.onfinish = fuera;
    vuelo.finished.then(fuera).catch(fuera);
    setTimeout(fuera, 1100);
  });

  // ===== Punto de bienvenida que cruza la pantalla al cargar =====
  if (!reducido) {
    const punto = document.createElement("span");
    punto.className = "punto-bienvenida";
    document.body.append(punto);
    punto.addEventListener("animationend", () => punto.remove());
  }

  // ===== Latido al agregar algo al carrito =====
  if (contador && "MutationObserver" in window) {
    new MutationObserver(() => {
      if (reducido) return;
      contador.classList.remove("latido");
      void contador.offsetWidth; // reinicia la animación
      contador.classList.add("latido");
    }).observe(contador, { childList: true, subtree: true, characterData: true });
  }

  window.__efectosListo = true;
} catch (error) {
  // Sin efectos la página sigue siendo usable y visible.
  console.warn("Efectos desactivados:", error);
  document.documentElement.classList.remove("js-anim");
}
