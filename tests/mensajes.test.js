// Pruebas de lo que la tienda le dice al cliente y de lo que se publica: que
// los textos del domicilio cuenten lo mismo que cobra el servidor, que las
// pistas del menú sean las del dispositivo y que lo interno no salga al sitio.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ENTREGAS } = require("../src/config/envio");
const { RANGOS_DISTANCIA } = require("../src/config/distancia");

const raiz = path.join(__dirname, "..");
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), "utf8");
const lineas = (texto) => texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const pesos = (n) => "$" + String(n).replace(/\B(?=(\d{3})+$)/g, ".");

test("Domicilio: todo texto con la tarifa base avisa del cargo por distancia", () => {
  const bases = [ENTREGAS.cucuta.costo, ENTREGAS.municipios.costo].map(pesos);
  const cargos = Object.values(RANGOS_DISTANCIA).map((r) => pesos(r.costo));
  let revisadas = 0;
  for (const pagina of ["public/index.html", "public/preguntas-gamer.html"]) {
    // $7.000 también es el precio de la galleta: esas líneas no hablan del domicilio.
    const esDePrecio = (l) => /priceRange|precio desde|× \$/.test(l);
    for (const linea of lineas(leer(pagina)).filter((l) => !esDePrecio(l) && bases.some((b) => l.includes(b)))) {
      revisadas++;
      assert.match(linea, /distancia/i, `${pagina}: sin distancia: ${linea.slice(0, 90)}`);
      // La opción del formulario se apoya en el selector de distancia de al
      // lado; el resto de textos tiene que dar los cargos completos.
      if (!linea.startsWith("<option")) {
        for (const cargo of cargos) assert.ok(linea.includes(cargo), `${pagina}: falta ${cargo}: ${linea.slice(0, 90)}`);
      }
    }
  }
  // Datos estructurados, FAQ, «Cómo se entrega», dos opciones y preguntas-gamer.
  assert.equal(revisadas, 6);
});

test("Entrada: cada dispositivo ve la pista que le sirve", () => {
  const html = leer("public/index.html");
  assert.match(html, /<span class="pista-teclado">[^<]*Enter[^<]*<\/span>/);
  assert.match(html, /<span class="pista-tacto">[^<]*Toca[^<]*<\/span>/);
  const css = leer("public/css/styles.css");
  assert.match(css, /\.pista-tacto \{ display: none; \}/);
  assert.match(css, /@media \(pointer: coarse\) \{\s*\.pista-teclado \{ display: none; \}\s*\.pista-tacto \{ display: inline; \}/);
});

test("Teléfono en el formulario: exige de 7 a 15 dígitos, como el servidor", () => {
  const { telefonoValido } = require("../src/util/telefono");
  const casos = ["3137839935", "+57 313 783 9935", "313-783-9935", "1234567", "123456789012345",
    "123456", "1234567890123456", "+-+-+-+", "abc1234567"];
  for (const pagina of ["public/index.html", "public/seguimiento-pedido.html"]) {
    const entradas = leer(pagina).match(/<input type="tel"[^>]*>/g);
    assert.ok(entradas?.length, `${pagina} tiene campo de teléfono`);
    for (const entrada of entradas) {
      assert.match(entrada, /maxlength="20"/);
      // El navegador compila pattern con el modo "v" y lo ancla a todo el valor.
      const patron = new RegExp(`^(?:${entrada.match(/pattern="([^"]+)"/)[1]})$`, "v");
      for (const caso of casos) assert.equal(patron.test(caso), telefonoValido(caso), `${pagina}: ${caso}`);
    }
  }
});

test("Repositorio: .env.example se sube y las capturas de la raíz no", () => {
  const reglas = lineas(leer(".gitignore")).filter((l) => !l.startsWith("#"));
  assert.ok(reglas.lastIndexOf("!.env.example") > reglas.lastIndexOf(".env*"), "la excepción va después de .env*");
  for (const regla of ["/*.png", "/*.xlsx", "/*.log", ".cloud-attachments/", ".freebuff/", ".revision-tmp/"]) {
    assert.ok(reglas.includes(regla), `.gitignore tiene ${regla}`);
  }
  assert.ok(!reglas.some((r) => r.includes("public")), "nada de public/ se ignora");
});

test(".env.example: sin basura y con las variables que el código lee", () => {
  const ejemplo = leer(".env.example");
  assert.ok(!ejemplo.includes("[TEMPLATE]"));
  for (const variable of ["DB_SSL_CA_PEM", "TRUST_PROXY", "ORIGENES_PERMITIDOS"]) {
    assert.match(ejemplo, new RegExp(`^${variable}=$`, "m"), `.env.example declara ${variable} vacía`);
  }
});

test("Despliegue: la herramienta de fotos no se publica y nadie la enlaza", () => {
  const ignorados = lineas(leer(".vercelignore"));
  assert.ok(ignorados.includes("public/_fotos-dyme.html"));
  assert.ok(ignorados.includes("public/img/_dyme/"));
  const paginas = fs.readdirSync(path.join(raiz, "public")).filter((f) => /\.(html|js|json|txt)$/.test(f) && f !== "_fotos-dyme.html");
  const scripts = fs.readdirSync(path.join(raiz, "public/js")).map((f) => `js/${f}`);
  const hojas = fs.readdirSync(path.join(raiz, "public/css")).map((f) => `css/${f}`);
  for (const archivo of [...paginas, ...scripts, ...hojas]) {
    const texto = leer(`public/${archivo}`);
    assert.ok(!texto.includes("_dyme") && !texto.includes("_fotos-dyme"), `${archivo} referencia la herramienta interna`);
  }
});
