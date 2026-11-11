// Pruebas de PIN, bloqueo, sesión e IDs (funciones puras de Pin.js, Sesion.js y Datos.js).
// Ejecutar: npm test
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = {};
vm.createContext(ctx);
for (const archivo of ['Pin.js', 'Sesion.js', 'Datos.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', archivo), 'utf8'), ctx);
}
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

test('PIN: largo y solo dígitos', () => {
  assert.strictEqual(ctx.validarPinNuevo('48213', 6), 'El PIN debe tener 6 dígitos.');
  assert.strictEqual(ctx.validarPinNuevo('48a137', 6), 'El PIN debe tener 6 dígitos.');
  assert.strictEqual(ctx.validarPinNuevo('482137', 6), null);
});

test('PIN: rechaza triviales', () => {
  assert.match(ctx.validarPinNuevo('111111', 6), /iguales/);
  assert.match(ctx.validarPinNuevo('123456', 6), /secuencia/);
  assert.match(ctx.validarPinNuevo('987654', 6), /secuencia/);
  assert.strictEqual(ctx.validarPinNuevo('121212', 6), null);
});

test('hash: guarda iteraciones, verifica y no contiene el PIN', () => {
  const h = ctx.hashPin('482137', 'sal1', 1000, sha);
  assert.match(h, /^1000\$[0-9a-f]{64}$/);
  assert.ok(!h.includes('482137'));
  assert.ok(ctx.verificarPin('482137', h, 'sal1', sha));
  assert.ok(!ctx.verificarPin('482138', h, 'sal1', sha));
  assert.ok(!ctx.verificarPin('482137', h, 'otra', sha), 'la sal cambia el resultado');
  assert.ok(!ctx.verificarPin('482137', '', 'sal1', sha));
});

test('hash: respeta las iteraciones guardadas', () => {
  const h10 = ctx.hashPin('482137', 's', 10, sha);
  assert.ok(ctx.verificarPin('482137', h10, 's', sha));
});

test('bloqueo: cuenta intentos y bloquea al máximo', () => {
  const ahora = new Date('2026-11-02T10:00:00Z');
  let r = ctx.resultadoFallo(0, '', ahora, 5, 15);
  assert.deepStrictEqual([r.intentos, r.bloqueado, r.restantes], [1, false, 4]);
  r = ctx.resultadoFallo(4, '', ahora, 5, 15);
  assert.strictEqual(r.bloqueado, true);
  assert.strictEqual(r.bloqueado_hasta.getTime(), ahora.getTime() + 15 * 60000);
});

test('bloqueo: si el bloqueo venció, el contador parte de cero', () => {
  const ahora = new Date('2026-11-02T10:00:00Z');
  const vencido = new Date('2026-11-02T09:50:00Z');
  const r = ctx.resultadoFallo(5, vencido, ahora, 5, 15);
  assert.deepStrictEqual([r.intentos, r.bloqueado], [1, false]);
  assert.ok(!ctx.estaBloqueado(vencido, ahora));
  assert.ok(ctx.estaBloqueado(new Date('2026-11-02T10:05:00Z'), ahora));
  assert.ok(!ctx.estaBloqueado('', ahora));
});

test('PIN temporal: siempre válido', () => {
  let i = 0;
  const secuencia = [1, 1, 1, 1, 1, 1, 4, 8, 2, 1, 3, 7]; // el primero (111111) se descarta
  const pin = ctx.generarPinTemporal(6, () => secuencia[i++ % secuencia.length]);
  assert.strictEqual(pin, '482137');
});

test('sesión: vigente, expirada, inactiva, revocada', () => {
  const t0 = Date.parse('2026-11-02T10:00:00Z');
  const s = { v: 0, c: t0, a: t0 };
  assert.strictEqual(ctx.estadoSesion(s, t0 + 10 * 60000, 6, 30, 0), 'ok');
  assert.strictEqual(ctx.estadoSesion(s, t0 + 31 * 60000, 6, 30, 0), 'inactiva');
  assert.strictEqual(ctx.estadoSesion({ v: 0, c: t0, a: t0 + 6 * 3600000 }, t0 + 6 * 3600000 + 1, 6, 30, 0), 'expirada');
  assert.strictEqual(ctx.estadoSesion(s, t0 + 60000, 6, 30, 1), 'revocada');
  assert.strictEqual(ctx.estadoSesion(s, t0 + 5 * 3600000, 6, 0, 0), 'ok', '0 = sin límite de inactividad');
});

test('IDs: siguiente número con prefijo y ancho', () => {
  assert.strictEqual(ctx.siguienteIdDe([], 'USR-', 2), 'USR-01');
  assert.strictEqual(ctx.siguienteIdDe(['LOG-000009', 'LOG-000002', 'otro'], 'LOG-', 6), 'LOG-000010');
  assert.strictEqual(ctx.siguienteIdDe(['USR-09'], 'USR-', 2), 'USR-10');
});
