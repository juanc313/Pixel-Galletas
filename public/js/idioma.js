// Idiomas del sitio: español (el original, escrito en el HTML) e inglés.
//
// Cómo funciona: el HTML no se toca. Cuando el visitante elige inglés, este
// archivo carga el diccionario /i18n/en.json (texto en español → texto en
// inglés, generado con DeepL por scripts/traducir.js) y recorre la página
// cambiando cada texto que encuentre en él. Un MutationObserver traduce
// también lo que aparece después (tarjetas, mensajes, la página nueva al
// navegar sin recargar). Al volver al español se restauran los originales.
//
// Va en el <head> sin defer para poner el idioma antes del primer pintado y
// evitar que se vea el español un instante. Es un script clásico (no módulo)
// para correr temprano; al final se exporta para las pruebas en Node.
(function () {
  var CLAVE = "pixel_galletas_idioma";
  var IDIOMAS = ["es", "en"];
  // Etiquetas cuyo contenido nunca se traduce.
  var OMITIR = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, TEMPLATE: 1, svg: 1, SVG: 1 };
  var ATRIBUTOS = ["alt", "title", "aria-label", "placeholder"];
  // Etiquetas de formato que pueden ir dentro de un párrafo traducido entero.
  var EN_LINEA = /^(B|STRONG|EM|I|A|SPAN|BR|SMALL|SUP|SUB|ABBR|KBD|MARK|U|S|TIME)$/;

  function normalizar(texto) {
    return String(texto).replace(/\s+/g, " ").trim();
  }

  function idiomaGuardado(almacen) {
    try {
      var valor = almacen.getItem(CLAVE);
      return IDIOMAS.indexOf(valor) >= 0 ? valor : "es";
    } catch (e) {
      return "es"; // sin almacenamiento (modo privado): español
    }
  }

  // ¿Se puede traducir este elemento de una sola vez (con su formato adentro)?
  // Solo si sus hijos son formato simple: sin id, sin controles de formulario
  // y sin data-*. Si no, se traduce texto por texto para no romper el código
  // que tiene guardados esos hijos (contadores, botones, etc.).
  function sePuedeEntero(elemento) {
    if (!elemento.children || !elemento.children.length) return false;
    var hijos = elemento.querySelectorAll("*");
    for (var i = 0; i < hijos.length; i++) {
      var h = hijos[i];
      if (!EN_LINEA.test(h.tagName) || h.id) return false;
      for (var j = 0; j < h.attributes.length; j++) {
        if (h.attributes[j].name.indexOf("data-") === 0) return false;
      }
    }
    return true;
  }

  // Entidades que DeepL puede dejar escritas en el texto traducido.
  var ENTIDADES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " " };
  function decodificar(texto) {
    return texto.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, function (m) { return ENTIDADES[m]; });
  }

  // Arma con nodos seguros un párrafo traducido que trae formato (<b>, <a>…),
  // sin interpretar texto como HTML (la prueba de XSS prohíbe innerHTML).
  // Cada etiqueta de la traducción se empareja con el hijo del mismo tipo del
  // párrafo original, que se clona con sus propios atributos (href, clases);
  // el texto entra como texto. Si la traducción trae una etiqueta que el
  // original no tiene, o no cierra bien, devuelve null y no se usa.
  function construir(elemento, traducido, doc) {
    var disponibles = {};
    var hijos = elemento.querySelectorAll("*");
    for (var i = 0; i < hijos.length; i++) {
      var nombre = hijos[i].tagName;
      (disponibles[nombre] = disponibles[nombre] || []).push(hijos[i]);
    }
    var fragmento = doc.createDocumentFragment();
    var pila = [fragmento];
    var etiqueta = /<(\/?)([a-zA-Z]+)\b[^>]*>/g;
    var ultimo = 0;
    var m;
    while ((m = etiqueta.exec(traducido))) {
      if (m.index > ultimo) pila[pila.length - 1].appendChild(doc.createTextNode(decodificar(traducido.slice(ultimo, m.index))));
      ultimo = etiqueta.lastIndex;
      var tag = m[2].toUpperCase();
      if (m[1]) {
        if (pila.length < 2 || pila[pila.length - 1].tagName !== tag) return null;
        pila.pop();
      } else {
        var lista = disponibles[tag];
        if (!lista || !lista.length) return null;
        var copia = lista.shift().cloneNode(false);
        pila[pila.length - 1].appendChild(copia);
        if (tag !== "BR") pila.push(copia);
      }
    }
    if (ultimo < traducido.length) pila[pila.length - 1].appendChild(doc.createTextNode(decodificar(traducido.slice(ultimo))));
    return pila.length === 1 ? fragmento : null;
  }

  // Traductor: aplica un diccionario a un árbol del DOM y recuerda lo que
  // cambió para poder deshacerlo al volver al español.
  function Traductor(diccionario) {
    this.dic = diccionario || {};
    this.cambios = [];
  }

  Traductor.prototype.buscar = function (texto) {
    var clave = normalizar(texto);
    if (!clave) return null;
    var valor = this.dic[clave];
    return typeof valor === "string" && valor && valor !== clave ? valor : null;
  };

  Traductor.prototype.anotar = function (nodo, tipo, original, traducido, atributo) {
    this.cambios.push({ nodo: nodo, tipo: tipo, original: original, traducido: traducido, atributo: atributo });
  };

  Traductor.prototype.traducirAtributos = function (el) {
    for (var i = 0; i < ATRIBUTOS.length; i++) {
      var nombre = ATRIBUTOS[i];
      if (!el.hasAttribute || !el.hasAttribute(nombre)) continue;
      var original = el.getAttribute(nombre);
      var traducido = this.buscar(original);
      if (traducido) {
        el.setAttribute(nombre, traducido);
        this.anotar(el, "atributo", original, traducido, nombre);
      }
    }
  };

  Traductor.prototype.traducirTexto = function (nodo) {
    var valor = nodo.nodeValue;
    var traducido = this.buscar(valor);
    if (!traducido) return;
    // Conserva los espacios de los bordes ("Hola <b>mundo</b>" necesita el espacio).
    var bordes = /^(\s*)[\s\S]*?(\s*)$/.exec(valor);
    var nuevo = bordes[1] + traducido + bordes[2];
    nodo.nodeValue = nuevo;
    this.anotar(nodo, "texto", valor, nuevo);
  };

  Traductor.prototype.traducir = function (nodo) {
    if (!nodo) return;
    if (nodo.nodeType === 3) { this.traducirTexto(nodo); return; }
    if (nodo.nodeType !== 1) return;
    if (OMITIR[nodo.tagName] || nodo.getAttribute("translate") === "no") return;
    this.traducirAtributos(nodo);
    if (sePuedeEntero(nodo)) {
      var traducido = this.buscar(nodo.innerHTML);
      var fragmento = traducido && construir(nodo, traducido, nodo.ownerDocument);
      if (fragmento) {
        var originales = Array.prototype.slice.call(nodo.childNodes);
        nodo.replaceChildren(fragmento);
        this.anotar(nodo, "hijos", originales, Array.prototype.slice.call(nodo.childNodes));
        return;
      }
    }
    var hijos = Array.prototype.slice.call(nodo.childNodes);
    for (var i = 0; i < hijos.length; i++) this.traducir(hijos[i]);
  };

  // Vuelve al español. Solo deshace un cambio si el texto sigue siendo el que
  // puso el traductor: si otro código lo cambió después (por ejemplo «Acceso»
  // pasó a mostrar el nombre del cliente), se respeta ese cambio.
  Traductor.prototype.restaurar = function () {
    for (var i = this.cambios.length - 1; i >= 0; i--) {
      var c = this.cambios[i];
      if (c.tipo === "texto" && c.nodo.nodeValue === c.traducido) c.nodo.nodeValue = c.original;
      // Párrafo entero: vuelven los mismos nodos de antes (no copias), así el
      // código que los tenía guardados sigue funcionando.
      else if (c.tipo === "hijos" && mismosNodos(c.nodo.childNodes, c.traducido)) c.nodo.replaceChildren.apply(c.nodo, c.original);
      else if (c.tipo === "atributo" && c.nodo.getAttribute(c.atributo) === c.traducido) c.nodo.setAttribute(c.atributo, c.original);
    }
    this.cambios = [];
  };

  function mismosNodos(actuales, esperados) {
    if (actuales.length !== esperados.length) return false;
    for (var i = 0; i < esperados.length; i++) if (actuales[i] !== esperados[i]) return false;
    return true;
  }

  var api = { CLAVE: CLAVE, IDIOMAS: IDIOMAS, normalizar: normalizar, idiomaGuardado: idiomaGuardado, sePuedeEntero: sePuedeEntero,
    decodificar: decodificar, Traductor: Traductor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;

  // ---------- En el navegador ----------
  var raiz = document.documentElement;
  var idioma = idiomaGuardado(window.localStorage);
  var traductor = null;
  var tituloOriginal = null;
  var cargando = null;
  var observador = null;

  // Mientras llega el diccionario, la página se oculta (máximo 1,5 s) para que
  // no se vea el español y luego salte al inglés.
  if (idioma === "en") {
    raiz.lang = "en";
    raiz.classList.add("traduciendo");
    setTimeout(function () { raiz.classList.remove("traduciendo"); }, 1500);
  }

  function cargarDiccionario() {
    if (!cargando) {
      cargando = fetch("/i18n/en.json")
        .then(function (r) { if (!r.ok) throw new Error("sin diccionario"); return r.json(); })
        .catch(function () { return {}; });
    }
    return cargando;
  }

  function pintarBoton() {
    var botones = document.querySelectorAll("[data-idioma-boton]");
    for (var i = 0; i < botones.length; i++) {
      var b = botones[i];
      b.setAttribute("data-actual", idioma);
      b.setAttribute("aria-label", idioma === "en" ? "Language: English. Switch to Spanish" : "Idioma: español. Cambiar a inglés");
      b.setAttribute("title", idioma === "en" ? "Cambiar a español" : "Switch to English");
    }
  }

  function vigilar() {
    if (observador || typeof MutationObserver === "undefined") return;
    observador = new MutationObserver(function (cambios) {
      if (idioma !== "en" || !traductor) return;
      for (var i = 0; i < cambios.length; i++) {
        var c = cambios[i];
        if (c.type === "childList") {
          for (var j = 0; j < c.addedNodes.length; j++) traductor.traducir(c.addedNodes[j]);
        } else if (c.type === "characterData") {
          traductor.traducirTexto(c.target);
        } else if (c.type === "attributes") {
          traductor.traducirAtributos(c.target);
        }
      }
    });
    observador.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  }

  function aplicar() {
    pintarBoton();
    if (idioma === "es") {
      if (traductor) traductor.restaurar();
      if (tituloOriginal !== null) document.title = tituloOriginal;
      raiz.lang = "es";
      raiz.classList.remove("traduciendo");
      return Promise.resolve();
    }
    return cargarDiccionario().then(function (dic) {
      if (idioma !== "en") return; // cambió de idea mientras cargaba
      if (!traductor) traductor = new Traductor(dic);
      if (tituloOriginal === null) tituloOriginal = document.title;
      var titulo = traductor.buscar(tituloOriginal);
      if (titulo) document.title = titulo;
      traductor.traducir(document.body);
      raiz.lang = "en";
      raiz.classList.remove("traduciendo");
      vigilar();
    });
  }

  function cambiar(nuevo) {
    if (IDIOMAS.indexOf(nuevo) < 0 || nuevo === idioma) return;
    idioma = nuevo;
    try { localStorage.setItem(CLAVE, idioma); } catch (e) { /* modo privado: solo esta visita */ }
    aplicar();
  }

  // El botón vive en la barra, que sobrevive a la navegación sin recargar:
  // se escucha delegado en document para no sumar un clic por página.
  document.addEventListener("click", function (e) {
    var boton = e.target.closest && e.target.closest("[data-idioma-boton]");
    if (boton) cambiar(idioma === "en" ? "es" : "en");
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", aplicar);
  else aplicar();
})();
