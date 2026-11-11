/**
 * Sub-etapa 2.1: valor de la UF (D106, D108).
 * La boleta de un mes usa la UF del último día de ese mes. El valor se toma de la CMF (clave en la propiedad
 * CMF_API_KEY, que pega Camila en el editor; nunca en el código) y se guarda en `valores_uf` para que la
 * boleta se pueda reproducir. Si la CMF falla, la administradora lo ingresa a mano con motivo.
 */

var URL_CMF_UF = 'https://api.cmfchile.cl/api-sbifv3/recursos_api/uf/';
var SEGUNDOS_ESPERA_CMF = 3600; // tras una falla, no se vuelve a preguntar a la CMF por esa fecha durante una hora

/** Período desde el que rigen las reglas de 2.1 (D112). Acepta que el Sheet lo haya convertido en fecha. */
function periodoReglas21_() {
  var v = parametros_().periodo_reglas_2_1;
  if (esFecha_(v)) return periodoDe(v);
  return /^\d{4}-\d{2}$/.test(String(v)) ? String(v) : '2026-11';
}

function leerValoresUf_() {
  return leerTabla_('valores_uf').map(function (v) { v.fecha = fechaOVacio_(v.fecha); return v; });
}

/**
 * UF de una fecha: la guardada o, si no hay, la de la CMF (y se guarda). null si no se pudo.
 * Debe llamarse fuera de conCandado_: toma el candado solo para guardar.
 */
function ufParaFecha_(fecha) {
  var guardada = ufDeFecha(leerValoresUf_(), fecha);
  if (guardada) return { fecha: fecha, valor: Number(guardada.valor), fuente: guardada.fuente };
  var deCmf = consultarCmf_(fecha);
  if (!deCmf) return null;
  return conCandado_(function () {
    var otra = ufDeFecha(leerValoresUf_(), fecha); // otra persona pudo guardarla mientras tanto
    if (otra) return { fecha: fecha, valor: Number(otra.valor), fuente: otra.fuente };
    var id = siguienteId_('valores_uf', 'uf_id', 'UF-', 6);
    insertar_('valores_uf', { uf_id: id, fecha: fecha, valor: deCmf.valor, fuente: 'cmf', motivo: '' }, USUARIO_SISTEMA);
    registrarLog_(USUARIO_SISTEMA, 'uf_cmf', 'valores_uf', id, '', { fecha: fecha, valor: deCmf.valor }, 'valor tomado de la CMF');
    return { fecha: fecha, valor: deCmf.valor, fuente: 'cmf' };
  });
}

/** Pregunta a la CMF. Sin clave, con error o sin dato publicado devuelve null (y espera una hora antes de reintentar). */
function consultarCmf_(fecha) {
  var clave = PropertiesService.getScriptProperties().getProperty('CMF_API_KEY');
  if (!clave) return null;
  var cache = CacheService.getScriptCache();
  var marca = 'cmf_falla_' + textoDeFecha(fecha);
  if (cache.get(marca)) return null;
  try {
    var url = URL_CMF_UF + fecha.getFullYear() + '/' + (fecha.getMonth() + 1) + '/dias/' + fecha.getDate() +
      '?formato=json&apikey=' + encodeURIComponent(clave);
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var u = r.getResponseCode() === 200 ? ufDesdeRespuestaCmf(JSON.parse(r.getContentText())) : null;
    if (u && u.fecha === textoDeFecha(fecha)) return u;
    console.warn('CMF sin UF para ' + textoDeFecha(fecha) + ': HTTP ' + r.getResponseCode());
  } catch (e) {
    console.warn('CMF: ' + e);
  }
  cache.put(marca, '1', SEGUNDOS_ESPERA_CMF);
  return null;
}

/** Solo la administradora: ingresa (o corrige) la UF de una fecha, con motivo. La anterior queda anulada. */
function guardarUfManual_(s, d) {
  var fecha = fechaDeTexto(d.fecha);
  if (!fecha) throw ErrorApp_('DATOS', 'Elige la fecha de la UF.');
  var valor = numeroIngresado_(d.valor, 'El valor de la UF');
  var motivo = String(d.motivo || '').trim();
  var error = validarUfManual(valor, motivo);
  if (error) throw ErrorApp_('DATOS', error);
  return conCandado_(function () {
    var anterior = ufDeFecha(leerValoresUf_(), fecha);
    if (anterior) anularRegistro_('valores_uf', anterior, s.u, 'reemplazada: ' + motivo);
    var id = siguienteId_('valores_uf', 'uf_id', 'UF-', 6);
    insertar_('valores_uf', { uf_id: id, fecha: fecha, valor: valor, fuente: 'manual', motivo: motivo,
      reemplaza_a: anterior ? anterior.uf_id : '' }, s.u);
    registrarLog_(s.u, 'uf_manual', 'valores_uf', id, anterior ? { valor: anterior.valor, fuente: anterior.fuente } : '',
      { fecha: fecha, valor: valor }, motivo);
    return { uf_id: id, valor: valor };
  });
}

/**
 * Aviso de Inicio: la UF que necesita el período en curso, si ya rigen las reglas de 2.1.
 * No avisa antes del día 10 del mes: la CMF publica el 9 los valores hasta el 9 del mes siguiente.
 */
function ufPendienteInicio_(periodoEnCurso, hoy) {
  if (!periodoEnCurso || periodoEnCurso < periodoReglas21_()) return null;
  var fecha = ultimoDiaDelPeriodo(periodoEnCurso);
  var u = ufParaFecha_(fecha);
  if (u) return { fecha: textoDeFecha(fecha), estado: 'ok', valor: u.valor, fuente: u.fuente };
  var publicada = new Date(fecha.getFullYear(), fecha.getMonth(), 10);
  return { fecha: textoDeFecha(fecha), estado: hoy >= publicada ? 'falta' : 'no_publicada' };
}

/**
 * Diagnóstico desde el editor: pregunta a la CMF por la UF del último día del mes en curso y muestra qué respondió.
 * No guarda nada ni muestra la clave. Borra la espera de una hora tras una falla, para reintentar de inmediato.
 */
function probarCmf() {
  var clave = PropertiesService.getScriptProperties().getProperty('CMF_API_KEY');
  Logger.log('Clave CMF_API_KEY: ' + (clave ? 'sí está (' + clave.length + ' caracteres, ' + (clave.trim() === clave ? 'sin espacios en los bordes' : 'CON ESPACIOS en los bordes') + ')' : 'NO está'));
  if (!clave) return;
  var fecha = ultimoDiaDelPeriodo(periodoDe(new Date()));
  CacheService.getScriptCache().remove('cmf_falla_' + textoDeFecha(fecha));
  var url = URL_CMF_UF + fecha.getFullYear() + '/' + (fecha.getMonth() + 1) + '/dias/' + fecha.getDate() + '?formato=json&apikey=';
  var r = UrlFetchApp.fetch(url + encodeURIComponent(clave.trim()), { muteHttpExceptions: true });
  Logger.log('Fecha consultada: ' + textoDeFecha(fecha) + ' · respuesta HTTP ' + r.getResponseCode());
  Logger.log('Contenido: ' + r.getContentText().slice(0, 500));
}
