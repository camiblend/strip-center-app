/**
 * Sub-etapa 1.1: escribe en el Sheet la carga semilla generada por herramientas/carga_inicial.py.
 *
 * Los datos llegan en CARGA_SEMILLA (archivo temporal CargaSemillaDatos.js, que no se versiona
 * y se borra del proyecto después de cargar). Ensayo cargado el 01-11-2026; carga definitiva y contratos terminados el 02-11-2026.
 *
 *   cargarSemilla()    carga solo si todas las hojas destino están vacías.
 *   recargarSemilla()  para la carga definitiva: vacía las hojas destino y vuelve a cargar.
 *                      Se niega si encuentra alguna fila que no venga de la carga inicial,
 *                      para no borrar nunca datos ingresados en la app. El `log` no se vacía:
 *                      se le agregan las entradas de la recarga.
 */

var USUARIO_CARGA = 'carga_inicial';

function cargarSemilla() {
  return escribirSemilla_(false);
}

function recargarSemilla() {
  return escribirSemilla_(true);
}

function escribirSemilla_(reemplazar) {
  if (typeof CARGA_SEMILLA === 'undefined') {
    throw new Error('No hay datos de carga: falta el archivo CargaSemillaDatos.js en el proyecto.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = abrirBase();
    var hojas = Object.keys(CARGA_SEMILLA);

    // 1. Validar todo antes de escribir nada
    hojas.forEach(function (nombre) {
      var hoja = ss.getSheetByName(nombre);
      if (!hoja) throw new Error('No existe la hoja "' + nombre + '". Ejecuta configurarBase().');
      var esperadas = CARGA_SEMILLA[nombre].columnas;
      var actuales = hoja.getRange(1, 1, 1, esperadas.length).getValues()[0].map(String);
      if (actuales.join('|') !== esperadas.join('|')) {
        throw new Error(nombre + ': los encabezados del Sheet no calzan con la carga.');
      }
      var filasConDatos = hoja.getLastRow() - 1;
      if (filasConDatos > 0 && nombre !== 'log') {
        if (!reemplazar) {
          throw new Error(nombre + ' ya tiene ' + filasConDatos + ' filas. Para reemplazar la carga usa recargarSemilla().');
        }
        verificarSoloCargaInicial_(hoja, nombre);
      }
    });

    // 2. Escribir
    var informe = [];
    hojas.forEach(function (nombre) {
      var hoja = ss.getSheetByName(nombre);
      var datos = CARGA_SEMILLA[nombre];
      if (nombre === 'log') {
        // El log nunca se borra: las entradas de la carga se agregan al final con IDs nuevos
        var colId = datos.columnas.indexOf('log_id'), colAccion = datos.columnas.indexOf('accion');
        var filas = datos.filas.map(function (f) {
          var copia = f.slice();
          copia[colId] = siguienteId_('log', 'log_id', 'LOG-', 6);
          if (reemplazar) copia[colAccion] = 'recarga_inicial';
          hoja.getRange(hoja.getLastRow() + 1, 1, 1, copia.length).setValues([copia]);
          return copia;
        });
        informe.push('log: ' + filas.length + ' entradas agregadas');
        return;
      }
      if (reemplazar && hoja.getLastRow() > 1) {
        hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).clearContent();
      }
      if (datos.filas.length) {
        hoja.getRange(2, 1, datos.filas.length, datos.columnas.length).setValues(datos.filas);
      }
      informe.push(nombre + ': ' + datos.filas.length + ' filas');
    });
    SpreadsheetApp.flush();
    Logger.log((reemplazar ? 'Recarga' : 'Carga') + ' semilla completada\n' + informe.join('\n'));
    return informe;
  } finally {
    lock.releaseLock();
  }
}

/** Revisa que todas las filas de la hoja tengan creado_por = carga_inicial (o usuario_id en log). */
function verificarSoloCargaInicial_(hoja, nombre) {
  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  var col = encabezados.indexOf(nombre === 'log' ? 'usuario_id' : 'creado_por');
  if (col === -1) throw new Error(nombre + ': no se puede verificar el origen de las filas.');
  var valores = hoja.getRange(2, col + 1, hoja.getLastRow() - 1, 1).getValues();
  valores.forEach(function (v, i) {
    if (v[0] !== USUARIO_CARGA) {
      throw new Error(nombre + ', fila ' + (i + 2) + ': no viene de la carga inicial ("' + v[0] +
        '"). No se reemplaza nada.');
    }
  });
}

/**
 * Z6: agrega contratos terminados recientes (datos en CargaTerminadosDatos.js, temporal).
 * Solo agrega: reutiliza locatarios con el mismo RUT, salta contratos que ya existen (misma unidad
 * e inicio) o que se cruzan con otro, y asigna IDs nuevos. Se puede ejecutar más de una vez.
 */
function agregarContratosTerminados() {
  if (typeof CARGA_TERMINADOS === 'undefined') throw new Error('Falta el archivo CargaTerminadosDatos.js en el proyecto.');
  var informe = conCandado_(function () {
    var r = [];
    var locPorRut = {};
    leerTabla_('locatarios').forEach(function (l) { locPorRut[l.rut] = l.locatario_id; });
    CARGA_TERMINADOS.locatarios.forEach(function (l) {
      if (locPorRut[l.rut]) return;
      var id = siguienteId_('locatarios', 'locatario_id', 'LOC-', 4);
      insertar_('locatarios', { locatario_id: id, rut: l.rut, razon_social: l.razon_social, nombre_contacto: l.nombre_contacto,
        correo: l.correo, notas: 'agregado con contratos terminados (Z6)' }, USUARIO_CARGA);
      locPorRut[l.rut] = id;
      r.push('Locatario nuevo ' + id + ': ' + l.razon_social);
    });
    CARGA_TERMINADOS.contratos.forEach(function (c) {
      var contratos = leerContratos_();
      var inicio = fechaDeTexto(c.fecha_inicio), fin = fechaDeTexto(c.fecha_fin);
      var existe = contratos.some(function (x) { return x.unidad_id === c.unidad_id && x.estado !== 'anulado' && textoDeFecha(x.fecha_inicio) === c.fecha_inicio; });
      if (existe) { r.push(c.unidad_id + ' desde ' + c.fecha_inicio + ': ya existe, se omite.'); return; }
      var choque = buscarTraslape({ contrato_id: null, unidad_id: c.unidad_id, fecha_inicio: inicio, fecha_fin: fin }, contratos);
      if (choque) { r.push(c.unidad_id + ' desde ' + c.fecha_inicio + ': se cruza con ' + choque.contrato_id + ', se omite.'); return; }
      var id = siguienteId_('contratos', 'contrato_id', 'CON-', 4);
      insertar_('contratos', { contrato_id: id, unidad_id: c.unidad_id, locatario_id: locPorRut[c.locatario_clave],
        fecha_inicio: inicio, fecha_fin: fin, estado: estadoContrato({ fecha_inicio: inicio, fecha_fin: fin }, hoy_()),
        paga_gc: true, notas: c.notas }, USUARIO_CARGA);
      if (c.tramo_monto) {
        insertar_('contrato_arriendos', { tramo_id: siguienteId_('contrato_arriendos', 'tramo_id', 'TRA-', 6), contrato_id: id,
          desde_periodo: c.tramo_desde, monto: c.tramo_monto, motivo: 'Inicial', comentario: 'carga de contratos terminados' }, USUARIO_CARGA);
      }
      r.push('Contrato ' + id + ': ' + c.unidad_id + ' ' + c.fecha_inicio + ' a ' + c.fecha_fin + (c.tramo_monto ? '' : ' (sin arriendo)'));
    });
    registrarLog_(USUARIO_CARGA, 'agregar_contratos_terminados', 'contratos', '', '', { resultado: r }, 'Z6: contratos terminados en los últimos 12 meses');
    return r;
  });
  Logger.log(informe.join('\n'));
  return informe;
}
