/**
 * Mide cuánto tarda cada pantalla con la forma antigua (cada hoja por separado, sin memoria) y con
 * la nueva (memoria + todas las hojas en una consulta), y comprueba que ambas entreguen exactamente
 * los mismos datos. Se ejecuta a mano desde el editor: `medirVelocidad`. No modifica datos.
 */
function medirVelocidad() {
  var s = { u: 'USR-01', r: 'administradora', n: 'medición' };
  var acciones = [
    ['Validar sesión (parámetros)', function () { return parametros_(); }],
    ['Inicio completo (saludo + panel)', function () { return inicio_(s); }],
    ['Lecturas', function () { return datosLecturas_(s, {}); }],
    ['Unidades y contratos', function () { return maestros_(s); }],
    ['Cargos / descuentos', function () { return datosMovimientos_(s); }],
    ['Resumen del período', function () { return resumen_(s, {}); }],
  ];
  var limpiarCache = function () { TABLAS_EN_CACHE.forEach(function (t) { CacheService.getScriptCache().remove('tabla_' + t); }); };
  var medir = function (fn) { var t = Date.now(); var r = fn(); return { ms: Date.now() - t, datos: normalizar_(r) }; };
  var filas = acciones.map(function (a) {
    reiniciarMemoria_(false); limpiarCache();
    var antes = medir(a[1]);
    reiniciarMemoria_(true); limpiarCache();
    var frio = medir(a[1]);
    reiniciarMemoria_(true); // acción nueva, con parámetros y catálogos ya en caché
    var ahora = medir(a[1]);
    var iguales = antes.datos === frio.datos && antes.datos === ahora.datos;
    return [a[0], antes.ms, frio.ms, ahora.ms, iguales ? 'sí' : 'NO'];
  });
  reiniciarMemoria_(true);
  Logger.log('Acción | antes (ms) | ahora, 1ª vez (ms) | ahora, siguientes (ms) | mismos datos\n' +
    filas.map(function (f) { return f.join(' | '); }).join('\n'));
  return filas;
}

/** Texto comparable de un resultado: fechas al segundo (la API y getValues pueden diferir en milisegundos). */
function normalizar_(r) {
  return JSON.stringify(paraPantalla_(r === undefined ? null : r), function (k, v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ? v.slice(0, 19) : v;
  });
}
