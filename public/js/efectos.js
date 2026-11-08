// Efectos de la página: revelado al hacer scroll, cinta animada, pulso de
// bienvenida, destellos en botones, contador de carrito con latido,
// barra de progreso, menú activo, tarjetas con inclinación 3D y galleta
// que vuela hacia el carrito. Si algo falla aquí, se desactiva el modo
// animación para que todo siga visible.

if (!window.__efectosIniciados) {
window.__efectosIniciados = true;
try {
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const puedeTocar = matchMedia("(hover: hover)").matches;

  // ===== Entrada: pantalla de título con menú de juego =====
  // El overlay viene oculto en el HTML: se muestra una sola vez por sesión y
  // nunca con movimiento reducido. Tras el prólogo cinematográfico (CSS) sale
  // un menú de título que ESPERA al jugador: flechas + Enter, ratón o tacto.
  // Esc, la ✕ o un toque en el fondo salen, y la escena NO se cierra sola:
  // espera al jugador todo lo que haga falta (un cierre automático castigaba
  // justo a quien se la estaba mirando, y a los 20 s pulsar una categoría ya
  // no hacía nada). La red, si este módulo no llegara a cargar, vive en el
  // <head>: a los 4 s ese script saca la escena del DOM.
  const entrada = document.getElementById("entrada");
  if (entrada) {
    // Enlace directo: ?directo=1 entra siempre al catálogo sin escena (para
    // compartir URLs que no quieran el póster), y ?empezar=1 juega la escena
    // pero salta el menú: la coreografía completa y de una al catálogo.
    const directo = /^1$/.test(new URLSearchParams(location.search).get("directo") || "");
    const empiezaSolo = /^1$/.test(new URLSearchParams(location.search).get("empezar") || "");
    let vista = true;
    try { vista = sessionStorage.getItem("pixel_galletas_entrada") === "1"; } catch { /* sin sessionStorage */ }
    if (reducido || vista || directo) {
      entrada.remove();
      // El velo solo existía para que la escena no empezara velada.
      document.documentElement.classList.remove("velado");
    } else {
      try { sessionStorage.setItem("pixel_galletas_entrada", "1"); } catch { /* sin sessionStorage */ }
      entrada.hidden = false;
      // El velo del <head> mantuvo la página invisible hasta que la escena
      // tapa el viewport (fin del CRT): aquí se levanta. Si el CRT ya había
      // terminado o no corre, enseguida; el temporizador es la red por si la
      // animación no vuelve a avisar (o el webview no compone).
      const quitarVelo = () => document.documentElement.classList.remove("velado");
      entrada.addEventListener("animationend", (e) => {
        if (e.animationName === "entrada-crt") quitarVelo();
      });
      setTimeout(quitarVelo, 900);

      // Hueco del menú de título, medido una sola vez y en píxeles reales
      // (desde su borde superior hasta el fondo, más un aire de seguridad) y
      // publicado como --reserva-menu: con él, la barra "Horneando…" queda
      // entre el logo y las opciones en cualquier ventana, sin números mágicos
      // que se queden cortos al estrecharse. Se mide con offsetTop (ignora
      // transformaciones, así no le afecta la entrada animada del diálogo) y
      // no se vuelve a medir: cuando la fuente pixel termina de llegar, el
      // menú crece esos pocos píxeles contra el aire de seguridad y la barra
      // no se mueve (mejor un hueco algo menor que un salto de la escena).
      const menuEntrada = entrada.querySelector(".entrada-menu");
      if (menuEntrada) {
        const reserva = entrada.clientHeight - menuEntrada.offsetTop + 12;
        entrada.style.setProperty("--reserva-menu", `${reserva}px`);
      }

      // El nombre entra letra a letra: cada carácter recibe su propio desfase
      // (--l) y el CSS hace el rebote. Los espacios se vuelven \u00A0 para que
      // el salto de palabra no se desmonte durante la animación.
      const nombreEntrada = entrada.querySelector(".entrada-nombre");
      if (nombreEntrada) {
        // Se construye con DOM, no con innerHTML: cada letra es texto, nunca HTML.
        nombreEntrada.replaceChildren(
          ...[...nombreEntrada.textContent].map((c, i) => {
            const letra = document.createElement("span");
            letra.style.setProperty("--l", String(i));
            letra.textContent = c === " " ? "\u00A0" : c;
            return letra;
          })
        );
      }

      // Brasas y píxeles detrás de la escena: el mismo lenguaje de la portada,
      // en una versión corta. Se apagan solas en cuanto se retira la entrada
      // (el bucle comprueba si el lienzo sigue colgado del documento).
      const lienzoEntrada = entrada.querySelector(".entrada-lienzo");
      if (lienzoEntrada && lienzoEntrada.getContext) {
        const ctx = lienzoEntrada.getContext("2d");
        const CALIDAS = ["#F5902F", "#FFB25C", "#E5412B"];
        const FRESCOS = ["#4DE8D0", "#FFF3DC"];
        let brasas = [], anchoE = 0, altoE = 0;
        const nuevaBrasa = (semilla) => {
          const brasa = Math.random() < 0.65;
          return {
            brasa,
            x: Math.random() * anchoE,
            y: semilla ? Math.random() * altoE : (brasa ? altoE + 6 : -6),
            l: 2 + ((Math.random() * 3) | 0),
            v: brasa ? -(0.25 + Math.random() * 0.55) : 0.2 + Math.random() * 0.45,
            a: 0.35 + Math.random() * 0.4,
            c: brasa ? CALIDAS[(Math.random() * CALIDAS.length) | 0]
                     : FRESCOS[(Math.random() * FRESCOS.length) | 0],
          };
        };
        const ajustarEntrada = () => {
          const r = lienzoEntrada.getBoundingClientRect();
          const dpr = Math.min(devicePixelRatio || 1, 2);
          anchoE = r.width; altoE = r.height;
          lienzoEntrada.width = anchoE * dpr; lienzoEntrada.height = altoE * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          brasas = Array.from(
            { length: Math.max(16, Math.min(32, Math.round(anchoE / 38))) },
            () => nuevaBrasa(true)
          );
        };
        const pintarEntrada = () => {
          if (!lienzoEntrada.isConnected) return;   // la entrada ya no está: fin del bucle
          ctx.clearRect(0, 0, anchoE, altoE);
          for (const b of brasas) {
            b.y += b.v;
            if ((b.brasa && b.y < -8) || (!b.brasa && b.y > altoE + 8)) {
              Object.assign(b, nuevaBrasa(false));
            }
            ctx.globalAlpha = b.a;
            ctx.fillStyle = b.c;
            ctx.fillRect(b.x | 0, b.y | 0, b.l, b.l);
          }
          ctx.globalAlpha = 1;
          requestAnimationFrame(pintarEntrada);
        };
        ajustarEntrada();
        pintarEntrada();
      }

      // Marcador arcade: los puntos suben con ease-out hasta 3.600 mientras
      // dura la escena (múltiplos de 50, formato de 6 dígitos). Bucle propio
      // que se apaga en cuanto el marcador ya no está colgado del documento.
      const puntosEntrada = entrada.querySelector("#entrada-puntos");
      if (puntosEntrada) {
        let base = 0;
        let bonus = 0;
        const pintarPuntos = () => { puntosEntrada.textContent = String(base + bonus).padStart(6, "0"); };
        const inicioPuntos = performance.now();
        const marcarPuntos = (ahora) => {
          if (!puntosEntrada.isConnected) return;
          const p = Math.min(1, (ahora - inicioPuntos) / 1900);
          const suave = 1 - Math.pow(1 - p, 3);
          base = Math.round((3600 * suave) / 50) * 50;
          const valor = base + bonus;
          puntosEntrada.textContent = String(valor).padStart(6, "0");
          if (p < 1) requestAnimationFrame(marcarPuntos);
        };
        requestAnimationFrame(marcarPuntos);

        // Premios coleccionables: las galletas, monedas, estrellas y corazones
        // que flotan en la escena se recogen con un clic y suman 100 puntos.
        // Es un adorno jugable: no guarda nada ni toca el pedido.
        entrada.addEventListener("click", (e) => {
          const icono = e.target.closest?.(".entrada-icono");
          if (!icono) return;
          bonus += 100;
          pintarPuntos();
          const caja = icono.getBoundingClientRect();
          const suma = document.createElement("span");
          suma.className = "entrada-suma";
          suma.textContent = "+100";
          suma.style.left = `${caja.left + caja.width / 2}px`;
          suma.style.top = `${caja.top}px`;
          entrada.appendChild(suma);
          suma.addEventListener("animationend", () => suma.remove(), { once: true });
        });
      }

      // Contador de la barra "Cargando": 0 → 100 % al mismo ritmo que el
      // relleno CSS (entrada-cargar: .95 s que arrancan a los 1,3 s). Sin este
      // bucle el rótulo igual termina en "100 % · ¡Listo!", porque ese relevo
      // lo hace el CSS: el número es un adorno que nunca deja el sitio a medias.
      const porcentajeCarga = entrada.querySelector("#entrada-carga-pct");
      if (porcentajeCarga) {
        const inicioCarga = performance.now();
        const marcarCarga = (ahora) => {
          if (!porcentajeCarga.isConnected) return;
          const p = Math.min(1, Math.max(0, (ahora - inicioCarga - 1300) / 950));
          porcentajeCarga.textContent = String(Math.round(p * 100));
          if (p < 1) requestAnimationFrame(marcarCarga);
        };
        requestAnimationFrame(marcarCarga);
      }

      // Audio del juego: jingle de apertura, el tic del cursor, la firma sonora
      // de cada categoría y la fanfarria del modo secreto. Todo original (onda
      // cuadrada, como el resto del juego).
      //
      // Los navegadores no dejan sonar NADA antes de un gesto real del jugador,
      // así que el AudioContext nace en el primer gesto —un clic, una tecla o
      // un toque—, que es justo cuando se elige una categoría; a partir de ahí
      // el cursor ya suena. Antes de ese primer gesto el tic es mudo porque no
      // hay manera de que suene. Si el navegador lo niega, todo se calla sin
      // errores ni avisos.
      let ac = null;
      const activado = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
      const despertar = () => {
        if (reducido || !activado()) return;
        try {
          if (!ac) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            ac = new AC();
          }
          if (ac.state === "suspended") ac.resume().catch(() => {});
        } catch { ac = null; }
      };
      const nota = (f, t0, d, g = 0.045) => {
        const o = ac.createOscillator(), v = ac.createGain();
        o.type = "square"; o.frequency.value = f;
        v.gain.setValueAtTime(g, t0);
        v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(v); v.connect(ac.destination);
        o.start(t0); o.stop(t0 + d + 0.02);
      };
      const suena = () => ac && ac.state === "running";
      const jingle = () => {
        if (!suena()) return;
        const base = ac.currentTime + 0.05;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nota(f, base + i * 0.09, 0.16));
        nota(1567.98, base + 0.4, 0.35);      // nota alta final del power-up
        nota(2093, base + 0.42, 0.22, 0.03);  // brillo por encima
      };
      // Paleta de la entrada: cada categoría tiene su tic de cursor —agudo, muy
      // corto y en subida conforme baja el menú— y su firma al pulsarla, para
      // distinguirlas de oído y no solo de vista.
      const SONIDOS = {
        empezar:  { tic: 1046.5, firma: [523.25, 659.25, 783.99, 1046.5] },  // arranque en subida
        sabores:  { tic: 1174.66, firma: [987.77, 1318.51] },                // moneda de arcade
        creditos: { tic: 1318.51, firma: [783.99, 1046.5, 1318.51] },        // acorde de cierre
        secreto:  { tic: 1567.98, firma: [1318.51, 1567.98, 2093] },         // trino dorado
      };
      // Tic del cursor. El simple paso del ratón no es un gesto válido para
      // arrancar audio: si el documento ya tiene activación (el jugador ya
      // pulsó algo), se despierta y suena; si no, se queda mudo sin ruido.
      const ticDe = (op) => {
        if (!suena()) despertar();
        if (!suena()) return;
        const sonido = op && SONIDOS[op.dataset.accion];
        nota(sonido ? sonido.tic : 880, ac.currentTime + 0.005, 0.05, 0.03);
      };
      // Firma de la categoría al pulsarla: notas en escalera y la última
      // quedándose sonando —el "ya entramos"—. Sin firma propia, el confirmar
      // de siempre.
      const firmaDe = (op) => {
        despertar();
        if (!suena()) return;
        const sonido = op && SONIDOS[op.dataset.accion];
        if (!sonido) { confirmar(); return; }
        const base = ac.currentTime + 0.01;
        sonido.firma.forEach((f, i) =>
          nota(f, base + i * 0.07, i === sonido.firma.length - 1 ? 0.24 : 0.09, 0.04));
      };
      const confirmar = () => {
        if (!suena()) return;
        nota(1046.5, ac.currentTime + 0.01, 0.1, 0.035);
        nota(1568, ac.currentTime + 0.08, 0.14, 0.035);
      };
      const fanfarria = () => {
        if (!suena()) return;
        [659.25, 830.61, 987.77, 1318.51].forEach((f, i) => nota(f, ac.currentTime + 0.02 + i * 0.08, 0.2, 0.04));
      };
      // Con la activación ya concedida (al reabrir la escena sin recargar), el
      // jingle de apertura puede sonar de una.
      if (!reducido && activado()) {
        despertar();
        if (ac && ac.state === "running") jingle();
        else if (ac) ac.resume().then(jingle, () => {});
      }

      // ===== Menú de título: el juego espera al jugador =====
      const menu = entrada.querySelector(".entrada-menu");
      const visibles = () =>
        [...entrada.querySelectorAll(".entrada-op")].filter((o) => getComputedStyle(o).display !== "none");
      let indice = 0;
      const pintarActiva = () => {
        // Se limpia TODA opción antes de marcar: las ocultas del panel no
        // deben conservar la clase (aunque no se vean, confunden al consultarlas).
        entrada.querySelectorAll(".entrada-op").forEach((o) => o.classList.remove("activa"));
        const ops = visibles();
        ops.forEach((o, i) => o.classList.toggle("activa", i === indice));
      };
      const mover = (delta) => {
        const ops = visibles();
        if (!ops.length) return;
        indice = (indice + delta + ops.length) % ops.length;
        pintarActiva();
        ticDe(ops[indice]);
      };

      const cerrar = () => {
        entrada.remove();
        quitarVelo();
        removeEventListener("keydown", teclas);
      };
      // La elección no corta de golpe: se toma su tiempo, como la cinemática
      // de un jefe final. 3,5 s de "selección" al estilo 8 bits (la opción
      // elegida parpadea, crece y llena su barra interna mientras las demás se
      // apagan) y 1 s de vuelo del logo hasta su hueco real de la cabecera, al
      // lado del nombre PIXEL GALLETAS. --iris-* es el punto donde cierra el
      // iris y --vuela-* el salto del logo hasta el logo de la barra.
      const SELECCION = 3500;
      const VUELO = 1000;
      let eligiendo = false;
      const terminar = (irA, op) => {
        if (eligiendo) return;
        eligiendo = true;
        removeEventListener("keydown", teclas);
        firmaDe(op);   // cada categoría entra con su propio sonido
        if (op) op.classList.add("elegida");
        entrada.classList.add("entrada-elegida");

        // Destino del vuelo: lo resuelve la Fase 2, en el instante del
        // despegue, y la Fase 3 lo reutiliza para el relevo. Fuera de aquí, no
        // se usa para nada más.
        let marca = null;    // el logo real de la cabecera
        let vuela = false;   // ¿hay destino medible al que volar?

        // Fase 2 (3,5-4,5 s): el logo despega hacia el logo real de la barra
        // con un FLIP de verdad —se miden AQUÍ los dos rectángulos, el destino
        // y el actual (que ya trae la escala de la selección)— y el vuelo anima
        // ese delta exacto en translate + scale. Como son propiedades aparte de
        // transform, el delta se compone con el tamaño que el logo ya tenía: ni
        // un salto al despegar ni un píxel de error al aterrizar, en cualquier
        // ventana. El iris cierra sobre ese mismo punto.
        setTimeout(() => {
          if (!entrada.isConnected) return;
          marca = document.querySelector(".barra .marca img");
          const m = marca ? marca.getBoundingClientRect() : null;
          const logo = entrada.querySelector(".entrada-logo");
          const l = logo ? logo.getBoundingClientRect() : null;
          // Las dos cajas tienen que ser medibles: sin destino claro no se
          // vuela (la clase .entrada-sin-destino apaga el logo con la escena).
          vuela = !!(m && l && m.width && l.width && l.height && logo.offsetWidth);
          if (vuela) {
            const cx = m.left + m.width / 2, cy = m.top + m.height / 2;
            entrada.style.setProperty("--iris-x", `${cx}px`);
            entrada.style.setProperty("--iris-y", `${cy}px`);
            // Escala con la que despega (rect actual / caja de maquetación) y
            // delta hasta el destino: juntos dan el tamaño exacto del logo de
            // la barra, mida cuando mida.
            entrada.style.setProperty("--vuela-base", `${l.width / logo.offsetWidth}`);
            entrada.style.setProperty("--vuela-escala", `${m.width / l.width}`);
            entrada.style.setProperty("--vuela-x", `${cx - (l.left + l.width / 2)}px`);
            entrada.style.setProperty("--vuela-y", `${cy - (l.top + l.height / 2)}px`);
          } else {
            entrada.classList.add("entrada-sin-destino");
          }
          entrada.classList.add("entrada-terminando");
          // El pixel fantasma escapa hacia la web con el iris en marcha.
          if (!reducido) {
            jingle();
            const punto = document.createElement("span");
            punto.className = "punto-bienvenida";
            punto.setAttribute("aria-hidden", "true");
            document.body.append(punto);
            punto.addEventListener("animationend", () => punto.remove());
          }
        }, SELECCION);

        // Fase 3: el logo aterrizó (3,5 s + 1 s) y el iris ya cerró; ahora sí
        // la página recibe el scroll, el foco y el relevo del logo.
        setTimeout(() => {
          if (!entrada.isConnected) return;
          // Relevo: el logo de la cabecera acusa el aterrizaje con un latido
          // dorado —el mismo brillo con el que llegó el de la escena— para que
          // el cambio se lea como UNA llegada y no como dos logos distintos.
          if (vuela && marca && !reducido) {
            marca.classList.add("marca-latido");
            marca.addEventListener("animationend", () => marca.classList.remove("marca-latido"), { once: true });
          }
          entrada.remove();
          document.documentElement.classList.remove("velado");
          const destino = irA && document.getElementById(irA);
          if (destino) {
            destino.scrollIntoView({ behavior: reducido ? "auto" : "smooth" });
            destino.setAttribute("tabindex", "-1");
            destino.focus({ preventScroll: true });
          }
        }, SELECCION + VUELO);
      };

      // Konami dentro de la entrada: la secuencia clásica desbloquea el modo
      // secreto (título dorado, doble lluvia, puntos máximos y opción oculta).
      const secuencia = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
      let paso = 0;
      const desbloquearSecreto = () => {
        if (entrada.classList.contains("entrada-secreto")) return;
        entrada.classList.add("entrada-secreto");
        const opSecreta = entrada.querySelector(".entrada-op-secreta");
        if (opSecreta) opSecreta.hidden = false;
        const p = entrada.querySelector("#entrada-puntos");
        if (p) p.textContent = "999999";
        fanfarria();
        indice = 0;
        pintarActiva();
      };

      // Las tres categorías entran a la página —con vuelo del logo incluido—:
      // aventura se queda en el inicio, sabores al catálogo, créditos a La marca.
      const accionar = (op) => {
        if (op.dataset.accion === "perfil") { perfil.hidden = !perfil.hidden; return; }
        if (op.dataset.accion === "creditos") terminar("marca", op);
        else terminar(op.dataset.accion === "empezar" ? null : "catalogo", op);   // aventura entra al inicio desde arriba; sabores y el modo secreto, al catálogo
      };

      const teclas = (e) => {
        // Los controles de la radio reciben teclas sin activar el menú de entrada.
        if (e.target.closest?.(".musica-boton, .musica-panel")) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        paso = k === secuencia[paso] ? paso + 1 : (k === secuencia[0] ? 1 : 0);
        if (paso === secuencia.length) { paso = 0; desbloquearSecreto(); return; }
        if (e.key === "Escape") { cerrar(); return; }
        if (e.key === "ArrowUp" || e.key === "ArrowDown" || k === "w" || k === "s") {
          e.preventDefault();   // las flechas no mueven la página de fondo
          mover(k === "w" ? -1 : k === "s" ? 1 : e.key === "ArrowUp" ? -1 : 1);
        } else if (e.key === "Enter" || e.key === " " || k === "z") {
          // Si el foco ya está en una opción, su propio click se encarga.
          // (optional chaining: el destino del keydown puede no ser un elemento.)
          if (e.target.closest?.(".entrada-op")) return;
          const ops = visibles();
          if (ops[indice]) { e.preventDefault(); accionar(ops[indice]); }
        }
      };
      addEventListener("keydown", teclas);

      // Perfil gamer: tres preguntas sin datos personales. Cada respuesta solo
      // muestra una recomendación de caja y puede saltarse; no se guarda nada.
      const perfil = entrada.querySelector(".entrada-perfil");
      const perfilNota = entrada.querySelector(".entrada-perfil-nota");
      const recomendaciones = {
        speedrunner: "Para ir rápido: la Caja Pixel x4, perfecta para una partida corta.",
        tanque: "Para aguantar: la Caja Pixel x6, para compartir con el equipo.",
        healer: "Para cuidar al grupo: la Caja Pixel x12, ideal para toda la mesa.",
      };
      entrada.addEventListener("click", (e) => {
        const botonPerfil = e.target.closest?.(".entrada-perfil-op");
        if (!botonPerfil) return;
        e.stopPropagation();
        perfilNota.textContent = recomendaciones[botonPerfil.dataset.perfil] || "";
      });

      // ?empezar=1: la escena corre sola y confirma en cuanto el menú está
      // listo (2.4 s: tras la entrada del menú), sin esperar al jugador.
      if (empiezaSolo) {
        setTimeout(() => {
          const op = entrada.querySelector('.entrada-op[data-accion="empezar"]');
          if (op) accionar(op);
        }, 2400);
      }

      // Ratón y tacto: pasar por encima elige, pulsar confirma; un toque en el
      // fondo (fuera del diálogo) sale, como al principio.
      entrada.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".entrada-menu, .musica-boton, .entrada-icono")) return;
        // En plena secuencia de salida solo la ✕ (saltar) cierra de una vez.
        if (eligiendo && !e.target.closest(".entrada-saltar")) return;
        cerrar();
      });
      entrada.addEventListener("click", (e) => {
        if (eligiendo) return;
        const op = e.target.closest(".entrada-op");
        if (!op) return;
        const i = visibles().indexOf(op);
        if (i >= 0) { indice = i; pintarActiva(); }
        accionar(op);
      });
      entrada.addEventListener("pointermove", (e) => {
        if (eligiendo) return;
        const op = e.target.closest(".entrada-op");
        if (!op) return;
        const i = visibles().indexOf(op);
        if (i >= 0 && i !== indice) { indice = i; pintarActiva(); ticDe(op); }
      });
      // El foco arranca en el menú para que ↑ ↓ y Enter funcionen de inmediato
      // (esperando al menú: antes no existe en pantalla).
      setTimeout(() => {
        const radio = document.getElementById("musica-panel");
        if (menu && menu.isConnected && (!radio || radio.hidden)) menu.focus({ preventScroll: true });
      }, 2300);
      pintarActiva();
    }
  }

  // ===== Divisor entre niveles =====
  // El separador de píxeles que ya vive en el HTML (siete cuadros centrados,
  // el del medio en naranja) se repite entre todos los niveles: así cada
  // categoría queda dividida y el recorrido se lee como pantallas de un mismo
  // juego. Se toma el del HTML como plantilla, se retiran los que haya y se
  // vuelven a colocar en orden, de modo que el HTML sigue mandando —igual que
  // la numeración— y añadir una sección no pide tocar nada más. Sin JavaScript
  // queda el divisor estático, que ya venía en la página.
  //
  // Va antes del revelado a propósito: el observador recoge los clones y cada
  // divisor aparece al entrar en pantalla. Se le quita el "visible" a la
  // plantilla para que los nuevos no hereden un estado ya revelado.
  const divisor = document.querySelector("main > .divisor");
  if (divisor) {
    const nivelesDelHtml = document.querySelectorAll("main > section > .etiqueta");
    for (const d of document.querySelectorAll("main > .divisor")) d.remove();
    divisor.classList.remove("visible");
    nivelesDelHtml.forEach((etiqueta, i) => {
      if (i === 0) return; // antes del primer nivel no hay nada que dividir
      etiqueta.closest("section").before(divisor.cloneNode(true));
    });
  }

  // ===== Revelado de secciones al hacer scroll =====
  // Las listas en cascada (.cajas, .pasos, .mision-grid) llevan su propio
  // "visible": el CSS esconde sus hijos y los revela con .cajas.visible, etc.
  // Si solo se observan las secciones, esas listas nunca lo reciben y sus
  // tarjetas se quedan a opacity: 0 para siempre. Se observan también aquí.
  const observables = document.querySelectorAll("[data-reveal], .cajas, .pasos, .mision-grid");
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

  // ===== Numeración "Nivel 0X" de las secciones =====
  // El orden del HTML es libre (producto primero, luego cajas, comunidad, etc.).
  // La numeración se calcula aquí para que el rediseño no la rompa: cada
  // sección con etiqueta recibe su posición en orden de aparición, con dos
  // dígitos (01, 02 …). El prefijo "Nivel ·" es decorativo y está oculto a
  // lectores de pantalla (la etiqueta ya dice el nombre real de la sección).
  // De esta misma lista sale el mapa de niveles del HUD: la numeración deja de
  // ser un adorno y pasa a ser navegación (añadir una sección basta para que
  // aparezca sola en el mapa).
  const niveles = [];
  let numero = 0;
  document.querySelectorAll("main > section > .etiqueta").forEach((etiqueta) => {
    const seccion = etiqueta.closest("section");
    // Las secciones que no se dibujan no son niveles. El panel de medición vive
    // oculto entre "Tu pedido" y "Estado", y un elemento oculto mide (0,0): el
    // HUD lo daba por alcanzado en cuanto pasabas el pedido y anunciaba
    // "Medición propia" en plena sección de compra, además de dejar un hueco en
    // la numeración visible (09 y de pronto 11). Se numera solo lo que se ve.
    if (!seccion || !seccion.getClientRects().length) return;
    numero += 1;
    const n = String(numero).padStart(2, "0");
    const nombre = etiqueta.textContent.trim();
    etiqueta.textContent = `Nivel ${n} · ${nombre}`.trim();
    if (seccion.id) niveles.push({ id: seccion.id, n, nombre, seccion });
  });

  // ===== Mapa de niveles (HUD) =====
  // Dice en qué nivel vas y deja saltar a cualquiera. Es un menú de verdad
  // —botón, aria-expanded, Esc y clic fuera— porque vive encima de todo y no
  // debe atrapar a nadie. En pantallas angostas el CSS lo esconde: allí los
  // tres flotantes (carrito, WhatsApp y este) no caben juntos.
  const hud = document.getElementById("nivel-hud");
  const hudBoton = document.getElementById("nivel-hud-boton");
  const hudMapa = document.getElementById("nivel-mapa");
  const hudNumero = document.getElementById("nivel-actual");
  const hudNombre = document.getElementById("nivel-nombre");
  const hudBarra = document.getElementById("nivel-barra");
  if (hud && hudBoton && hudMapa && niveles.length > 1) {
    hud.hidden = false;
    const enlacesNivel = niveles.map((nivel) => {
      const a = document.createElement("a");
      a.href = `#${nivel.id}`;
      const numero = document.createElement("b");
      numero.textContent = nivel.n;
      a.append(numero, document.createTextNode(nivel.nombre));
      hudMapa.append(a);
      return a;
    });
    const abrirMapa = (abierto) => {
      hudMapa.hidden = !abierto;
      hudBoton.setAttribute("aria-expanded", String(abierto));
    };
    hudBoton.addEventListener("click", () => abrirMapa(hudMapa.hidden));
    hudMapa.addEventListener("click", (e) => { if (e.target.closest("a")) abrirMapa(false); });
    addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || hudMapa.hidden) return;
      abrirMapa(false);
      hudBoton.focus();
    });
    // Un toque fuera cierra el mapa, como cualquier menú flotante.
    document.addEventListener("pointerdown", (e) => {
      if (!hudMapa.hidden && !e.target.closest("#nivel-hud")) abrirMapa(false);
    });

    let pintado = "";
    const pintarNivel = () => {
      const mitad = innerHeight * 0.42;
      let actual = 0;
      niveles.forEach((nivel, i) => {
        if (nivel.seccion.getBoundingClientRect().top <= mitad) actual = i;
      });
      const nivel = niveles[actual];
      if (!nivel || nivel.id === pintado) return;
      pintado = nivel.id;
      if (hudNumero) hudNumero.textContent = nivel.n;
      if (hudNombre) hudNombre.textContent = nivel.nombre;
      if (hudBarra) hudBarra.style.transform = `scaleX(${(actual + 1) / niveles.length})`;
      enlacesNivel.forEach((a, i) => a.classList.toggle("activo", i === actual));
      // En "Tu pedido" el HUD se aparta: ahí manda el botón de confirmar y la
      // placa flotante se le sentaba encima. Vuelve solo al salir del nivel.
      hud.classList.toggle("nivel-hud-fuera", nivel.id === "pedido");
    };
    let pendienteNivel = false;
    addEventListener("scroll", () => {
      if (pendienteNivel) return;
      pendienteNivel = true;
      requestAnimationFrame(() => { pendienteNivel = false; pintarNivel(); });
    }, { passive: true });
    addEventListener("resize", pintarNivel, { passive: true });
    pintarNivel();
  }

  // ===== Botones que se sienten atraídos por el puntero =====
  // Acabado de dos píxeles: la llamada a la acción se acerca un poco al cursor.
  // Va en translate —propiedad aparte— para no pisar el salto del hover, que
  // vive en transform, y solo con ratón fino y sin movimiento reducido.
  if (!reducido && puedeTocar) {
    for (const boton of document.querySelectorAll(".boton-grande, .boton-whatsapp")) {
      boton.addEventListener("pointermove", (e) => {
        const caja = boton.getBoundingClientRect();
        if (!caja.width) return;
        const x = (e.clientX - (caja.left + caja.width / 2)) / caja.width;
        const y = (e.clientY - (caja.top + caja.height / 2)) / caja.height;
        boton.style.translate = `${(x * 6).toFixed(1)}px ${(y * 4).toFixed(1)}px`;
      });
      boton.addEventListener("pointerleave", () => { boton.style.translate = ""; });
    }
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
        // Los nombres vienen de la API: se pintan como texto (textContent), nunca como HTML.
        const nodo = (tag, texto, attrs = {}) => {
          const el = document.createElement(tag);
          el.textContent = texto;
          for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
          return el;
        };
        const items = nombres.flatMap((n) => [nodo("span", n), nodo("b", "◆", { "aria-hidden": "true" })]);
        // dos copias: el desplazamiento -50% queda sin costura
        pista.replaceChildren(...items, ...items.map((el) => el.cloneNode(true)));
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

  // ===== Menú móvil: botón hamburguesa que abre y cierra el panel =====
  // En pantallas angostas el CSS convierte .menu en un panel desplegable;
  // aquí se controla la clase .abierto y el aria-expanded del botón.
  const btnMenu = document.getElementById("btn-menu");
  const menu = document.getElementById("menu-principal");
  if (btnMenu && menu) {
    const abrirMenu = (abrir) => {
      menu.classList.toggle("abierto", abrir);
      btnMenu.setAttribute("aria-expanded", String(abrir));
    };
    btnMenu.addEventListener("click", () =>
      abrirMenu(btnMenu.getAttribute("aria-expanded") !== "true")
    );
    // Al tocar un enlace se cierra el panel (sino, tapa la sección destino).
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) abrirMenu(false);
    });
    // Escape cierra el panel y devuelve el foco al botón (buena práctica de teclado).
    menu.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      abrirMenu(false);
      btnMenu.focus();
    });
    // Al pasar a escritorio el panel vuelve a estar siempre visible.
    matchMedia("(min-width: 62.01rem)").addEventListener("change", (e) => {
      if (e.matches) abrirMenu(false);
    });
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

  // ===== Luz que sigue al cursor en la portada =====
  const hero = document.querySelector(".hero");
  if (hero && !reducido && puedeTocar) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      hero.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  }

  // ===== Luz de cursor en toda la página =====
  // La misma idea que la de portada pero global: una capa fija (body::after)
  // con un resplandor cálido sigue al puntero por todo el sitio, por encima
  // del contenido y por debajo de la barra. Throttle por tiempo (~25 fps) y
  // passive listener para no frenar el scroll; se enciende con el primer
  // movimiento y no existe con movimiento reducido ni sin puntero real.
  if (!reducido && puedeTocar) {
    let ultimaLuz = 0, lx = innerWidth / 2, ly = innerHeight / 3;
    addEventListener("pointermove", (e) => {
      lx = e.clientX; ly = e.clientY;
      const ahora = performance.now();
      if (ahora - ultimaLuz < 40) return;
      ultimaLuz = ahora;
      const raiz = document.documentElement;
      raiz.style.setProperty("--rx", `${(lx / innerWidth) * 100}%`);
      raiz.style.setProperty("--ry", `${(ly / innerHeight) * 100}%`);
      raiz.classList.add("luz-activa");
    }, { passive: true });
  }

  // ===== Paralaje de profundidad de las galletas pixel-art de la portada =====
  // Cada galleta se desplaza según su propia profundidad (--prof en el CSS): las
  // grandes (más cerca) viajan más que las pequeñas, dando sensación 3D.
  // El valor se escribe en px (no unitario) porque el CSS multiplica una sola
  // vez: calc(length * number). Un calc(number * number * px) es inválido y la
  // declaración entera se descartaría en silencio.
  const galletas = document.querySelectorAll(".galleta-flotante");
  if (galletas.length && !reducido && puedeTocar && hero) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;   // −1…1
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;   // −1…1
      // Base ±1px; el CSS la multiplica por la profundidad de cada galleta
      // (--prof 16 / −9 / 12), dando saltos de ±16px, ±9px y ±12px.
      hero.style.setProperty("--par-x", `${nx.toFixed(3)}px`);
      hero.style.setProperty("--par-y", `${ny.toFixed(3)}px`);
    }, { passive: true });
  }

  // ===== Destello que sigue al mouse en tarjetas, cajas y pasos =====
  if (!reducido && puedeTocar) {
    document.querySelectorAll("#lista-productos, .cajas, .pasos").forEach((cont) => {
      cont.addEventListener("pointermove", (e) => {
        const t = e.target.closest(".producto, .caja, .paso");
        if (!t) return;
        const r = t.getBoundingClientRect();
        t.style.setProperty("--dx", `${((e.clientX - r.left) / r.width) * 100}%`);
        t.style.setProperty("--dy", `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    });
    // El destello de las tarjetas del catálogo necesita un hijo (sus ::before/::after
    // ya están ocupados por el sprite del sabor); se inyecta al dibujarse cada tarjeta.
    const obsDestello = new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && n.classList?.contains("producto") && !n.querySelector(".destello")) {
          const d = document.createElement("span");
          d.className = "destello";
          d.setAttribute("aria-hidden", "true");
          n.prepend(d);
        }
      }));
    });
    const listaCat = document.getElementById("lista-productos");
    if (listaCat) obsDestello.observe(listaCat, { childList: true });
  }

  // ===== Brasas y píxeles en la portada (lienzo de partículas) =====
  // Dos tipos de partícula conviven para darle "aura" a la portada:
  //   • brasa  — sube desde abajo como chispa de horno, con halo y parpadeo;
  //   • polvo  — cae despacio en tono frío, como píxeles sueltos de una pantalla.
  // Siguen dibujándose como cuadrados nítidos (sin suavizar) y se pausan fuera
  // de pantalla o con la pestaña oculta.
  const lienzo = document.querySelector(".lienzo-particulas");
  if (lienzo && !reducido && lienzo.getContext) {
    const ctx = lienzo.getContext("2d");
    const CALIDO = ["#F5902F", "#FFB25C", "#E5412B"];
    const FRESCO = ["#4DE8D0", "#FFF3DC", "#8F7BFF"];
    let particulas = [], ancho = 0, alto = 0, cuadro = 0, corriendo = true, t = 0;
    const ajustar = () => {
      const r = lienzo.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      ancho = r.width; alto = r.height;
      lienzo.width = ancho * dpr; lienzo.height = alto * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(22, Math.min(56, Math.round(ancho / 22)));
      particulas = Array.from({ length: n }, () => nuevaParticula(true));
    };
    const nuevaParticula = (semilla) => {
      // 6 de cada 10 son brasas (cálidas); el resto, polvo (fresco).
      const brasa = Math.random() < .6;
      return {
        brasa,
        x: Math.random() * ancho,
        y: brasa ? (semilla ? Math.random() * alto : alto + 8)
                 : (semilla ? Math.random() * alto : -8),
        l: brasa ? 2 + Math.round(Math.random() * 3) : 2 + Math.round(Math.random() * 2),
        v: brasa ? -(0.18 + Math.random() * 0.5) : 0.15 + Math.random() * .4,
        d: Math.random() * Math.PI * 2,
        a: .3 + Math.random() * .4,
        f: 1 + Math.random() * 2.2,                   // frecuencia del parpadeo
        fase: Math.random() * Math.PI * 2,
        c: brasa ? CALIDO[(Math.random() * CALIDO.length) | 0]
                 : FRESCO[(Math.random() * FRESCO.length) | 0],
      };
    };
    const pintar = () => {
      t += 1;
      ctx.clearRect(0, 0, ancho, alto);
      for (let p of particulas) {
        p.y += p.v; p.x += Math.sin(p.d + p.y / 60) * .25;
        if ((p.brasa && p.y < -12) || (!p.brasa && p.y > alto + 12)) {
          Object.assign(p, nuevaParticula(false));
        }
        // Parpadeo suave: la opacidad respira con el tiempo y la fase propia.
        const brillo = p.a * (0.62 + 0.38 * Math.sin(t / (p.f * 8) + p.fase));
        ctx.globalAlpha = Math.max(0, brillo);
        ctx.fillStyle = p.c;
        const px = p.x | 0, py = p.y | 0;
        // Halo pixelado de la brasa: un cuadrado mayor y tenue detrás (barato y
        // con estética de píxel, en lugar de blur costoso).
        if (p.brasa) {
          ctx.globalAlpha = Math.max(0, brillo * .18);
          const halo = p.l * 4;
          ctx.fillRect(px - (halo - p.l) / 2, py - (halo - p.l) / 2, halo, halo);
          ctx.globalAlpha = Math.max(0, brillo);
        }
        ctx.fillRect(px, py, p.l, p.l);
      }
      ctx.globalAlpha = 1;
      if (corriendo) cuadro = requestAnimationFrame(pintar);
    };
    ajustar();
    pintar();
    addEventListener("resize", ajustar, { passive: true });
    // Se pausa fuera de pantalla y con la pestaña oculta (ahorra batería y CPU).
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !corriendo) { corriendo = true; pintar(); }
        else if (!e.isIntersecting && corriendo) { corriendo = false; cancelAnimationFrame(cuadro); }
      }).observe(lienzo);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && corriendo) { corriendo = false; cancelAnimationFrame(cuadro); }
      else if (!document.hidden && !corriendo && lienzo.isConnected) { corriendo = true; pintar(); }
    });
  }

  // ===== Cifras de la portada: cuentan desde 0 al entrar en pantalla =====
  // Cada <li> lleva su número en <b> (7, $6.000, 3, 100%). Al hacerse visible,
  // el número sube desde 0 hasta su valor real, conservando el prefijo ($),
  // el sufijo (%) y el separador de miles del texto original. Con movimiento
  // reducido se queda el valor final tal cual está en el HTML.
  const cifras = Array.from(document.querySelectorAll(".cifras li"));
  if (cifras.length && "IntersectionObserver" in window) {
    const animarCifra = (li, indice) => {
      const b = li.querySelector("b");
      if (!b || li.dataset.cifrada) return;
      li.dataset.cifrada = "1";
      li.style.setProperty("--ci", indice);   // desfase escalonado del CSS
      li.classList.add("visible");
      const texto = b.textContent.trim();
      const m = texto.match(/^(\D*)([\d.,]+)(.*)$/);
      if (reducido || !m) return;              // sin animación: ya muestra su valor
      const [, prefijo, numero, sufijo] = m;
      const conSeparador = numero.length > 3 && /[.,]/.test(numero);
      const destino = Number(numero.replace(/\D/g, ""));
      if (!Number.isFinite(destino) || destino === 0) return;
      const duracion = 950, inicio = performance.now();
      const paso = (ahora) => {
        const p = Math.min(1, (ahora - inicio) / duracion);
        const suave = 1 - Math.pow(1 - p, 3);   // ease-out cúbico
        const valor = Math.round(destino * suave);
        b.textContent = prefijo + (conSeparador ? valor.toLocaleString("es-CO") : valor) + sufijo;
        if (p < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    };
    const obsCifras = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        animarCifra(e.target, cifras.indexOf(e.target));
        obsCifras.unobserve(e.target);
      });
    }, { threshold: 0.4 });
    cifras.forEach((li) => obsCifras.observe(li));
  }

  // ===== Huevo de pascua: código Konami arcade =====
  // La secencia clásica ↑↑↓↓←→←→BA hace llover galletas pixel-art desde arriba.
  // Es decorativo, se autolimita a ~4 galletas y se desactiva con movimiento
  // reducido o si ya hay una lluvia en curso. La idea es un guiño divertido
  // para la audiencia gamer, no un efecto que distraiga de la compra.
  const secuenciaKonami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let pasoKonami = 0, lluviaActiva = false;
  addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pasoKonami = k === secuenciaKonami[pasoKonami] ? pasoKonami + 1 : (k === secuenciaKonami[0] ? 1 : 0);
    if (pasoKonami !== secuenciaKonami.length || reducido || lluviaActiva) return;
    pasoKonami = 0; lluviaActiva = true;
    const capa = document.createElement("div");
    capa.setAttribute("aria-hidden", "true");
    capa.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9998;overflow:hidden";
    document.body.append(capa);
    for (let i = 0; i < 4; i++) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      g.setAttribute("viewBox", "0 0 16 16");
      g.setAttribute("aria-hidden", "true");
      g.style.cssText = `position:absolute;top:-12%;left:${12 + i * 22}%;width:3.2rem;height:3.2rem;filter:drop-shadow(0 0 12px rgba(245,144,47,.6));animation:konami-caer ${2.6 + i * .4}s cubic-bezier(.35,.1,.6,1) ${i * .18}s forwards`;
      const uso = document.createElementNS("http://www.w3.org/2000/svg", "use");
      uso.setAttribute("href", "#galleta-pixel");
      g.append(uso);
      capa.append(g);
    }
    setTimeout(() => { capa.remove(); lluviaActiva = false; }, 5200);
  });

  window.__efectosListo = true;  } catch (error) {
    // Sin efectos la página sigue siendo usable y visible (y sin velo).
    console.warn("Efectos desactivados:", error);
    document.documentElement.classList.remove("js-anim");
    document.documentElement.classList.remove("velado");
  }
}
