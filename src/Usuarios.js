/**
 * Usuarios: ingreso con PIN, cambio y reseteo de PIN, y administración.
 * Las funciones con _ final no se pueden llamar desde el navegador; la pantalla entra por Web.js.
 */

var ROLES = ['administradora', 'digitadora', 'solo_lectura'];

function buscarUsuario_(usuarioId) {
  var lista = leerTabla_('usuarios');
  for (var i = 0; i < lista.length; i++) if (lista[i].usuario_id === usuarioId) return lista[i];
  return null;
}

/** Lista para la pantalla de ingreso: solo nombre e ID de las personas activas. */
function listarUsuariosIngreso_() {
  return leerTabla_('usuarios')
    .filter(function (u) { return u.activo === true; })
    .map(function (u) { return { id: u.usuario_id, nombre: u.nombre }; })
    .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
}

function ingresar_(usuarioId, pin) {
  return conCandado_(function () {
    var u = buscarUsuario_(usuarioId);
    if (!u || u.activo !== true) throw ErrorApp_('CREDENCIALES', 'Usuario o PIN incorrecto.');
    var ahora = new Date();
    if (estaBloqueado(u.bloqueado_hasta, ahora)) throw errorBloqueo_(u.bloqueado_hasta);

    if (!verificarPin(pin, u.pin_hash, u.pin_salt, digestHexGas_)) {
      var p = parametros_();
      var r = resultadoFallo(u.intentos_fallidos, u.bloqueado_hasta, ahora, p.pin_intentos_max, p.pin_bloqueo_minutos);
      actualizarFila_('usuarios', u, { intentos_fallidos: r.intentos, bloqueado_hasta: r.bloqueado_hasta }, usuarioId);
      registrarLog_(usuarioId, 'login_fallido', 'usuarios', usuarioId);
      if (r.bloqueado) {
        registrarLog_(usuarioId, 'bloqueo', 'usuarios', usuarioId, '', '', p.pin_intentos_max + ' intentos fallidos');
        throw errorBloqueo_(r.bloqueado_hasta);
      }
      throw ErrorApp_('CREDENCIALES', 'PIN incorrecto. ' + (r.restantes === 1
        ? 'Te queda 1 intento antes del bloqueo.'
        : 'Te quedan ' + r.restantes + ' intentos antes del bloqueo.'));
    }

    if (u.intentos_fallidos || u.bloqueado_hasta) {
      u = actualizarFila_('usuarios', u, { intentos_fallidos: 0, bloqueado_hasta: '' }, usuarioId);
    }
    registrarLog_(usuarioId, 'login', 'usuarios', usuarioId);
    return {
      token: crearSesion_(u), nombre: u.nombre, rol: u.rol,
      debeCambiarPin: u.debe_cambiar_pin === true,
    };
  });
}

function errorBloqueo_(hasta) {
  var hora = Utilities.formatDate(hasta, ZONA_HORARIA, 'HH:mm');
  return ErrorApp_('BLOQUEADO', 'Usuario bloqueado por intentos fallidos hasta las ' + hora +
    '. La administradora puede desbloquearte antes.');
}

function salir_(s) {
  conCandado_(function () { registrarLog_(s.u, 'logout', 'usuarios', s.u); });
  cerrarSesion_(s.token);
}

function cambiarMiPin_(s, actual, nuevo) {
  var p = parametros_();
  var error = validarPinNuevo(nuevo, p.pin_largo);
  if (error) throw ErrorApp_('PIN_INVALIDO', error);
  if (String(nuevo) === String(actual)) throw ErrorApp_('PIN_INVALIDO', 'El PIN nuevo debe ser distinto del actual.');
  conCandado_(function () {
    var u = buscarUsuario_(s.u);
    if (!verificarPin(actual, u.pin_hash, u.pin_salt, digestHexGas_)) {
      registrarLog_(s.u, 'cambio_pin_fallido', 'usuarios', s.u);
      throw ErrorApp_('CREDENCIALES', 'El PIN actual no es correcto.');
    }
    var sal = nuevaSal_();
    actualizarFila_('usuarios', u, {
      pin_hash: hashPin(String(nuevo), sal, PIN_ITERACIONES, digestHexGas_), pin_salt: sal,
      debe_cambiar_pin: false, pin_cambiado_en: new Date(),
    }, s.u);
    registrarLog_(s.u, 'cambio_pin', 'usuarios', s.u);
  });
  s.cp = false;
  var token = s.token;
  delete s.token;
  guardarSesion_(token, s);
}

// ---------------------------------------------------------------- Administración

function listarUsuarios_() {
  precargarTablas_(['log', 'usuarios']);
  var ultimo = {};
  leerTabla_('log').forEach(function (l) {
    if (l.accion === 'login' && (!ultimo[l.usuario_id] || l.timestamp > ultimo[l.usuario_id])) ultimo[l.usuario_id] = l.timestamp;
  });
  var ahora = new Date();
  return leerTabla_('usuarios').map(function (u) {
    return {
      id: u.usuario_id, nombre: u.nombre, rol: u.rol, activo: u.activo === true,
      bloqueadoHasta: estaBloqueado(u.bloqueado_hasta, ahora) ? u.bloqueado_hasta : null,
      debeCambiarPin: u.debe_cambiar_pin === true, ultimoIngreso: ultimo[u.usuario_id] || null,
    };
  });
}

function validarNombre_(nombre, idExcluido) {
  nombre = String(nombre || '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 2) throw ErrorApp_('DATOS', 'Escribe un nombre.');
  var repetido = leerTabla_('usuarios').some(function (u) {
    return u.usuario_id !== idExcluido && String(u.nombre).toLowerCase() === nombre.toLowerCase();
  });
  if (repetido) throw ErrorApp_('DATOS', 'Ya existe un usuario con ese nombre.');
  return nombre;
}

function crearUsuario_(s, nombre, rol) {
  if (ROLES.indexOf(rol) === -1) throw ErrorApp_('DATOS', 'Rol no válido.');
  return conCandado_(function () {
    nombre = validarNombre_(nombre, null);
    var pin = generarPinTemporal(parametros_().pin_largo, digitoAleatorio_);
    var sal = nuevaSal_();
    var u = insertar_('usuarios', {
      usuario_id: siguienteId_('usuarios', 'usuario_id', 'USR-', 2), nombre: nombre, rol: rol, activo: true,
      pin_hash: hashPin(pin, sal, PIN_ITERACIONES, digestHexGas_), pin_salt: sal,
      intentos_fallidos: 0, debe_cambiar_pin: true,
    }, s.u);
    registrarLog_(s.u, 'crear_usuario', 'usuarios', u.usuario_id, '', u);
    return { id: u.usuario_id, nombre: nombre, pinTemporal: pin };
  });
}

function resetearPin_(s, usuarioId) {
  return conCandado_(function () {
    var u = buscarUsuario_(usuarioId);
    if (!u) throw ErrorApp_('DATOS', 'Usuario no encontrado.');
    var pin = generarPinTemporal(parametros_().pin_largo, digitoAleatorio_);
    var sal = nuevaSal_();
    actualizarFila_('usuarios', u, {
      pin_hash: hashPin(pin, sal, PIN_ITERACIONES, digestHexGas_), pin_salt: sal,
      debe_cambiar_pin: true, intentos_fallidos: 0, bloqueado_hasta: '',
    }, s.u);
    revocarSesiones_(usuarioId);
    registrarLog_(s.u, 'reset_pin', 'usuarios', usuarioId);
    return { id: usuarioId, nombre: u.nombre, pinTemporal: pin };
  });
}

function desbloquear_(s, usuarioId) {
  conCandado_(function () {
    var u = buscarUsuario_(usuarioId);
    if (!u) throw ErrorApp_('DATOS', 'Usuario no encontrado.');
    actualizarFila_('usuarios', u, { intentos_fallidos: 0, bloqueado_hasta: '' }, s.u);
    registrarLog_(s.u, 'desbloqueo', 'usuarios', usuarioId);
  });
}

/** cambios: {nombre?, rol?, activo?}. Siempre debe quedar al menos una administradora activa. */
function editarUsuario_(s, usuarioId, cambios) {
  conCandado_(function () {
    var u = buscarUsuario_(usuarioId);
    if (!u) throw ErrorApp_('DATOS', 'Usuario no encontrado.');
    var nuevo = {};
    if (cambios.nombre !== undefined) nuevo.nombre = validarNombre_(cambios.nombre, usuarioId);
    if (cambios.rol !== undefined) {
      if (ROLES.indexOf(cambios.rol) === -1) throw ErrorApp_('DATOS', 'Rol no válido.');
      nuevo.rol = cambios.rol;
    }
    if (cambios.activo !== undefined) nuevo.activo = cambios.activo === true;

    var quedaAdmin = leerTabla_('usuarios').some(function (x) {
      var f = x.usuario_id === usuarioId ? Object.assign({}, x, nuevo) : x;
      return f.activo === true && f.rol === 'administradora';
    });
    if (!quedaAdmin) throw ErrorApp_('DATOS', 'Debe quedar al menos una administradora activa.');

    var antes = {};
    Object.keys(nuevo).forEach(function (k) { antes[k] = u[k]; });
    actualizarFila_('usuarios', u, nuevo, s.u);
    if (nuevo.rol !== undefined && nuevo.rol !== u.rol || nuevo.activo === false) revocarSesiones_(usuarioId);
    var accion = nuevo.activo === false && u.activo === true ? 'desactivar_usuario' : 'editar_usuario';
    registrarLog_(s.u, accion, 'usuarios', usuarioId, antes, nuevo);
  });
}

/**
 * Se ejecuta UNA vez desde el editor de Apps Script para crear la primera administradora.
 * El PIN temporal aparece en el registro de ejecución. El nombre se puede cambiar luego en Usuarios.
 */
function crearPrimeraAdministradora() {
  var r = conCandado_(function () {
    var hayAdmin = leerTabla_('usuarios').some(function (u) { return u.activo === true && u.rol === 'administradora'; });
    if (hayAdmin) throw new Error('Ya existe una administradora activa. Usa la pantalla Usuarios de la app.');
    var pin = generarPinTemporal(parametros_().pin_largo, digitoAleatorio_);
    var sal = nuevaSal_();
    var u = insertar_('usuarios', {
      usuario_id: siguienteId_('usuarios', 'usuario_id', 'USR-', 2), nombre: 'Administradora',
      rol: 'administradora', activo: true, pin_hash: hashPin(pin, sal, PIN_ITERACIONES, digestHexGas_),
      pin_salt: sal, intentos_fallidos: 0, debe_cambiar_pin: true,
    }, 'editor');
    registrarLog_('editor', 'crear_usuario', 'usuarios', u.usuario_id, '', u, 'Primera administradora');
    return pin;
  });
  Logger.log('Usuario "Administradora" creado. PIN temporal: ' + r +
    '\nAl ingresar se te pedirá crear tu propio PIN. Puedes cambiar el nombre en Usuarios.');
}
