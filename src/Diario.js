/**
 * Revisión automática diaria (C1, C3), de madrugada:
 *  1. Actualiza la columna `estado` de los contratos que empezaron o terminaron por fecha,
 *     para que el Sheet filtrado por estado muestre la realidad.
 *  2. Si hoy algún contrato cumple año, envía un correo a la administradora (dueña del script),
 *     para revisar si corresponde renovarlo (2.1: con la UF ya no hay reajuste que cargar).
 *  3. Revisa la integridad del Sheet y avisa por correo si hay problemas o filas eliminadas a mano (1.6).
 *
 * Se instala una sola vez desde el editor: función `instalarRevisionDiaria`.
 */

var USUARIO_SISTEMA = 'sistema';
// D102: enlace oficial de la app. La dirección automática de Google (getService().getUrl())
// es otra cuando corre desde un activador. Reemplazar por el /exec de la publicación propia.
var URL_APP = 'https://script.google.com/macros/s/<ID_DE_LA_PUBLICACION>/exec';

function instalarRevisionDiaria() {
  noEnPrueba_('instalarRevisionDiaria');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisionDiaria') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisionDiaria').timeBased().atHour(3).everyDays(1).inTimezone(ZONA_HORARIA).create();
  var r = revisionDiaria();
  Logger.log('Revisión diaria instalada (todos los días cerca de las 03:00).\nPrimera ejecución: ' + JSON.stringify(r));
}

function revisionDiaria() {
  noEnPrueba_('revisionDiaria'); // manda correos (D111)
  var hoy = hoy_();
  var resultado = conCandado_(function () {
    var cambios = 0;
    leerContratos_().forEach(function (c) {
      var nuevo = estadoContrato(c, hoy);
      if (nuevo === c.estado) return;
      actualizarFila_('contratos', c, { estado: nuevo }, USUARIO_SISTEMA);
      registrarLog_(USUARIO_SISTEMA, 'estado_contrato', 'contratos', c.contrato_id, { estado: c.estado }, { estado: nuevo },
        'revisión diaria por fechas');
      cambios++;
    });
    return { estadosActualizados: cambios };
  });
  resultado.correo = avisarAniversarios_(hoy);
  resultado.integridad = revisarYAvisarIntegridad_(hoy);
  return resultado;
}

/** T4: revisión de integridad + alertas de estructura del último día. Correo solo si hay algo. */
function revisarYAvisarIntegridad_(hoy) {
  var problemas = revisarIntegridad_();
  var ayer = new Date(hoy.getTime() - 86400000);
  var alertas = alertasEstructuraDesde_(ayer).map(function (l) {
    return Utilities.formatDate(l.timestamp, ZONA_HORARIA, 'dd-MM HH:mm') + ' · ' + l.tabla + ' · ' + String(l.accion).replace('alerta_', '').replace(/_/g, ' ') +
      ' · ' + l.usuario_id;
  });
  if (!problemas.length && !alertas.length) return 'sin problemas';
  conCandado_(function () {
    if (problemas.length) {
      registrarLog_(USUARIO_SISTEMA, 'alerta_integridad', '', '', '', { problemas: problemas.slice(0, 30) }, 'revisión diaria de integridad');
    }
  });
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Revisión del Sheet: ' + (problemas.length + alertas.length) + ' asunto(s) por revisar',
    (problemas.length ? 'Problemas de integridad:\n• ' + problemas.join('\n• ') + '\n\n' : '') +
    (alertas.length ? 'Cambios de estructura hechos a mano en las últimas 24 horas:\n• ' + alertas.join('\n• ') + '\n\n' : '') +
    'Puedes ver el detalle en la app (Administración → Actividad); los datos se recuperan desde el historial de versiones del Sheet.\nApp: ' +
    URL_APP + '\n\nCorreo automático de la app de Strip Center.');
  return 'correo con ' + problemas.length + ' problema(s) y ' + alertas.length + ' alerta(s)';
}

function avisarAniversarios_(hoy) {
  var contratos = aniversariosDeHoy(leerContratos_(), hoy);
  if (!contratos.length) return 'sin aniversarios hoy';
  var unidades = {}, locatarios = {};
  leerTabla_('unidades').forEach(function (u) { unidades[u.unidad_id] = u.nombre; });
  leerTabla_('locatarios').forEach(function (l) { locatarios[l.locatario_id] = l.razon_social; });
  var tramos = agruparPor_(leerTramos_(), 'contrato_id');
  var lineas = contratos.map(function (c) {
    var t = tramoVigente(tramos[c.contrato_id] || [], periodoDe(hoy));
    var arriendo = !t ? '—' : t.moneda === 'UF' ? String(t.monto).replace('.', ',') + ' UF'
      : '$' + Utilities.formatString('%,d', Math.round(t.monto)).replace(/,/g, '.');
    return '• ' + unidades[c.unidad_id] + ' · ' + locatarios[c.locatario_id] + ' · arriendo actual ' + arriendo;
  });
  var destino = Session.getEffectiveUser().getEmail();
  // 2.1: con el arriendo en UF ya no hay reajuste que cargar; el aniversario sirve para revisar la renovación
  MailApp.sendEmail(destino, 'Aniversario de contrato (' + contratos.length + ')',
    'Hoy cumple año ' + (contratos.length === 1 ? 'este contrato' : 'estos contratos') + ':\n\n' + lineas.join('\n') +
    '\n\nSi corresponde renovarlo o cambiar el arriendo, hazlo en la app (Unidades y contratos → Cambiar arriendo):\n' +
    URL_APP + '\n\nCorreo automático de la app de Strip Center.');
  conCandado_(function () {
    registrarLog_(USUARIO_SISTEMA, 'correo_reajuste', 'contratos', contratos.map(function (c) { return c.contrato_id; }).join(','),
      '', '', 'aviso de aniversario a ' + destino);
  });
  return 'correo enviado: ' + contratos.length;
}
