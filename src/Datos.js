/**
 * Capa de datos: lectura y escritura genérica sobre las hojas del Sheet.
 *
 * Reglas:
 *  - Las columnas se ubican por nombre de encabezado, nunca por posición.
 *  - Toda escritura debe ocurrir dentro de conCandado_() (una a la vez), porque generar el ID
 *    siguiente y escribir la fila tienen que ser una sola operación.
 *  - registrarLog_ y siguienteId_ asumen que quien llama ya tiene el candado.
 */

var CAMPOS_SENSIBLES = ['pin_hash', 'pin_salt'];

/** Error con código, para que la pantalla pueda reaccionar (ej. volver al ingreso si expiró la sesión). */
function ErrorApp_(codigo, mensaje) {
  var e = new Error(mensaje);
  e.codigo = codigo;
  return e;
}

function conCandado_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw ErrorApp_('OCUPADO', 'Hay otra operación en curso. Intenta de nuevo en unos segundos.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- Memoria (velocidad)
//
// Cada llamada de la pantalla es una ejecución nueva de Apps Script, así que esta memoria dura solo
// lo que dura una acción: el Sheet se abre una vez y cada hoja se lee una vez. Escribir en una hoja
// borra su copia en memoria. Además, parámetros y catálogos (casi nunca cambian) se guardan
// 10 minutos en CacheService; editarlos a mano en el Sheet borra esa memoria (Trazabilidad.js).

var MEMORIA = { activa: true, ss: null, tablas: {}, encabezados: {}, escrituraPendiente: false };
var TABLAS_EN_CACHE = ['parametros', 'catalogos'];
var SEGUNDOS_CACHE_TABLAS = 600;

function abrirBaseMemoria_() {
  if (!MEMORIA.activa) return abrirBase();
  return MEMORIA.ss || (MEMORIA.ss = abrirBase());
}

/** Olvida lo leído de una tabla (en esta acción y, si corresponde, en CacheService). */
function olvidarTabla_(nombre) {
  delete MEMORIA.tablas[nombre];
  MEMORIA.escrituraPendiente = true;
  if (TABLAS_EN_CACHE.indexOf(nombre) !== -1) CacheService.getScriptCache().remove('tabla_' + nombre);
}

/** Para medir (medirVelocidad): vuelve a empezar como si fuera una acción nueva. */
function reiniciarMemoria_(activa) {
  MEMORIA.activa = activa;
  MEMORIA.ss = null; MEMORIA.tablas = {}; MEMORIA.encabezados = {}; MEMORIA.escrituraPendiente = false;
}

function hojaDe_(nombre) {
  var hoja = abrirBaseMemoria_().getSheetByName(nombre);
  if (!hoja) throw new Error('No existe la hoja ' + nombre);
  return hoja;
}

function tablaEsquema_(nombre) {
  for (var i = 0; i < ESQUEMA.length; i++) if (ESQUEMA[i].hoja === nombre) return ESQUEMA[i];
  throw new Error('La hoja ' + nombre + ' no está en el esquema');
}

/**
 * Devuelve las filas como objetos {columna: valor}, con _fila = número de fila en la hoja.
 * Entrega copias: quien llama puede modificarlas sin afectar la memoria.
 */
function leerTabla_(nombre) {
  if (!MEMORIA.activa) return leerTablaDelSheet_(nombre);
  if (!MEMORIA.tablas[nombre]) {
    var enCache = TABLAS_EN_CACHE.indexOf(nombre) !== -1;
    var guardado = enCache ? CacheService.getScriptCache().get('tabla_' + nombre) : null;
    if (guardado) {
      MEMORIA.tablas[nombre] = JSON.parse(guardado);
    } else {
      MEMORIA.tablas[nombre] = leerTablaDelSheet_(nombre);
      if (enCache) {
        try { CacheService.getScriptCache().put('tabla_' + nombre, JSON.stringify(MEMORIA.tablas[nombre]), SEGUNDOS_CACHE_TABLAS); } catch (e) { /* demasiado grande: solo memoria */ }
      }
    }
  }
  return MEMORIA.tablas[nombre].map(function (o) { return Object.assign({}, o); });
}

/**
 * Lee varias hojas en una sola consulta a la API de Sheets (servicio avanzado) y las deja en memoria.
 * Cada hoja leída por separado cuesta ~0,3 s de conexión; así se paga una sola vez.
 * Si la consulta falla, no pasa nada: leerTabla_ leerá cada hoja por su cuenta.
 */
function precargarTablas_(nombres) {
  if (!MEMORIA.activa) return;
  var cache = CacheService.getScriptCache();
  var faltan = nombres.filter(function (n, i) {
    if (nombres.indexOf(n) !== i || MEMORIA.tablas[n]) return false;
    if (TABLAS_EN_CACHE.indexOf(n) !== -1) {
      var g = cache.get('tabla_' + n);
      if (g) { MEMORIA.tablas[n] = JSON.parse(g); return false; }
    }
    return true;
  });
  if (!faltan.length) return;
  // Lo escrito con SpreadsheetApp queda en espera; la lectura por la API no lo vería sin flush
  // (al guardar una lectura, la tarjeta volvía como "falta" aunque se había guardado).
  if (MEMORIA.escrituraPendiente) { SpreadsheetApp.flush(); MEMORIA.escrituraPendiente = false; }
  try {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    var r = Sheets.Spreadsheets.Values.batchGet(id, {
      ranges: faltan.map(function (n) { return "'" + n + "'"; }),
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    r.valueRanges.forEach(function (vr, i) {
      var n = faltan[i];
      MEMORIA.tablas[n] = filasDesdeApi(n, vr.values || [], tiposDeColumnas_(n), serialAFecha);
      if (TABLAS_EN_CACHE.indexOf(n) !== -1) {
        try { cache.put('tabla_' + n, JSON.stringify(MEMORIA.tablas[n]), SEGUNDOS_CACHE_TABLAS); } catch (e2) { /* solo memoria */ }
      }
    });
  } catch (e) {
    console.warn('precargarTablas_: ' + e);
  }
}

function tiposDeColumnas_(nombre) {
  var tipos = {};
  try { columnasDe(tablaEsquema_(nombre)).forEach(function (c) { tipos[c[0]] = c[1]; }); } catch (e) { /* hoja fuera del esquema */ }
  return tipos;
}

/**
 * Función pura (probada en tests/): convierte la respuesta de la API (filas sin celdas vacías al final)
 * en los mismos objetos que entrega leerTablaDelSheet_. Las columnas de fecha llegan como número de serie.
 */
function filasDesdeApi(nombre, valores, tipos, aFecha) {
  if (!valores.length) return [];
  var encabezados = valores[0].map(String);
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    var fila = valores[i] || [];
    if (!fila.some(function (v) { return v !== '' && v !== null && v !== undefined; })) continue;
    var o = { _fila: i + 1 };
    encabezados.forEach(function (c, j) {
      var v = j < fila.length && fila[j] !== null && fila[j] !== undefined ? fila[j] : '';
      if ((tipos[c] === 'fecha' || tipos[c] === 'fechahora') && typeof v === 'number') v = aFecha(v);
      o[c] = v;
    });
    filas.push(o);
  }
  return filas;
}

/** Número de serie de Sheets → Date en la zona horaria del script (la misma del Sheet). */
function serialAFecha(serial) {
  var dias = Math.floor(serial);
  return new Date(1899, 11, 30 + dias, 0, 0, 0, Math.round((serial - dias) * 86400000));
}

function leerTablaDelSheet_(nombre) {
  var valores = hojaDe_(nombre).getDataRange().getValues();
  var encabezados = valores.shift().map(String);
  var filas = [];
  valores.forEach(function (fila, i) {
    if (!fila.some(function (v) { return v !== ''; })) return;
    var o = { _fila: i + 2 };
    encabezados.forEach(function (c, j) { o[c] = fila[j]; });
    filas.push(o);
  });
  return filas;
}

function encabezados_(hoja) {
  var nombre = hoja.getName();
  if (MEMORIA.activa && MEMORIA.encabezados[nombre]) return MEMORIA.encabezados[nombre];
  var enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  if (MEMORIA.activa) MEMORIA.encabezados[nombre] = enc;
  return enc;
}

/** Agrega una fila completando la auditoría según la clase de la tabla. */
function insertar_(nombre, obj, usuarioId) {
  var tabla = tablaEsquema_(nombre);
  var hoja = hojaDe_(nombre);
  var enc = encabezados_(hoja);
  var fila = Object.assign({}, obj);
  if (tabla.clase === 'maestro' || tabla.clase === 'transaccional') {
    fila.creado_por = usuarioId;
    fila.creado_en = new Date();
  }
  if (tabla.clase === 'transaccional' && !fila.estado) fila.estado = 'vigente';
  // setValues + formato explícito: appendRow con fechas impone el formato regional y deja
  // la columna con formatos mezclados.
  // El formato va antes que el valor: así un período '2026-10' en una columna de texto no se
  // convierte en fecha.
  var n = hoja.getLastRow() + 1;
  if (n > hoja.getMaxRows()) hoja.insertRowsAfter(hoja.getMaxRows(), 500); // la hoja se agranda de a 500 filas
  aplicarFormatosFila_(hoja, n, enc, tabla);
  hoja.getRange(n, 1, 1, enc.length).setValues([enc.map(function (c) {
    return fila[c] === undefined || fila[c] === null ? '' : fila[c];
  })]);
  olvidarTabla_(nombre);
  return fila;
}

function aplicarFormatosFila_(hoja, n, enc, tabla) {
  var tipos = {};
  columnasDe(tabla).forEach(function (c) { tipos[c[0]] = c[1]; });
  hoja.getRange(n, 1, 1, enc.length).setNumberFormats([enc.map(function (c) {
    return FORMATO_POR_TIPO[tipos[c]] || 'General';
  })]);
}

/** Actualiza campos de una fila ya leída (obj._fila). En maestros marca actualizado_por/en. No registra log. */
function actualizarFila_(nombre, obj, cambios, usuarioId) {
  var tabla = tablaEsquema_(nombre);
  var hoja = hojaDe_(nombre);
  var enc = encabezados_(hoja);
  var nuevo = Object.assign({}, obj, cambios);
  if (tabla.clase === 'maestro') {
    nuevo.actualizado_por = usuarioId;
    nuevo.actualizado_en = new Date();
  }
  aplicarFormatosFila_(hoja, obj._fila, enc, tabla);
  hoja.getRange(obj._fila, 1, 1, enc.length).setValues([enc.map(function (c) {
    return nuevo[c] === undefined || nuevo[c] === null ? '' : nuevo[c];
  })]);
  olvidarTabla_(nombre);
  return nuevo;
}

/** Copia de un objeto sin campos sensibles ni internos, apta para el log o para la pantalla. */
function sinSensibles_(obj) {
  var o = {};
  Object.keys(obj || {}).forEach(function (k) {
    if (k.charAt(0) !== '_' && CAMPOS_SENSIBLES.indexOf(k) === -1) o[k] = obj[k];
  });
  return o;
}

/** origen: 'app' (por defecto) | 'edicion_manual' | 'sistema'. */
function registrarLog_(usuarioId, accion, tabla, registroId, antes, despues, motivo, origen) {
  // Fechas en hora de Santiago y mismo formato que el Sheet (JSON.stringify las dejaría en UTC)
  var aTexto = function (v) {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'string') return v;
    var o = sinSensibles_(v);
    Object.keys(o).forEach(function (k) {
      if (esFecha_(o[k])) o[k] = Utilities.formatDate(o[k], ZONA_HORARIA, 'yyyy-MM-dd HH:mm:ss');
    });
    return JSON.stringify(o);
  };
  insertar_('log', {
    log_id: siguienteId_('log', 'log_id', 'LOG-', 6),
    timestamp: new Date(),
    usuario_id: usuarioId,
    origen: origen || 'app',
    accion: accion,
    tabla: tabla || '',
    registro_id: registroId || '',
    antes: aTexto(antes),
    despues: aTexto(despues),
    motivo: motivo || '',
  }, usuarioId);
}

function siguienteId_(nombre, campo, prefijo, ancho) {
  var hoja = hojaDe_(nombre);
  var col = encabezados_(hoja).indexOf(campo) + 1;
  var n = hoja.getLastRow() - 1;
  var ids = n > 0 ? hoja.getRange(2, col, n, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  return siguienteIdDe(ids, prefijo, ancho);
}

/** Función pura: siguiente ID con prefijo y ancho fijo, a partir de los IDs existentes. */
function siguienteIdDe(ids, prefijo, ancho) {
  var max = 0;
  ids.forEach(function (id) {
    if (id.indexOf(prefijo) !== 0) return;
    var n = parseInt(id.slice(prefijo.length), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  var s = String(max + 1);
  while (s.length < ancho) s = '0' + s;
  return prefijo + s;
}

/** Parámetros de la hoja `parametros`, con los valores iniciales como respaldo. Números ya convertidos. */
function parametros_() {
  var p = {};
  PARAMETROS_INICIALES.forEach(function (fila) { p[fila[0]] = fila[1]; });
  leerTabla_('parametros').forEach(function (f) { if (f.clave) p[f.clave] = f.valor; });
  Object.keys(p).forEach(function (k) {
    var n = Number(String(p[k]).replace(',', '.'));
    if (String(p[k]).trim() !== '' && !isNaN(n)) p[k] = n;
  });
  return p;
}

/** Convierte fechas a texto ISO para enviarlas a la pantalla (google.script.run no transporta Date). */
function paraPantalla_(v) {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(paraPantalla_);
  if (v && typeof v === 'object') {
    var o = {};
    Object.keys(v).forEach(function (k) { o[k] = paraPantalla_(v[k]); });
    return o;
  }
  return v;
}
