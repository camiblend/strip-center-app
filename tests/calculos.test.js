// Pruebas de Calculos.js con casos reales (septiembre 2026).
// Ejecutar: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = {};
vm.createContext(ctx);
for (const f of ['Reglas.js', 'Calculos.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx);
const F = (t) => vm.runInContext(`fechaDeTexto('${t}')`, ctx);
const P = { alerta_factor_alto: 2, alerta_factor_bajo: 0.5, alerta_min_kwh: 5, alerta_min_m3: 1 };

test('período en curso', () => {
  assert.strictEqual(ctx.periodoEnCurso('2026-09', '2026-11'), '2026-10');
  assert.strictEqual(ctx.periodoEnCurso('2026-12', '2027-01'), '2027-01');
});

test('consumo normal, primera lectura y base', () => {
  assert.strictEqual(ctx.consumoDe(1369.3, 1275.0, null, ''), 94.3); // local 7 luz sept
  assert.strictEqual(ctx.consumoDe(32, 29, null, ''), 3);
  assert.strictEqual(ctx.consumoDe(150, null, null, ''), 0, 'sin anterior: queda como base');
  assert.strictEqual(ctx.consumoDe(30, 34, null, 'base'), 0);
  assert.strictEqual(ctx.consumoDe(30, 34, null, ''), -4, 'en revisión se muestra tal cual');
});

test('consumo con cambio de medidor (D13)', () => {
  // anterior del viejo 900, el viejo llegó a 935, el nuevo partió en 0 y marca 12 → 35 + 12
  assert.strictEqual(ctx.consumoDe(12, null, { anteriorViejo: 900, final: 935, inicial: 0 }, ''), 47);
  // sin la última lectura del viejo: solo el tramo nuevo
  assert.strictEqual(ctx.consumoDe(12, null, { anteriorViejo: 900, final: null, inicial: 0 }, ''), 12);
  assert.strictEqual(ctx.consumoDe(112, null, { anteriorViejo: 900, final: 935, inicial: 100 }, ''), 47);
});

test('promedio y alerta fuera de rango', () => {
  assert.strictEqual(ctx.promedioConsumo([10, 20, 30, 40, 50, 60, 70], 6), 45);
  assert.strictEqual(ctx.promedioConsumo([], 6), null);
  assert.deepStrictEqual([...ctx.alertasRango(200, 90, 'luz', P)], ['FUERA_RANGO']);
  assert.deepStrictEqual([...ctx.alertasRango(40, 90, 'luz', P)], ['FUERA_RANGO']);
  assert.deepStrictEqual([...ctx.alertasRango(92.7, 90, 'luz', P)], []);
  assert.deepStrictEqual([...ctx.alertasRango(3, 1, 'agua', P)], ['FUERA_RANGO']);
  assert.deepStrictEqual([...ctx.alertasRango(1.4, 0.5, 'agua', P)], [], 'diferencia < 1 m³ no alerta');
  assert.deepStrictEqual([...ctx.alertasRango(500, null, 'luz', P)], [], 'sin historial no alerta');
});

test('costo unitario y su variación (sept 2026)', () => {
  const luz = ctx.costoUnitario(1359700, 12094);
  assert.strictEqual(Math.round(luz * 10000) / 10000, 112.4277);
  assert.strictEqual(Math.round(ctx.costoUnitario(256920, 147) * 10000) / 10000, 1747.7551);
  assert.ok(ctx.variacionCosto(luz, 259.98, 0.3) < -0.5, 'ago → sept cae más de 50%');
  assert.strictEqual(ctx.variacionCosto(240, 230, 0.3), null);
});

// D113: fecha_fin = último día pagado. L13 y L18 se ingresaron con D08 (día siguiente) y se corrigen −1 día al publicar 2.1.
test('unidades que pagan GC: sept 2026 = 14 (D06, D113)', () => {
  const c = (u, ini, fin, extra) => Object.assign({ unidad_id: u, fecha_inicio: F(ini), fecha_fin: fin ? F(fin) : null, paga_gc: true }, extra);
  const contratos = [
    c('L07', '2026-08-01'), c('L08', '2026-04-01'), c('L09', '2026-01-01'), c('L10', '2026-01-01'), c('L11', '2026-01-03'),
    c('L12', '2026-01-01'), c('L13', '2025-05-01', '2026-11-09'), c('L15', '2026-05-01'), c('L16', '2026-08-01', '2026-10-09'),
    c('L17', '2026-08-01', '2026-12-31'), c('L18', '2025-03-01', '2026-09-30'), c('L20', '2026-08-01'), c('L29', '2026-02-01'),
    c('L30', '2026-05-26'), c('L00', '2026-10-01'), c('L31', '2026-10-25'), c('L19', '2026-11-01'),
    c('L26', '2023-08-15', '2026-08-31'), c('L21', '2026-01-01', null, { estado: 'anulado' }),
  ];
  assert.strictEqual(ctx.unidadesQuePaganGC(contratos, '2026-09').length, 14);
  const oct = ctx.unidadesQuePaganGC(contratos, '2026-10');
  assert.strictEqual(oct.length, 14);
  assert.ok(oct.includes('L00') && !oct.includes('L18') && !oct.includes('L31'));
  const conContrato = ctx.unidadesConContratoEnMes(contratos, '2026-10');
  assert.ok(conContrato.includes('L31') && conContrato.includes('L16') && !conContrato.includes('L18') && !conContrato.includes('L19'));
});

test('divisor del GC: unidades activas marcadas, ocupadas o no (D94)', () => {
  const u = (id, cuenta, activa = true) => ({ unidad_id: id, cuenta_gc: cuenta, activa });
  const unidades = [u('L00', true), u('L01', false), u('L06', true), u('L11', true), u('L21', false), u('L31', true),
    u('L13', true, false), u('BOD', false), u('CEX', false), u('L07', undefined)];
  assert.deepStrictEqual(Array.from(ctx.unidadesDelDivisorGC(unidades)), ['L00', 'L06', 'L11', 'L31']);
  assert.strictEqual(ctx.unidadesDelDivisorGC([]).length, 0);
});

test('gastos comunes sept 2026: cuota $87.607 con divisor 16', () => {
  // Fijos y extra de 4.GC fila 33; consumos de calles y costos de las boletas de sept
  const costo = { luz: 1359700 / 12094, agua: 256920 / 147 };
  const consumoCalles = { luz: 220942.8179 / costo.luz, agua: 96126.53061 / costo.agua };
  const r = ctx.calcularGC([300000, 45000, 20000, 639650, 0], [80000], consumoCalles, costo, 16);
  assert.strictEqual(Math.round(r.total), 1401719);
  assert.strictEqual(Math.round(r.cuota), 87607);
  assert.strictEqual(ctx.calcularGC([1], [], {}, {}, 0).cuota, null);
});

test('revisión antes de confirmar (L1, L2)', () => {
  const base = { boletas: { luz: true, agua: true }, callesSinLectura: [], enRevision: 0, fijos: 5, divisor: 14, sinLectura: ['L00', 'L31'], confirmadosCero: ['L00'] };
  let r = ctx.revisarParaConfirmar(base);
  assert.strictEqual(r.bloqueos.length, 0);
  assert.deepStrictEqual([...r.pendientesCero], ['L31']);
  const det = ctx.revisarParaConfirmar(Object.assign({}, base, { enRevision: 1, revisiones: ['Local 10 · agua (bajó de 10 a 5)'] }));
  assert.ok(det.bloqueos[0].includes('Local 10 · agua (bajó de 10 a 5)') && det.bloqueos[0].includes('administradora'), 'D96: nombra la lectura');
  r = ctx.revisarParaConfirmar(Object.assign({}, base, { boletas: { luz: true, agua: false }, callesSinLectura: ['Calle Exterior (luz)'], enRevision: 2 }));
  assert.strictEqual(r.bloqueos.length, 3);
});

test('cuotas: $138.535 en 3 (M3)', () => {
  assert.deepStrictEqual([...ctx.dividirEnCuotas(138535, 3)], [46178, 46178, 46179]);
  assert.deepStrictEqual([...ctx.dividirEnCuotas(90000, 3)], [30000, 30000, 30000]);
  assert.strictEqual(ctx.dividirEnCuotas(100, 7).reduce((a, b) => a + b, 0), 100);
});

test('anular: digitadora solo lo suyo y el mismo día (M1)', () => {
  const hoy = F('2026-11-02');
  const r = { creado_por: 'USR-02', creado_en: vm.runInContext('new Date(2026, 10, 2, 15, 30)', ctx) };
  assert.ok(ctx.puedeAnular(r, 'USR-02', 'digitadora', hoy));
  assert.ok(!ctx.puedeAnular(r, 'USR-03', 'digitadora', hoy));
  assert.ok(!ctx.puedeAnular(r, 'USR-02', 'digitadora', F('2026-11-03')));
  assert.ok(ctx.puedeAnular(r, 'USR-01', 'administradora', F('2027-01-01')));
});

test('contrato para un cargo (M4)', () => {
  const c = (id, u, ini, fin, extra) => Object.assign({ contrato_id: id, unidad_id: u, fecha_inicio: F(ini), fecha_fin: fin ? F(fin) : null }, extra);
  const contratos = [c('A', 'L18', '2025-03-01', '2026-10-01'), c('B', 'L07', '2026-08-01'), c('X', 'L21', '2026-01-01', null, { estado: 'anulado' })];
  assert.deepStrictEqual([ctx.contratoParaMovimiento(contratos, 'L07', '2026-11').contrato.contrato_id, ctx.contratoParaMovimiento(contratos, 'L07', '2026-11').terminado], ['B', false]);
  const terminado = ctx.contratoParaMovimiento(contratos, 'L18', '2026-11');
  assert.deepStrictEqual([terminado.contrato.contrato_id, terminado.terminado], ['A', true]);
  assert.strictEqual(ctx.contratoParaMovimiento(contratos, 'L21', '2026-11'), null, 'contrato anulado no cuenta');
  assert.strictEqual(ctx.contratoParaMovimiento(contratos, 'L07', '2026-05'), null, 'antes de su primer contrato');
});

test('pago duplicado (M5)', () => {
  const pagos = [{ referencia: '123', unidad_id: 'L20', monto: 450000 }, { referencia: '999', unidad_id: 'L20', monto: 450000, estado: 'anulado' }];
  assert.ok(ctx.pagoDuplicado(pagos, { referencia: ' 123 ', unidad_id: 'L20', monto: '450000' }));
  assert.strictEqual(ctx.pagoDuplicado(pagos, { referencia: '123', unidad_id: 'L30', monto: 450000 }), null);
  assert.strictEqual(ctx.pagoDuplicado(pagos, { referencia: '999', unidad_id: 'L20', monto: 450000 }), null);
  assert.strictEqual(ctx.pagoDuplicado(pagos, { referencia: '', unidad_id: 'L20', monto: 450000 }), null);
});

test('mes y contrato para movimientos con término = último día pagado (D113)', () => {
  const r = ctx.rangoDelMes('2026-11');
  assert.strictEqual(ctx.textoDeFecha(r.fecha_inicio), '2026-11-01');
  assert.strictEqual(ctx.textoDeFecha(r.fecha_fin), '2026-11-30');
  const c = (id, ini, fin) => ({ contrato_id: id, unidad_id: 'L13', fecha_inicio: F(ini), fecha_fin: fin ? F(fin) : null });
  // pagó hasta el 1 de noviembre: noviembre todavía es suyo
  assert.strictEqual(ctx.contratoParaMovimiento([c('A', '2025-05-01', '2026-11-01')], 'L13', '2026-11').terminado, false);
  // pagó hasta el 31 de octubre: en noviembre queda como terminado
  const t = ctx.contratoParaMovimiento([c('A', '2025-05-01', '2026-10-31')], 'L13', '2026-11');
  assert.strictEqual(t.terminado, true);
  assert.ok(ctx.unidadesConContratoEnMes([c('A', '2025-05-01', '2026-11-01')], '2026-11').includes('L13'));
  assert.ok(!ctx.unidadesConContratoEnMes([c('A', '2025-05-01', '2026-10-31')], '2026-11').includes('L13'));
});

test('GC proporcional desde 2.1: cada contrato paga sus días, al peso (D112, D113)', () => {
  const c = (id, u, ini, fin, extra) => Object.assign({ contrato_id: id, unidad_id: u, locatario_id: 'LOC-' + id, fecha_inicio: F(ini),
    fecha_fin: fin ? F(fin) : null, paga_gc: true }, extra);
  const contratos = [
    c('A', 'L07', '2026-01-01'),                              // mes completo
    c('B', 'L13', '2025-05-01', '2026-11-09'),                // sale: pagó hasta el 9
    c('C', 'L13', '2026-11-10'),                              // entra el 10
    c('D', 'L19', '2026-11-30'),                              // solo el último día
    c('E', 'L11', '2026-01-03', null, { paga_gc: false }),   // local 11: no paga GC (D25)
    c('F', 'L21', '2026-01-01', null, { estado: 'anulado' }),
    c('G', 'L18', '2025-03-01', '2026-10-31'),                // terminó en octubre
  ];
  const r = ctx.cuotasGCProporcional(contratos, '2026-11', 60000.4);
  assert.deepStrictEqual(Object.keys(r).sort(), ['L07', 'L13', 'L19']);
  assert.strictEqual(r.L07[0].monto, 60000.4, 'mes completo: la cuota tal cual');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.L13.map((x) => [x.contrato_id, x.dias, x.monto]))), [['B', 9, 18000], ['C', 21, 42000]]);
  assert.deepStrictEqual([r.L19[0].dias, r.L19[0].monto], [1, 2000]);
  assert.strictEqual(ctx.cuotasGCProporcional(contratos, '2026-11', null).L13[0].monto, null);
  assert.deepStrictEqual([...ctx.unidadesQuePaganGCSegun(contratos, '2026-11', true)], ['L07', 'L13', 'L19']);
  // regla del día 1 (octubre y antes): L19 y C no pagan noviembre; B sí (vigente el día 1)
  assert.deepStrictEqual([...ctx.unidadesQuePaganGCSegun(contratos, '2026-11', false)], ['L07', 'L13']);
});

test('GC proporcional: cambio de horario (septiembre en Chile) no corre un día', () => {
  const r = ctx.cuotasGCProporcional([{ contrato_id: 'X', unidad_id: 'L01', fecha_inicio: F('2026-09-01'), fecha_fin: F('2026-09-15'), paga_gc: true }], '2026-09', 30000);
  assert.strictEqual(r.L01[0].dias, 15);
});
