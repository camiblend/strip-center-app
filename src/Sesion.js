/**
 * Sesiones: al ingresar, el servidor entrega un pase aleatorio y guarda en su memoria temporal
 * (CacheService) quién es su dueña. Cada llamada de la pantalla trae el pase; el servidor nunca
 * confía en un nombre o rol enviado por el navegador.
 *
 * Una sesión termina si: pasan `sesion_horas` desde el ingreso, pasan `sesion_inactividad_minutos`
 * sin actividad, la persona sale, o la administradora desactiva / cambia el rol / resetea el PIN
 * de esa persona (se invalida subiendo su "versión" en ScriptProperties).
 */

var CACHE_MAX_SEGUNDOS = 21600; // máximo que permite CacheService (6 horas)

function crearSesion_(usuario) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var ahora = Date.now();
  var s = {
    u: usuario.usuario_id, n: usuario.nombre, r: usuario.rol,
    v: versionUsuario_(usuario.usuario_id), c: ahora, a: ahora,
    cp: usuario.debe_cambiar_pin === true,
  };
  guardarSesion_(token, s);
  return token;
}

function guardarSesion_(token, s) {
  CacheService.getScriptCache().put('ses_' + token, JSON.stringify(s), CACHE_MAX_SEGUNDOS);
}

function obtenerSesion_(token) {
  if (!token) throw ErrorApp_('SIN_SESION', 'Ingresa con tu nombre y PIN.');
  var cache = CacheService.getScriptCache();
  var crudo = cache.get('ses_' + token);
  if (!crudo) throw ErrorApp_('SESION_EXPIRADA', 'Tu sesión terminó. Vuelve a ingresar.');
  var s = JSON.parse(crudo);
  var p = parametros_();
  var estado = estadoSesion(s, Date.now(), p.sesion_horas, p.sesion_inactividad_minutos, versionUsuario_(s.u));
  if (estado !== 'ok') {
    cache.remove('ses_' + token);
    throw ErrorApp_('SESION_EXPIRADA', estado === 'inactiva'
      ? 'Tu sesión se cerró por inactividad. Vuelve a ingresar.'
      : 'Tu sesión terminó. Vuelve a ingresar.');
  }
  s.a = Date.now();
  guardarSesion_(token, s);
  s.token = token;
  return s;
}

/** Función pura: 'ok' | 'expirada' | 'inactiva' | 'revocada'. */
function estadoSesion(s, ahoraMs, horas, minutosInactividad, versionActual) {
  if (s.v !== versionActual) return 'revocada';
  if (ahoraMs - s.c > horas * 3600000) return 'expirada';
  if (minutosInactividad > 0 && ahoraMs - s.a > minutosInactividad * 60000) return 'inactiva';
  return 'ok';
}

function cerrarSesion_(token) {
  CacheService.getScriptCache().remove('ses_' + token);
}

function versionUsuario_(usuarioId) {
  return Number(PropertiesService.getScriptProperties().getProperty('ver_' + usuarioId) || 0);
}

/** Invalida todas las sesiones abiertas de una persona. */
function revocarSesiones_(usuarioId) {
  PropertiesService.getScriptProperties().setProperty('ver_' + usuarioId, String(versionUsuario_(usuarioId) + 1));
}

function requerirAdministradora_(s) {
  if (s.r !== 'administradora') throw ErrorApp_('SIN_PERMISO', 'Solo la administradora puede hacer esto.');
}
