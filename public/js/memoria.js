// ============================================================================
// Mini juego de memoria 8 bits
// ----------------------------------------------------------------------------
// 8 pares de símbolos en un tablero de 4×4. Se construye con DOM (createElement
// y textContent), nunca con innerHTML: el texto de las cartas no se interpreta
// como HTML.
// ============================================================================
export const SIMBOLOS = ["★", "♥", "♦", "♣", "♠", "☺", "☼", "♫"];
const RETRASO_OCULTAR_MS = 700;

// Mezcla de Fisher-Yates. El generador aleatorio se puede cambiar en las pruebas.
export function barajar(lista, aleatorio = Math.random) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function nuevasCartas(aleatorio = Math.random) {
  return barajar([...SIMBOLOS, ...SIMBOLOS], aleatorio);
}

export class Memoria {
  constructor(doc = document, aleatorio = Math.random) {
    this.doc = doc;
    this.aleatorio = aleatorio;
    this.tablero = doc.getElementById("memoria-tablero");
    this.movimientos = doc.getElementById("memoria-movimientos");
    this.estado = doc.getElementById("memoria-estado");
    doc.getElementById("memoria-reiniciar").addEventListener("click", () => this.reiniciar());
    this.reiniciar();
  }

  reiniciar() {
    clearTimeout(this.temporizador);
    this.abiertas = [];
    this.bloqueado = false;
    this.total = 0;
    this.encontradas = 0;
    this.tablero.replaceChildren();
    nuevasCartas(this.aleatorio).forEach((simbolo, i) => {
      const carta = this.doc.createElement("button");
      carta.type = "button";
      carta.className = "memoria-carta";
      carta.dataset.simbolo = simbolo;
      carta.setAttribute("aria-label", `Carta ${i + 1}, boca abajo`);
      carta.textContent = "?";
      carta.addEventListener("click", () => this.voltear(carta));
      this.tablero.append(carta);
    });
    this.estado.textContent = "Encuentra los 8 pares.";
    this.actualizarMarcador();
  }

  voltear(carta) {
    if (this.bloqueado || carta.classList.contains("abierta") || carta.classList.contains("encontrada")) return;
    carta.classList.add("abierta");
    carta.textContent = carta.dataset.simbolo;
    this.abiertas.push(carta);
    if (this.abiertas.length < 2) return;

    this.total += 1;
    this.actualizarMarcador();
    this.bloqueado = true;
    const [primera, segunda] = this.abiertas;
    if (primera.dataset.simbolo === segunda.dataset.simbolo) {
      for (const c of this.abiertas) c.classList.add("encontrada");
      this.encontradas += 1;
      this.abiertas = [];
      this.bloqueado = false;
      if (this.encontradas === SIMBOLOS.length) {
        this.estado.textContent = `¡Nivel completo en ${this.total} movimientos!`;
      }
      return;
    }
    this.temporizador = setTimeout(() => {
      for (const c of this.abiertas) {
        c.classList.remove("abierta");
        c.textContent = "?";
      }
      this.abiertas = [];
      this.bloqueado = false;
    }, RETRASO_OCULTAR_MS);
  }

  actualizarMarcador() {
    this.movimientos.textContent = String(this.total);
  }
}

// Solo arranca cuando existe la página (así el módulo se puede probar sin navegador).
if (typeof document !== "undefined") new Memoria();
