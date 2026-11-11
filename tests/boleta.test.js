// Pruebas del motor de la boleta (2.3, D117). Ejecutar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = {};
vm.createContext(ctx);
for (const f of ['Reglas.js', 'Calculos.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx);
const J = (x) => JSON.parse(JSON.stringify(x));

// Gasto común de octubre 2026 (divisor 22), tal como lo reparte el Excel en 5.Docx (local 0)
const GC_OCT = [
  { concepto: 'Luz', monto: 296890 / 22 }, { concepto: 'Agua', monto: 26216 / 22 },
  { concepto: 'Administración', monto: 300000 / 22 }, { concepto: 'Aseo general', monto: 45000 / 22 },
  { concepto: 'Jardinería', monto: 20000 / 22 }, { concepto: 'Personal aseo', monto: 639650 / 22 }, { concepto: 'Seguridad', monto: 0 },
];

test('gasto común: el peso del redondeo va al concepto más grande y las líneas suman la cuota', () => {
  const l = J(ctx.lineasGC(GC_OCT, 1, 60353));
  assert.deepStrictEqual(l.map((x) => x.monto), [13495, 1192, 13636, 2045, 909, 29076, 0]);
  assert.strictEqual(l.reduce((a, x) => a + x.monto, 0), 60353);
});

test('gasto común sin objetivo: solo redondea', () => {
  const l = J(ctx.lineasGC(GC_OCT, 1, null));
  assert.strictEqual(l.reduce((a, x) => a + x.monto, 0), 60352);
});

test('gasto común por días: 15 de 30 días, cuadra con la cuota proporcional', () => {
  const objetivo = Math.round(1327756 / 22 * 15 / 30);
  const l = J(ctx.lineasGC(GC_OCT, 15 / 30, objetivo));
  assert.strictEqual(l.reduce((a, x) => a + x.monto, 0), objetivo);
});

test('totales de un local: mismo total que la boleta de hoy (local 0, octubre)', () => {
  const t = J(ctx.totalesSeccion({ arriendo: 1000000, luz: null, agua: null, gc: ctx.lineasGC(GC_OCT, 1, 60353),
    cargos: [{ glosa: 'Marketing', monto: 10000 }] }));
  assert.deepStrictEqual(t, { arriendo: 1000000, luz: null, agua: null, subtotalLocatario: 1000000, otros: 10000, subtotalGC: 60353, total: 1070353 });
});

test('totales: cada línea al peso y el total es la suma de las líneas', () => {
  const t = J(ctx.totalesSeccion({ arriendo: 453724, luz: 27870.5, agua: 1895.3, gc: [{ concepto: 'Luz', monto: 4461 }],
    cargos: [{ glosa: 'Reparación', monto: 80000 }, { glosa: 'Descuento', monto: -20000 }] }));
  assert.strictEqual(t.luz, 27871);
  assert.strictEqual(t.agua, 1895);
  assert.strictEqual(t.otros, 60000);
  assert.strictEqual(t.subtotalLocatario, 453724 + 27871 + 1895, 'los cargos van en su propio bloque (D119)');
  assert.strictEqual(t.total, t.subtotalLocatario + 60000 + 4461);
});

test('id de la boleta', () => {
  assert.strictEqual(ctx.idBoleta('2026-11', ['L20', 'L30']), 'SC-202611-L20-L30');
});

test('orden del Resumen: los locales del mismo locatario suben junto al primero', () => {
  const filas = [['L01', 1, 'A'], ['L02', 2, 'B'], ['L07', 7, 'C'], ['L20', 20, 'C'], ['L29', 29, 'D'], ['L30', 30, 'E'],
    ['L31', 31, 'C'], ['CEX', 40, ''], ['L05', 5, '']].map(([u, o, l]) => ({ unidad_id: u, orden: o, locatario_id: l }));
  const r = J(ctx.ordenAgrupado(filas));
  assert.deepStrictEqual(r.map((f) => f.unidad_id), ['L01', 'L02', 'L05', 'L07', 'L20', 'L31', 'L29', 'L30', 'CEX']);
  assert.deepStrictEqual(r.filter((f) => f.grupo).map((f) => [f.unidad_id, f.grupo.n, f.grupo.primero]),
    [['L07', 3, true], ['L20', 3, false], ['L31', 3, false]]);
});
