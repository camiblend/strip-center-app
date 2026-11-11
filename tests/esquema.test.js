// Pruebas locales del esquema y de las funciones puras de Setup.js.
// Ejecutar: npm test   (o: node --test tests/*.test.js)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Apps Script no usa módulos: se cargan los archivos en un mismo contexto, como lo hace Google.
const ctx = {};
vm.createContext(ctx);
for (const archivo of ['Esquema.js', 'Setup.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', archivo), 'utf8'), ctx);
}
const { ESQUEMA, columnasDe, FORMATO_POR_TIPO, CATALOGOS_INICIALES, PARAMETROS_INICIALES, planEncabezados } = ctx;

test('nombres de hoja únicos', () => {
  const nombres = ESQUEMA.map((t) => t.hoja);
  assert.strictEqual(new Set(nombres).size, nombres.length);
});

test('cada tabla: columnas únicas, tipos conocidos y clave existente', () => {
  for (const tabla of ESQUEMA) {
    const cols = columnasDe(tabla);
    const nombres = cols.map((c) => c[0]);
    assert.strictEqual(new Set(nombres).size, nombres.length, `columna repetida en ${tabla.hoja}`);
    for (const [nombre, tipo] of cols) {
      assert.ok(tipo in FORMATO_POR_TIPO, `${tabla.hoja}.${nombre}: tipo desconocido "${tipo}"`);
      assert.match(nombre, /^[a-z0-9_]+$/, `${tabla.hoja}.${nombre}: usar minúsculas y _`);
    }
    if (tabla.clave) assert.ok(nombres.includes(tabla.clave), `${tabla.hoja}: falta la clave`);
    assert.ok(['maestro', 'transaccional', 'sistema'].includes(tabla.clase));
  }
});

test('tablas transaccionales tienen estado y reemplaza_a; maestros no tienen estado de anulación', () => {
  for (const tabla of ESQUEMA) {
    const nombres = columnasDe(tabla).map((c) => c[0]);
    if (tabla.clase === 'transaccional') {
      assert.ok(nombres.includes('estado') && nombres.includes('reemplaza_a'), tabla.hoja);
    }
    if (tabla.clase === 'maestro') {
      assert.ok(!nombres.includes('anulado_por'), tabla.hoja);
      assert.ok(nombres.includes('actualizado_en'), tabla.hoja);
    }
  }
});

test('lecturas tienen campo origen (manual/foto)', () => {
  const lecturas = ESQUEMA.find((t) => t.hoja === 'lecturas');
  assert.ok(columnasDe(lecturas).some((c) => c[0] === 'origen'));
});

test('catálogos y parámetros sin duplicados', () => {
  for (const [, valores] of CATALOGOS_INICIALES) assert.strictEqual(new Set(valores).size, valores.length);
  const claves = PARAMETROS_INICIALES.map((p) => p[0]);
  assert.strictEqual(new Set(claves).size, claves.length);
});

test('planEncabezados: hoja nueva agrega todo', () => {
  const r = planEncabezados([], ['a', 'b']);
  assert.deepStrictEqual([...r.agregar], ['a', 'b']);
  assert.strictEqual(r.distintas.length + r.sobrantes.length, 0);
});

test('planEncabezados: agrega solo las que faltan, al final', () => {
  const r = planEncabezados(['a', 'b'], ['a', 'b', 'c']);
  assert.deepStrictEqual([...r.agregar], ['c']);
});

test('planEncabezados: informa columna renombrada a mano sin tocarla', () => {
  const r = planEncabezados(['a', 'B mal'], ['a', 'b']);
  assert.strictEqual(r.distintas.length, 1);
  assert.strictEqual(r.distintas[0].actual, 'B mal');
  assert.deepStrictEqual([...r.agregar], ['b']);
});

test('planEncabezados: informa columna extra agregada a mano', () => {
  const r = planEncabezados(['a', 'b', 'mi_nota'], ['a', 'b']);
  assert.deepStrictEqual([...r.sobrantes], ['mi_nota']);
});
