/**
 * Sub-etapa 1.6: registro de ediciones manuales del Sheet y protección con advertencia.
 *
 * Google solo dispara estos eventos con cambios hechos a mano en el Sheet: los que hace la app
 * (ya registrados por ella) y los hechos por programas externos vía API no los disparan.
 *
 * Se instala una vez desde el editor con `instalarTrazabilidad()`; se puede repetir sin duplicar.
 */

var DESCRIPCION_PROTECCION = 'IT-app: editar a mano queda registrado en la hoja log';
var MAX_CELDAS_REGISTRADAS = 50;

function instalarTrazabilidad() {
  noEnPrueba_('instalarTrazabilidad');
  var ss = abrirBase();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['alEditarSheet', 'alCambiarSheet'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('alEditarSheet').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('alCambiarSheet').forSpreadsheet(ss).onChange().create();
  var protegidas = 0;
  ESQUEMA.forEach(function (tabla) {
    var hoja = ss.getSheetByName(tabla.hoja);
    if (!hoja) return;
    hoja.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
      if (p.getDescription() === DESCRIPCION_PROTECCION) p.remove();
    });
    hoja.protect().setDescription(DESCRIPCION_PROTECCION).setWarningOnly(true);
    protegidas++;
  });
  Logger.log('Trazabilidad instalada: registro de ediciones y de cambios de estructura, y ' + protegidas + ' hojas con protección de advertencia.');
}

function usuarioDelEvento_(e) {
  try {
    var email = e && e.user ? e.user.getEmail() : '';
    return email || Session.getActiveUser().getEmail() || 'desconocido';
  } catch (err) {
    return 'desconocido';
  }
}

/** Disparador al editar (instalable). */
function alEditarSheet(e) {
  try {
    var rango = e.range, hoja = rango.getSheet(), nombre = hoja.getName();
    if (TABLAS_EN_CACHE.indexOf(nombre) !== -1) CacheService.getScriptCache().remove('tabla_' + nombre);
    var ultimaCol = Math.max(hoja.getLastColumn(), rango.getLastColumn());
    var enc = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0].map(String);
    var celda = nombre + '!' + rango.getA1Notation();
    var idsFilas = function () {
      var desde = Math.max(rango.getRow(), 2), hasta = rango.getLastRow();
      if (hasta < desde) return '';
      return hoja.getRange(desde, 1, hasta - desde + 1, 1).getValues().map(function (r) { return String(r[0]); })
        .filter(function (x) { return x; }).slice(0, 20).join(',');
    };
    var usuario = usuarioDelEvento_(e);
    if (rango.getNumRows() === 1 && rango.getNumColumns() === 1) {
      var columna = rango.getRow() === 1 ? '(encabezado ' + rango.getA1Notation() + ')' : (enc[rango.getColumn() - 1] || rango.getA1Notation());
      var antes = {}, despues = {};
      antes[columna] = e.oldValue === undefined ? '' : e.oldValue;
      despues[columna] = e.value === undefined ? rango.getDisplayValue() : e.value;
      conCandado_(function () {
        registrarLog_(usuario, 'edicion_manual', nombre, idsFilas(), antes, despues, 'celda ' + celda, 'edicion_manual');
      });
      return;
    }
    var n = rango.getNumRows() * rango.getNumColumns();
    var valores = n <= MAX_CELDAS_REGISTRADAS ? rango.getDisplayValues() : null;
    conCandado_(function () {
      registrarLog_(usuario, 'edicion_manual_rango', nombre, idsFilas(), '',
        { rango: rango.getA1Notation(), celdas: n, valores: valores || '(más de ' + MAX_CELDAS_REGISTRADAS + ' celdas: ver historial de versiones)' },
        'pegado o borrado de rango ' + celda + ': los valores anteriores están en el historial de versiones', 'edicion_manual');
    });
  } catch (err) {
    console.error('alEditarSheet: ' + (err.stack || err));
  }
}

/** Disparador al cambiar la estructura (instalable). Eliminar filas o columnas es alerta (T3). */
function alCambiarSheet(e) {
  try {
    var tipo = e.changeType;
    var acciones = { REMOVE_ROW: 'alerta_fila_eliminada', REMOVE_COLUMN: 'alerta_columna_eliminada', REMOVE_GRID: 'alerta_hoja_eliminada',
      INSERT_COLUMN: 'alerta_columna_insertada', INSERT_ROW: 'fila_insertada', INSERT_GRID: 'hoja_insertada' };
    if (!acciones[tipo]) return;
    var hoja = '';
    try { hoja = e.source.getActiveSheet().getName(); } catch (err) { hoja = ''; }
    TABLAS_EN_CACHE.forEach(function (t) { CacheService.getScriptCache().remove('tabla_' + t); });
    var usuario = usuarioDelEvento_(e);
    conCandado_(function () {
      registrarLog_(usuario, acciones[tipo], hoja, '', '', { cambio: tipo }, 'cambio de estructura hecho a mano en el Sheet', 'edicion_manual');
    });
  } catch (err) {
    console.error('alCambiarSheet: ' + (err.stack || err));
  }
}

// ---------------------------------------------------------------- Vista de actividad (administradora)

/** d: {desde, hasta ('yyyy-mm-dd'), persona, origen, hoja}. Devuelve hasta 500 entradas, más recientes primero. */
function actividad_(s, d) {
  precargarTablas_(['log', 'usuarios']);
  var desde = fechaDeTexto(d.desde) || new Date(hoy_().getTime() - 7 * 86400000);
  var hasta = fechaDeTexto(d.hasta) || hoy_();
  var hastaFin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() + 1);
  var nombres = { carga_inicial: 'carga inicial', sistema: 'sistema', editor: 'editor de Apps Script' };
  leerTabla_('usuarios').forEach(function (u) { nombres[u.usuario_id] = u.nombre; });
  var todas = leerTabla_('log');
  var filas = todas.filter(function (l) {
    return esFecha_(l.timestamp) && l.timestamp >= desde && l.timestamp < hastaFin &&
      (!d.persona || l.usuario_id === d.persona) && (!d.origen || origenDe_(l) === d.origen) && (!d.hoja || l.tabla === d.hoja);
  }).sort(function (a, b) { return b.timestamp - a.timestamp; });
  var hace30 = new Date(hoy_().getTime() - 30 * 86400000);
  var alertas = todas.filter(function (l) { return String(l.accion).indexOf('alerta_') === 0 && esFecha_(l.timestamp) && l.timestamp >= hace30; })
    .sort(function (a, b) { return b.timestamp - a.timestamp; });
  var formato = function (l) {
    return { log_id: l.log_id, timestamp: l.timestamp, persona: nombres[l.usuario_id] || l.usuario_id, origen: origenDe_(l),
      accion: l.accion, hoja: l.tabla, registro: l.registro_id, cambios: cambiosLegibles(l.antes, l.despues), motivo: l.motivo };
  };
  var personas = {};
  todas.forEach(function (l) { personas[l.usuario_id] = nombres[l.usuario_id] || l.usuario_id; });
  return {
    desde: textoDeFecha(desde), hasta: textoDeFecha(hasta), total: filas.length, recortado: filas.length > 500,
    filas: filas.slice(0, 500).map(formato), alertas: alertas.slice(0, 20).map(formato),
    personas: Object.keys(personas).map(function (k) { return { id: k, nombre: personas[k] }; }),
    hojas: ESQUEMA.map(function (t) { return t.hoja; }),
  };
}

/** Origen para filtrar: app, edicion_manual, sistema (revisión diaria) o carga. */
function origenDe_(l) {
  if (l.origen === 'edicion_manual') return 'edicion_manual';
  if (l.usuario_id === 'sistema') return 'sistema';
  if (l.usuario_id === 'carga_inicial' || l.usuario_id === 'editor') return 'carga';
  return 'app';
}
