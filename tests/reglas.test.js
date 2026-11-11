// Pruebas de Reglas.js con casos reales de la carga.
// Ejecutar: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Reglas.js'), 'utf8'), ctx);
// Fechas creadas dentro del contexto, como las del Sheet en Apps Script
const F = (t) => vm.runInContext(`fechaDeTexto('${t}')`, ctx);

test('RUT: normaliza y valida dígito verificador', () => {
  assert.strictEqual(ctx.normalizarRut('76.543.210-3'), '76543210-3');
  assert.strictEqual(ctx.normalizarRut('10000013-k'), '10000013-K');
  assert.ok(ctx.rutValido('76111222-8'));
  assert.ok(ctx.rutValido('10000013-K'));
  assert.ok(!ctx.rutValido('76111222-9'));
  assert.ok(!ctx.rutValido(''));
});

test('correo: formato, minúscula y aviso .co', () => {
  assert.strictEqual(ctx.revisarCorreo('SALONEJEMPLO@GMAIL.COM').correo, 'salonejemplo@gmail.com');
  assert.strictEqual(ctx.revisarCorreo('sin-arroba').error, 'El correo no tiene un formato válido.');
  assert.strictEqual(ctx.revisarCorreo('').error, 'Falta el correo.');
  const r = ctx.revisarCorreo('locatario.ejemplo@gmail.co');
  assert.strictEqual(r.error, null);
  assert.match(r.aviso, /gmail\.com/);
  assert.strictEqual(ctx.revisarCorreo('contacto@empresa-ejemplo.cl').aviso, null);
  assert.ok(ctx.revisarCorreo('prueba@gmail.con').aviso.includes('@gmail.com'), 'D99: .con');
  assert.ok(ctx.revisarCorreo('prueba@hotmail.cm').aviso.includes('@hotmail.com'));
  assert.ok(ctx.revisarCorreo('prueba@gmial.com').aviso.includes('@gmail.com'), 'D99: nombre mal escrito');
  assert.strictEqual(ctx.revisarCorreo('prueba@live.cl').aviso, null, 'live.cl existe');
  assert.strictEqual(ctx.revisarCorreo('prueba@gmail.com').aviso, null);
});

test('fechas: texto <-> Date y fechas imposibles', () => {
  assert.strictEqual(ctx.textoDeFecha(F('2026-10-25')), '2026-10-25');
  assert.strictEqual(F('2026-02-30'), null);
  assert.strictEqual(ctx.sumarMesesPeriodo('2026-12', 1), '2027-01');
});

test('estado del contrato (fin = último día pagado, D113)', () => {
  const hoy = F('2026-11-02');
  assert.strictEqual(ctx.estadoContrato({ fecha_inicio: F('2026-11-03') }, hoy), 'por_iniciar');
  assert.strictEqual(ctx.estadoContrato({ fecha_inicio: F('2026-08-01'), fecha_fin: null }, hoy), 'vigente');
  assert.strictEqual(ctx.estadoContrato({ fecha_inicio: F('2026-08-01'), fecha_fin: F('2026-10-10') }, hoy), 'terminado');
  assert.strictEqual(ctx.estadoContrato({ fecha_inicio: F('2025-05-01'), fecha_fin: F('2026-11-10') }, hoy), 'vigente');
  assert.strictEqual(ctx.estadoContrato({ fecha_inicio: F('2026-08-01'), fecha_fin: F('2026-11-02') }, hoy), 'vigente', 'el último día pagado sigue vigente');
  assert.strictEqual(ctx.estadoContrato({ fecha_inicio: F('2026-08-01'), fecha_fin: F('2026-11-01') }, hoy), 'terminado');
  assert.strictEqual(ctx.estadoContrato({ estado: 'anulado', fecha_inicio: F('2026-08-01') }, hoy), 'anulado');
});

test('traslape: locatario nuevo en el local 31 vs el anterior (si tuviera fechas válidas)', () => {
  const nuevo = { contrato_id: 'CON-0015', unidad_id: 'L31', fecha_inicio: F('2026-10-25'), fecha_fin: null };
  const anterior = { contrato_id: 'X', unidad_id: 'L31', fecha_inicio: F('2023-03-01'), fecha_fin: F('2026-10-26') };
  assert.ok(ctx.seTraslapan(nuevo, anterior));
  // D113: si el anterior pagó hasta el 25, el nuevo no puede empezar el 25 (los dos pagarían ese día)
  assert.ok(ctx.seTraslapan(nuevo, Object.assign({}, anterior, { fecha_fin: F('2026-10-25') })));
  const anteriorOk = Object.assign({}, anterior, { fecha_fin: F('2026-10-24') }); // pagó hasta el día anterior a la entrada del nuevo
  assert.ok(!ctx.seTraslapan(nuevo, anteriorOk));
  assert.strictEqual(ctx.buscarTraslape(nuevo, [nuevo, anteriorOk]), null, 'no se compara consigo mismo');
  assert.strictEqual(ctx.buscarTraslape(nuevo, [Object.assign({}, anterior, { estado: 'anulado' })]), null);
  assert.strictEqual(ctx.buscarTraslape(nuevo, [anterior]).contrato_id, 'X');
});

test('proporcional primer mes (D07)', () => {
  const r = ctx.proporcionalPrimerMes(449592, F('2026-10-25'));
  assert.deepStrictEqual([r.dias, r.diasMes, r.monto, r.periodo], [7, 31, 101521, '2026-10']);
  assert.strictEqual(ctx.proporcionalPrimerMes(449592, F('2026-11-01')).monto, 449592);
});

test('contrato de un solo mes (D99, D113)', () => {
  const r = ctx.proporcionalUltimoMes(10, F('2026-11-16'), F('2026-11-15'));
  assert.strictEqual(r.dias, 2); assert.strictEqual(r.unico, true); assert.strictEqual(r.monto, 1);
  assert.strictEqual(ctx.proporcionalUltimoMes(300000, F('2026-11-15'), F('2026-11-15')).dias, 1, 'un solo día: inicio = término');
  const n = ctx.proporcionalUltimoMes(449592, F('2026-11-02'), F('2025-05-01'));
  assert.strictEqual(n.dias, 2); assert.strictEqual(n.unico, false);
  assert.strictEqual(ctx.fechaParaMensaje(F('2026-11-15')), '15-11-2026');
});

test('proporcional último mes (D95, D113: hasta el último día pagado, incluido)', () => {
  const r = ctx.proporcionalUltimoMes(449592, F('2026-10-09'));
  assert.deepStrictEqual([r.dias, r.monto], [9, 130527]);
  assert.strictEqual(ctx.proporcionalUltimoMes(449592, F('2026-11-09')).monto, 134878);
  assert.strictEqual(ctx.proporcionalUltimoMes(449592, F('2026-10-01')).dias, 1, 'termina el día 1: se cobra ese día');
  assert.strictEqual(ctx.proporcionalUltimoMes(449592, F('2026-10-31')).monto, 449592, 'pagó hasta fin de mes: mes completo');
});

test('reajuste: aniversario y período desde el que rige (D09)', () => {
  assert.strictEqual(ctx.periodoDesdeAniversario(F('2027-10-01')), '2027-10');
  assert.strictEqual(ctx.periodoDesdeAniversario(F('2027-10-25')), '2027-11');
  assert.strictEqual(ctx.ultimoAniversario(F('2026-08-01'), F('2026-11-02')), null);
  assert.strictEqual(ctx.textoDeFecha(ctx.ultimoAniversario(F('2025-05-01'), F('2026-11-02'))), '2026-05-01');
});

test('reajustes pendientes', () => {
  const contratos = [
    { contrato_id: 'A', unidad_id: 'L13', fecha_inicio: F('2025-05-01'), fecha_fin: F('2026-11-10') },
    { contrato_id: 'B', unidad_id: 'L00', fecha_inicio: F('2026-10-01'), fecha_fin: null },
  ];
  const tramos = {
    A: [{ desde_periodo: '2025-05', monto: 449592 }],
    B: [{ desde_periodo: '2026-10', monto: 1000000 }],
  };
  let p = ctx.reajustesPendientes(contratos, (id) => tramos[id], F('2026-11-02'));
  assert.strictEqual(p.length, 1);
  assert.deepStrictEqual([p[0].contrato_id, p[0].desde_periodo, p[0].monto_actual], ['A', '2026-05', 449592]);
  tramos.A.push({ desde_periodo: '2026-05', monto: 449592 }); // "sin reajuste" de la carga
  assert.strictEqual(ctx.reajustesPendientes(contratos, (id) => tramos[id], F('2026-11-02')).length, 0);
  // Local 0 cumple año el 01-10-2027
  p = ctx.reajustesPendientes(contratos, (id) => tramos[id], F('2027-10-01'));
  assert.deepStrictEqual([...p.map((x) => x.contrato_id)], ['B']);
  assert.strictEqual(ctx.aniversariosDeHoy(contratos, F('2027-10-01')).length, 1);
  assert.strictEqual(ctx.aniversariosDeHoy(contratos, F('2027-10-02')).length, 0);
});

test('tramo vigente y validación de tramo nuevo', () => {
  const tramos = [{ desde_periodo: '2025-05', monto: 1 }, { desde_periodo: '2026-05', monto: 2 }, { desde_periodo: '2026-09', monto: 3, estado: 'anulado' }];
  assert.strictEqual(ctx.tramoVigente(tramos, '2026-10').monto, 2);
  assert.strictEqual(ctx.tramoVigente(tramos, '2025-04'), null);
  assert.strictEqual(ctx.validarTramoNuevo('2027-05', 470000, '', tramos), null);
  assert.match(ctx.validarTramoNuevo('2026-04', 470000, '', tramos), /o después/);
  assert.match(ctx.validarTramoNuevo('2026-05', 470000, '', tramos), /Ya existe/);
  assert.match(ctx.validarTramoNuevo('2027-05', 0, '', tramos), /motivo/);
  assert.strictEqual(ctx.validarTramoNuevo('2027-05', 0, 'Uso propio', tramos), null);
  assert.match(ctx.validarTramoNuevo('2027-05', 470000.5, '', tramos), /entero/);
});
