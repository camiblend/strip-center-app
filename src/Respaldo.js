/**
 * Z2: respaldo semanal del Sheet en la carpeta "Respaldos" (dentro de la carpeta de la app).
 * Conserva las últimas 8 copias; las más antiguas van a la papelera de Drive (recuperables por 30 días).
 *
 * Se instala una vez desde el editor: `instalarRespaldoSemanal` (domingos cerca de las 04:00).
 */

var NOMBRE_CARPETA_RESPALDOS = 'Respaldos';
var RESPALDOS_A_CONSERVAR = 8;

function instalarRespaldoSemanal() {
  noEnPrueba_('instalarRespaldoSemanal');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'respaldoSemanal') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('respaldoSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).inTimezone(ZONA_HORARIA).create();
  var r = respaldoSemanal();
  Logger.log('Respaldo semanal instalado (domingos cerca de las 04:00). Primera copia: ' + r);
}

function carpetaRespaldos_() {
  var app = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  var it = app.getFoldersByName(NOMBRE_CARPETA_RESPALDOS);
  return it.hasNext() ? it.next() : app.createFolder(NOMBRE_CARPETA_RESPALDOS);
}

function respaldoSemanal() {
  noEnPrueba_('respaldoSemanal');
  var carpeta = carpetaRespaldos_();
  var original = DriveApp.getFileById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var nombre = NOMBRE_SHEET + ' · respaldo ' + Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd HH.mm');
  var copia = original.makeCopy(nombre, carpeta);

  var copias = [];
  var it = carpeta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf(NOMBRE_SHEET + ' · respaldo ') === 0) copias.push(f);
  }
  copias.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  var eliminadas = copias.slice(RESPALDOS_A_CONSERVAR);
  eliminadas.forEach(function (f) { f.setTrashed(true); });

  conCandado_(function () {
    registrarLog_(USUARIO_SISTEMA, 'respaldo_semanal', '', copia.getId(), '',
      { copia: nombre, a_papelera: eliminadas.length }, 'respaldo automático del Sheet');
  });
  return nombre + (eliminadas.length ? ' (' + eliminadas.length + ' copia(s) antigua(s) a la papelera)' : '');
}
