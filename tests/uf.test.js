// Pruebas de las reglas de la UF (2.1, D106, D108).
// Ejecutar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Reglas.js'), 'utf8'), ctx);
const F = (t) => vm.runInContext(`fechaDeTexto('${t}')`, ctx);
const T = (d) => ctx.textoDeFecha(d);

test('último día del período (mes = mes, D106)', () => {
  assert.strictEqual(T(ctx.ultimoDiaDelPeriodo('2026-11')), '2026-11-30');
  assert.strictEqual(T(ctx.ultimoDiaDelPeriodo('2026-12')), '2026-12-31');
  assert.strictEqual(T(ctx.ultimoDiaDelPeriodo('2028-02')), '2028-02-29');
});

test('respuesta de la CMF', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.ufDesdeRespuestaCmf({ UFs: [{ Valor: '39.643,26', Fecha: '2026-11-30' }] }))),
    { fecha: '2026-11-30', valor: 39643.26 });
  assert.strictEqual(ctx.ufDesdeRespuestaCmf({ UFs: [] }), null);
  assert.strictEqual(ctx.ufDesdeRespuestaCmf({ CodigoHTTP: 404, Mensaje: 'Error' }), null);
  assert.strictEqual(ctx.ufDesdeRespuestaCmf(null), null);
  assert.strictEqual(ctx.ufDesdeRespuestaCmf({ UFs: [{ Valor: 'abc', Fecha: '2026-11-30' }] }), null);
});

test('valor vigente de una fecha: ignora anulados y toma el último registrado', () => {
  const v = [
    { uf_id: 'UF-000001', fecha: F('2026-11-30'), valor: 39000, estado: 'anulado' },
    { uf_id: 'UF-000002', fecha: F('2026-11-30'), valor: 39643.26, estado: 'vigente' },
    { uf_id: 'UF-000003', fecha: F('2026-10-31'), valor: 39500, estado: 'vigente' },
  ];
  assert.strictEqual(ctx.ufDeFecha(v, F('2026-11-30')).valor, 39643.26);
  assert.strictEqual(ctx.ufDeFecha(v, F('2026-12-31')), null);
});

test('UF manual: rango, decimales y motivo', () => {
  assert.strictEqual(ctx.validarUfManual(39643.26, 'CMF caída'), null);
  assert.match(ctx.validarUfManual(3964326, 'x'), /entre/);
  assert.match(ctx.validarUfManual(39643.261, 'x'), /dos decimales/);
  assert.match(ctx.validarUfManual(39643.26, ' '), /motivo/);
});

test('arriendo en pesos: UF × valor del último día, al peso; CLP igual', () => {
  assert.strictEqual(ctx.arriendoEnPesos(11, 'UF', 39643.26), 436076);
  assert.strictEqual(ctx.arriendoEnPesos(16.5, 'UF', 39643.26), 654114);
  assert.strictEqual(ctx.arriendoEnPesos(1000000, 'CLP', 39643.26), 1000000);
  assert.strictEqual(ctx.arriendoEnPesos(11, 'UF', null), null);
  assert.strictEqual(ctx.monedaDeTramo({ moneda: '' }), 'CLP');
  assert.strictEqual(ctx.monedaDeTramo({ moneda: 'UF' }), 'UF');
});

test('proporcional con UF: sobre el monto ya redondeado, también al peso (como el Excel con el L31)', () => {
  // L31 en octubre: 680.586 × 5/31 = 109.772
  assert.strictEqual(ctx.proporcionalPrimerMes(680586, F('2026-10-27')).monto, 109772);
});

test('tramo en UF: monto, decimales y período desde el que se permite', () => {
  const tramos = [{ desde_periodo: '2026-08', monto: 449592, estado: 'vigente' }];
  assert.strictEqual(ctx.validarTramoNuevo('2026-11', 16.5, '', tramos, 'UF', '2026-11'), null);
  assert.match(ctx.validarTramoNuevo('2026-10', 16.5, '', tramos, 'UF', '2026-11'), /rige desde 2026-11/);
  assert.match(ctx.validarTramoNuevo('2026-11', 0, '', tramos, 'UF', '2026-11'), /mayor que 0/);
  assert.match(ctx.validarTramoNuevo('2026-11', 16.555, '', tramos, 'UF', '2026-11'), /dos decimales/);
  assert.strictEqual(ctx.validarTramoNuevo('2026-11', 1000000, '', tramos, 'CLP', '2026-11'), null);
  assert.match(ctx.validarTramoNuevo('2026-11', 11.5, '', tramos, 'CLP', '2026-11'), /entero/);
  assert.match(ctx.validarTramoNuevo('2026-11', 11, '', tramos, 'USD', '2026-11'), /moneda/);
});
