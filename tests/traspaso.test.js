// Pruebas de las lecturas de traspaso (2.2, D115). Ejecutar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = {};
vm.createContext(ctx);
for (const f of ['Reglas.js', 'Calculos.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx);
const F = (t) => vm.runInContext(`fechaDeTexto('${t}')`, ctx);
const J = (x) => JSON.parse(JSON.stringify(x));
const c = (id, ini, fin) => ({ contrato_id: id, unidad_id: 'L16', locatario_id: 'LOC-' + id, fecha_inicio: F(ini), fecha_fin: fin ? F(fin) : null });
const resumen = (r) => J(r.map((t) => [t.contrato_id, t.dias, t.consumo, t.estimado]));
const V = { anterior: 1000, actual: 1114, consumo: 114 };

test('mes completo con un contrato: un solo tramo, sin cortes (igual que hoy)', () => {
  const t = ctx.tramosDelMes([c('A', '2026-01-01')], 'L16', '2026-11');
  assert.strictEqual(t.length, 1);
  assert.deepStrictEqual(J(ctx.cortesDeTramos(t)), []);
  assert.deepStrictEqual(resumen(ctx.repartirConsumo(t, V, {}, true)), [['A', 30, 114, false]]);
});

test('sale uno y entra otro al día siguiente: un corte; con lectura, consumo exacto', () => {
  const t = ctx.tramosDelMes([c('A', '2026-01-01', '2026-11-15'), c('B', '2026-11-16')], 'L16', '2026-11');
  const cortes = J(ctx.cortesDeTramos(t));
  assert.deepStrictEqual(cortes.map((x) => x.clave), ['salida:A']);
  assert.deepStrictEqual(resumen(ctx.repartirConsumo(t, V, { 'salida:A': 1040 }, true)), [['A', 15, 40, false], ['B', 15, 74, false]]);
});

test('sin la lectura de traspaso: se estima por días', () => {
  const t = ctx.tramosDelMes([c('A', '2026-01-01', '2026-11-15'), c('B', '2026-11-16')], 'L16', '2026-11');
  assert.deepStrictEqual(resumen(ctx.repartirConsumo(t, V, {}, true)), [['A', 15, 57, true], ['B', 15, 57, true]]);
});

test('sale, vacío y entra: dos cortes; el vacío queda sin contrato (administración)', () => {
  const t = ctx.tramosDelMes([c('A', '2026-01-01', '2026-11-10'), c('B', '2026-11-21')], 'L16', '2026-11');
  assert.deepStrictEqual(J(ctx.cortesDeTramos(t)).map((x) => x.clave), ['salida:A', 'entrada:B']);
  const r = ctx.repartirConsumo(t, V, { 'salida:A': 1030, 'entrada:B': 1032 }, true);
  assert.deepStrictEqual(resumen(r), [['A', 10, 30, false], [null, 10, 2, false], ['B', 10, 82, false]]);
  // falta solo la de entrada: el vacío y el que entra se estiman entre la salida y el fin de mes
  const e = ctx.repartirConsumo(t, V, { 'salida:A': 1030 }, true);
  assert.deepStrictEqual(resumen(e), [['A', 10, 30, false], [null, 10, 42, true], ['B', 10, 42, true]]);
});

test('sale y queda vacío / estaba vacío y entra', () => {
  const sale = ctx.tramosDelMes([c('A', '2026-01-01', '2026-11-20')], 'L16', '2026-11');
  assert.deepStrictEqual(resumen(ctx.repartirConsumo(sale, V, { 'salida:A': 1100 }, true)), [['A', 20, 100, false], [null, 10, 14, false]]);
  const entra = ctx.tramosDelMes([c('B', '2026-11-11')], 'L16', '2026-11');
  assert.deepStrictEqual(J(ctx.cortesDeTramos(entra)).map((x) => x.clave), ['entrada:B']);
  assert.deepStrictEqual(resumen(ctx.repartirConsumo(entra, V, { 'entrada:B': 1004 }, true)), [[null, 10, 4, false], ['B', 20, 110, false]]);
});

test('lectura de traspaso fuera de orden o cambio de medidor: se estima por días', () => {
  const t = ctx.tramosDelMes([c('A', '2026-01-01', '2026-11-15'), c('B', '2026-11-16')], 'L16', '2026-11');
  assert.deepStrictEqual(resumen(ctx.repartirConsumo(t, V, { 'salida:A': 1200 }, true)), [['A', 15, 57, true], ['B', 15, 57, true]]);
  assert.deepStrictEqual(resumen(ctx.repartirConsumo(t, V, { 'salida:A': 1040 }, false)), [['A', 15, 57, true], ['B', 15, 57, true]]);
});

test('consumo con decimales: los tramos suman exactamente el total', () => {
  const t = ctx.tramosDelMes([c('A', '2026-01-01', '2026-11-10'), c('B', '2026-11-11')], 'L16', '2026-11');
  const r = ctx.repartirConsumo(t, { anterior: 300, actual: 307.35, consumo: 7.35 }, {}, true);
  assert.strictEqual(Math.round(r.reduce((s, x) => s + x.consumo, 0) * 1000) / 1000, 7.35);
});
