// Pruebas de Integridad.js.
// Ejecutar: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = {};
vm.createContext(ctx);
for (const f of ['Setup.js', 'Integridad.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx);

test('encabezados: todo bien, renombrado, sobrante y faltante', () => {
  assert.strictEqual(ctx.problemasEncabezados('x', ['a', 'b'], ['a', 'b']).length, 0);
  const p = ctx.problemasEncabezados('lecturas', ['lectura_id', 'Periodo', 'extra'], ['lectura_id', 'periodo']);
  assert.ok(p.some((t) => /columna 2 dice "Periodo"/.test(t)));
  assert.ok(p.some((t) => /"extra" que no está/.test(t)));
  assert.ok(p.some((t) => /falta la columna "periodo"/.test(t)));
});

test('IDs vacíos y repetidos', () => {
  assert.strictEqual(ctx.problemasIds('x', 'id', ['A', 'B']).length, 0);
  const p = ctx.problemasIds('lecturas', 'lectura_id', ['LEC-1', '', 'LEC-1', ' ', 'LEC-2']);
  assert.ok(p.some((t) => /2 filas sin lectura_id/.test(t)));
  assert.ok(p.some((t) => /repetido: LEC-1/.test(t)));
});

test('períodos convertidos en fecha', () => {
  assert.strictEqual(ctx.problemasPeriodos('x', 'periodo', ['2026-09', '', '2026-10']).length, 0);
  const p = ctx.problemasPeriodos('cierres', 'periodo', ['2026-09', new Date(2026, 9, 1), '2026-13']);
  assert.match(p[0], /2 valor\(es\) de periodo/);
});

test('cambios legibles del log', () => {
  const c = ctx.cambiosLegibles('{"estado":"vigente"}', '{"estado":"terminado"}');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c)), [{ campo: 'estado', antes: 'vigente', despues: 'terminado' }]);
  const n = ctx.cambiosLegibles('', '{"filas":35}');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(n)), [{ campo: 'filas', antes: '', despues: '35' }]);
  assert.strictEqual(ctx.cambiosLegibles('texto', '').length, 1);
  assert.strictEqual(ctx.cambiosLegibles('', '').length, 0);
});

test('lectura en una consulta: filas sin celdas vacías al final, fechas desde número de serie', () => {
  const fs2 = require('node:fs');
  const ctx2 = {};
  vm.createContext(ctx2);
  for (const f of ['Esquema.js', 'Datos.js']) vm.runInContext(fs2.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx2);
  const valores = [
    ['contrato_id', 'unidad_id', 'fecha_inicio', 'fecha_fin', 'paga_gc', 'notas'],
    ['CON-0001', 'L00', 46296, '', true],   // termina antes de "notas": la API omite celdas vacías
    [],                                      // fila vacía en medio
    ['CON-0002', 'L07', 46235, 46305, false, 'x'],
  ];
  const tipos = { fecha_inicio: 'fecha', fecha_fin: 'fecha' };
  const filas = ctx2.filasDesdeApi('contratos', valores, tipos, ctx2.serialAFecha);
  assert.strictEqual(filas.length, 2);
  assert.strictEqual(filas[0]._fila, 2);
  assert.strictEqual(filas[1]._fila, 4);
  assert.strictEqual(filas[0].notas, '');
  assert.strictEqual(filas[0].fecha_fin, '');
  assert.strictEqual(filas[0].paga_gc, true);
  const d = filas[0].fecha_inicio;
  assert.deepStrictEqual([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()], [2026, 10, 1, 0]);
  const t = ctx2.serialAFecha(46327.98);  // 01-11-2026 23:31:12
  assert.deepStrictEqual([t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()], [1, 23, 31, 12]);
});
