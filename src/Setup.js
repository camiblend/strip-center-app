/**
 * Sub-etapa 1.0: crea (o verifica) la carpeta de Drive y el Google Sheet que usa la app.
 *
 * Se ejecuta a mano desde el editor de Apps Script: función `configurarBase`.
 * Se puede correr las veces que se quiera: nunca borra hojas, columnas ni datos.
 * Si una hoja ya existe, solo agrega las columnas que falten (al final) e informa diferencias.
 */

var NOMBRE_CARPETA = 'Strip Center - App';
var NOMBRE_SHEET = 'Base de datos';
var ZONA_HORARIA = 'America/Santiago';

var FORMATO_POR_TIPO = {
  texto: '@',
  id: '@',
  periodo: '@',
  fecha: 'yyyy-mm-dd',
  fechahora: 'yyyy-mm-dd hh:mm:ss',
  monto: '#,##0',
  decimal: '#,##0.0###',
  entero: '0',
  booleano: null, // se deja en formato general: la app escribe VERDADERO / FALSO
};

function configurarBase() {
  var props = PropertiesService.getScriptProperties();
  var informe = [];

  var carpeta = obtenerOCrearCarpeta_(props, informe);
  var ss = obtenerOCrearSheet_(props, carpeta, informe);

  ss.setSpreadsheetTimeZone(ZONA_HORARIA);
  ss.setSpreadsheetLocale('es_CL');

  ESQUEMA.forEach(function (tabla, i) {
    var hoja = ss.getSheetByName(tabla.hoja);
    if (!hoja) {
      hoja = ss.insertSheet(tabla.hoja, i);
      informe.push('Hoja creada: ' + tabla.hoja);
    }
    prepararHoja_(hoja, columnasDe(tabla), informe);
  });

  eliminarHojaInicialVacia_(ss, informe);
  sembrarSiVacia_(ss.getSheetByName('catalogos'), filasCatalogo_(), informe);
  agregarParametrosFaltantes_(ss.getSheetByName('parametros'), informe);

  informe.push('Sheet: ' + ss.getUrl());
  Logger.log(informe.join('\n'));
  return informe;
}

/** D111: el proyecto de prueba tiene la propiedad AMBIENTE = 'prueba'; el oficial no la tiene. */
function esPrueba_() {
  return PropertiesService.getScriptProperties().getProperty('AMBIENTE') === 'prueba';
}

/** D111: en prueba no se instalan activadores ni se mandan correos, aunque se ejecute la función por error. */
function noEnPrueba_(que) {
  if (esPrueba_()) throw new Error('Ambiente de prueba: no se ejecuta ' + que + ' (D111).');
}

/** Abre el Sheet de la app. Lo usarán las demás partes del código. */
function abrirBase() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Falta configurar la base: ejecuta configurarBase().');
  return SpreadsheetApp.openById(id);
}

function obtenerOCrearCarpeta_(props, informe) {
  var id = props.getProperty('FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var carpeta = DriveApp.createFolder(NOMBRE_CARPETA);
  props.setProperty('FOLDER_ID', carpeta.getId());
  informe.push('Carpeta creada: ' + carpeta.getUrl());
  return carpeta;
}

function obtenerOCrearSheet_(props, carpeta, informe) {
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create(NOMBRE_SHEET);
  DriveApp.getFileById(ss.getId()).moveTo(carpeta);
  props.setProperty('SHEET_ID', ss.getId());
  informe.push('Sheet creado: ' + NOMBRE_SHEET);
  return ss;
}

/** Escribe o completa encabezados y aplica formato por columna. */
function prepararHoja_(hoja, columnas, informe) {
  var esperadas = columnas.map(function (c) { return c[0]; });
  var ultimaCol = hoja.getLastColumn();
  var actuales = ultimaCol > 0
    ? hoja.getRange(1, 1, 1, ultimaCol).getValues()[0].map(String)
    : [];

  var plan = planEncabezados(actuales, esperadas);
  plan.distintas.forEach(function (d) {
    informe.push('⚠ ' + hoja.getName() + ': la columna ' + (d.indice + 1) + ' dice "' + d.actual +
      '" y el esquema espera "' + d.esperada + '". No se modificó.');
  });
  plan.sobrantes.forEach(function (n) {
    informe.push('⚠ ' + hoja.getName() + ': columna "' + n + '" no está en el esquema. No se modificó.');
  });
  if (plan.agregar.length) {
    hoja.getRange(1, actuales.length + 1, 1, plan.agregar.length).setValues([plan.agregar]);
    if (actuales.length) informe.push(hoja.getName() + ': columnas agregadas: ' + plan.agregar.join(', '));
  }

  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  var filas = Math.max(hoja.getMaxRows() - 1, 1);
  columnas.forEach(function (c) {
    var col = encabezados.indexOf(c[0]) + 1;
    if (col === 0) return;
    hoja.getRange(1, col).setNote(c[2] ? c[0] + ' (' + c[1] + '): ' + c[2] : c[0] + ' (' + c[1] + ')');
    var formato = FORMATO_POR_TIPO[c[1]];
    if (formato) hoja.getRange(2, col, filas, 1).setNumberFormat(formato);
  });

  hoja.getRange(1, 1, 1, encabezados.length)
    .setFontWeight('bold').setBackground('#e8eaed');
  hoja.setFrozenRows(1);
}

/**
 * Compara encabezados existentes con los del esquema (función pura, probada en tests/).
 * Devuelve qué columnas agregar al final, cuáles no calzan y cuáles sobran.
 */
function planEncabezados(actuales, esperadas) {
  var distintas = [];
  var sobrantes = [];
  actuales.forEach(function (nombre, i) {
    if (i < esperadas.length && nombre !== esperadas[i] && esperadas.indexOf(nombre) === -1) {
      distintas.push({ indice: i, actual: nombre, esperada: esperadas[i] });
    } else if (esperadas.indexOf(nombre) === -1) {
      sobrantes.push(nombre);
    }
  });
  var agregar = esperadas.filter(function (n) { return actuales.indexOf(n) === -1; });
  return { agregar: agregar, distintas: distintas, sobrantes: sobrantes };
}

function filasCatalogo_() {
  var filas = [];
  CATALOGOS_INICIALES.forEach(function (cat) {
    cat[1].forEach(function (valor, i) { filas.push([cat[0], valor, true, i + 1]); });
  });
  return filas;
}

function sembrarSiVacia_(hoja, filas, informe) {
  if (hoja.getLastRow() > 1) return;
  hoja.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
  informe.push(hoja.getName() + ': ' + filas.length + ' filas iniciales');
}

/** Agrega los parámetros nuevos del código que aún no estén en la hoja; nunca cambia los existentes. */
function agregarParametrosFaltantes_(hoja, informe) {
  var n = hoja.getLastRow() - 1;
  var existentes = n > 0 ? hoja.getRange(2, 1, n, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var faltan = PARAMETROS_INICIALES.filter(function (p) { return existentes.indexOf(p[0]) === -1; });
  if (!faltan.length) return;
  hoja.getRange(n + 2, 1, faltan.length, 3).setValues(faltan);
  CacheService.getScriptCache().remove('tabla_parametros');
  informe.push('parametros: agregados ' + faltan.map(function (p) { return p[0]; }).join(', '));
}

/** SpreadsheetApp.create deja una hoja por defecto ("Hoja 1" / "Sheet1"): se elimina si está vacía. */
function eliminarHojaInicialVacia_(ss, informe) {
  var nombres = ESQUEMA.map(function (t) { return t.hoja; });
  ss.getSheets().forEach(function (h) {
    if (nombres.indexOf(h.getName()) === -1 && h.getLastRow() === 0 && h.getLastColumn() === 0) {
      informe.push('Hoja vacía eliminada: ' + h.getName());
      ss.deleteSheet(h);
    }
  });
}
