// Pruebas del ambiente de prueba (D111): con AMBIENTE = 'prueba' no se instalan activadores ni se mandan correos.
// Ejecutar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function contexto(ambiente) {
  const usado = [];
  const ctx = {
    console, Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'AMBIENTE' ? ambiente : null) }) },
    ScriptApp: { getProjectTriggers: () => { usado.push('activadores'); return []; } },
    MailApp: { sendEmail: () => usado.push('correo') },
  };
  vm.createContext(ctx);
  for (const f of ['Setup.js', 'Diario.js', 'Respaldo.js', 'Trazabilidad.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx);
  }
  return { ctx, usado };
}

const FUNCIONES = ['instalarRevisionDiaria', 'revisionDiaria', 'instalarRespaldoSemanal', 'respaldoSemanal', 'instalarTrazabilidad'];

test('prueba: las funciones de activadores, correos y respaldo se niegan sin tocar nada', () => {
  const { ctx, usado } = contexto('prueba');
  assert.strictEqual(ctx.esPrueba_(), true);
  for (const f of FUNCIONES) assert.throws(() => ctx[f](), /Ambiente de prueba/, f);
  assert.deepStrictEqual(usado, []);
});

test('oficial (sin la propiedad): no es prueba y el seguro no bloquea', () => {
  const { ctx } = contexto(null);
  assert.strictEqual(ctx.esPrueba_(), false);
  assert.doesNotThrow(() => ctx.noEnPrueba_('x'));
});
