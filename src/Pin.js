/**
 * Reglas del PIN. Funciones puras (sin Sheets ni Google), probadas en tests/pin.test.js.
 * La única dependencia de Apps Script es digestHexGas_, que se inyecta en hashPin.
 */

var PIN_ITERACIONES = 1000;

/** Devuelve un mensaje de error, o null si el PIN nuevo es aceptable. */
function validarPinNuevo(pin, largo) {
  pin = String(pin === undefined || pin === null ? '' : pin);
  if (!new RegExp('^\\d{' + largo + '}$').test(pin)) return 'El PIN debe tener ' + largo + ' dígitos.';
  if (/^(\d)\1+$/.test(pin)) return 'El PIN no puede tener todos los dígitos iguales.';
  if (esSecuencia(pin)) return 'El PIN no puede ser una secuencia como 123456 o 654321.';
  return null;
}

function esSecuencia(pin) {
  var asc = true, desc = true;
  for (var i = 1; i < pin.length; i++) {
    var d = Number(pin[i]) - Number(pin[i - 1]);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

/** Hash guardado como 'iteraciones$hex', para poder cambiar las iteraciones sin invalidar PIN antiguos. */
function hashPin(pin, salt, iteraciones, digestHex) {
  var h = salt + ':' + pin;
  for (var i = 0; i < iteraciones; i++) h = digestHex(salt + h);
  return iteraciones + '$' + h;
}

function verificarPin(pin, hashGuardado, salt, digestHex) {
  var partes = String(hashGuardado || '').split('$');
  if (partes.length !== 2) return false;
  return igualesSeguro(hashPin(String(pin), salt, Number(partes[0]), digestHex), hashGuardado);
}

/** Comparación que tarda lo mismo aunque difiera el primer carácter. */
function igualesSeguro(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Resultado de un intento fallido. Si el bloqueo anterior ya venció, el contador parte de cero.
 * Devuelve {intentos, bloqueado_hasta (Date o ''), bloqueado, restantes}.
 */
function resultadoFallo(intentosPrevios, bloqueadoHasta, ahora, max, minutos) {
  var vencido = esFecha_(bloqueadoHasta) && bloqueadoHasta <= ahora;
  var n = (vencido ? 0 : Number(intentosPrevios) || 0) + 1;
  if (n >= max) {
    return { intentos: n, bloqueado_hasta: new Date(ahora.getTime() + minutos * 60000), bloqueado: true, restantes: 0 };
  }
  return { intentos: n, bloqueado_hasta: '', bloqueado: false, restantes: max - n };
}

function estaBloqueado(bloqueadoHasta, ahora) {
  return esFecha_(bloqueadoHasta) && bloqueadoHasta > ahora;
}

/** Celda vacía del Sheet = ''; con fecha = Date. */
function esFecha_(v) {
  return v !== null && typeof v === 'object' && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

/** PIN temporal aleatorio que cumple las reglas. `digito()` devuelve un entero 0–9. */
function generarPinTemporal(largo, digito) {
  for (var intento = 0; intento < 100; intento++) {
    var pin = '';
    for (var i = 0; i < largo; i++) pin += String(digito());
    if (validarPinNuevo(pin, largo) === null) return pin;
  }
  throw new Error('No se pudo generar un PIN temporal');
}

// ---------------------------------------------------------------- Implementaciones de Apps Script

function digestHexGas_(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)
    .map(function (b) { var h = (b & 0xff).toString(16); return h.length === 1 ? '0' + h : h; })
    .join('');
}

/** Dígito aleatorio a partir de un UUID (fuente aleatoria del servidor de Google). */
function digitoAleatorio_() {
  while (true) {
    var n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 2), 16);
    if (n < 250) return n % 10; // descarta 250–255 para que los 10 dígitos sean igual de probables
  }
}

function nuevaSal_() {
  return Utilities.getUuid().replace(/-/g, '');
}
