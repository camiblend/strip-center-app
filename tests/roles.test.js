// Pruebas del rol solo_lectura (D91): el servidor solo le permite acciones de consulta.
// Ejecutar: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = { console: { error() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Web.js'), 'utf8'), ctx);
vm.runInContext(`
  function ErrorApp_(codigo, mensaje) { var e = new Error(mensaje); e.codigo = codigo; return e; }
  var ROL_PRUEBA = 'solo_lectura';
  function obtenerSesion_() { return { u: 'USR-09', r: ROL_PRUEBA, n: 'Prueba' }; }
  function requerirAdministradora_(s) { if (s.r !== 'administradora') throw ErrorApp_('SIN_PERMISO', 'Solo la administradora.'); }
  function paraPantalla_(x) { return x; }
`, ctx);
// Cada acción, en vez de hacer su trabajo, responde 'ejecutada'
for (const nombre of Object.keys(ctx.ACCIONES)) ctx.ACCIONES[nombre].fn = () => 'ejecutada';

const CONSULTA = ['inicio', 'maestros', 'panelCierre', 'datosLecturas', 'datosBoletas', 'datosGastos', 'resumen', 'boletasLocatarios',
  'datosMovimientos', 'datosPagos'];

test('solo lectura: puede consultar, salir y cambiar su PIN', () => {
  for (const a of CONSULTA.concat(['salir', 'cambiarMiPin'])) {
    assert.deepStrictEqual({ a, r: ctx.llamar(a, 't', {}).datos }, { a, r: 'ejecutada' });
  }
});

test('solo lectura: cualquier otra acción se rechaza', () => {
  const otras = Object.keys(ctx.ACCIONES).filter((a) => CONSULTA.indexOf(a) === -1 &&
    !ctx.ACCIONES[a].publica && !ctx.ACCIONES[a].conPinTemporal);
  assert.ok(otras.indexOf('guardarLectura') !== -1 && otras.indexOf('crearPago') !== -1);
  for (const a of otras) {
    const r = ctx.llamar(a, 't', {});
    assert.strictEqual(r.ok, false, a);
    assert.strictEqual(r.codigo, 'SIN_PERMISO', a);
  }
});

test('digitadora: puede guardar (el rol nuevo no cambia a los demás)', () => {
  vm.runInContext("ROL_PRUEBA = 'digitadora'", ctx);
  assert.strictEqual(ctx.llamar('guardarLectura', 't', {}).datos, 'ejecutada');
  assert.strictEqual(ctx.llamar('confirmarCierre', 't', {}).codigo, 'SIN_PERMISO');
});
