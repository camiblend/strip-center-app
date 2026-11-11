/**
 * Entrada de la app web. La pantalla llama a una sola función, `llamar(accion, token, datos)`,
 * que valida la sesión y el rol antes de ejecutar cada acción.
 */

function doGet() {
  var t = HtmlService.createTemplateFromFile('ui/Index');
  t.prueba = esPrueba_(); // D111: franja "AMBIENTE DE PRUEBA"
  return t.evaluate()
    .setTitle((t.prueba ? 'PRUEBA · ' : '') + 'Strip Center')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function incluir_(archivo) {
  return HtmlService.createHtmlOutputFromFile(archivo).getContent();
}

/**
 * publica: no requiere sesión · admin: solo administradora · conPinTemporal: permitida aunque
 * la persona aún no haya creado su PIN (todo lo demás exige crearlo primero).
 */
// lectura: true = solo consulta datos; es lo único que puede pedir el rol solo_lectura (D91),
// además de salir y cambiar su PIN (conPinTemporal).
var ACCIONES = {
  usuariosIngreso: { publica: true, fn: function () { return listarUsuariosIngreso_(); } },
  ingresar: { publica: true, fn: function (s, d) { return ingresar_(d.usuarioId, d.pin); } },
  salir: { conPinTemporal: true, fn: function (s) { salir_(s); } },
  cambiarMiPin: { conPinTemporal: true, fn: function (s, d) { cambiarMiPin_(s, d.actual, d.nuevo); } },
  inicio: { lectura: true, fn: function (s) { return inicio_(s); } },
  usuarios: { admin: true, fn: function () { return listarUsuarios_(); } },
  crearUsuario: { admin: true, fn: function (s, d) { return crearUsuario_(s, d.nombre, d.rol); } },
  resetearPin: { admin: true, fn: function (s, d) { return resetearPin_(s, d.id); } },
  desbloquear: { admin: true, fn: function (s, d) { desbloquear_(s, d.id); } },
  editarUsuario: { admin: true, fn: function (s, d) { editarUsuario_(s, d.id, d.cambios || {}); } },
  // 1.3 Maestros
  maestros: { lectura: true, fn: function (s) { return maestros_(s); } },
  guardarLocatario: { fn: function (s, d) { return guardarLocatario_(s, d); } },
  previsualizarContrato: { fn: function (s, d) { return previsualizarContrato_(s, d); } },
  crearContrato: { fn: function (s, d) { return crearContrato_(s, d); } },
  editarContrato: { fn: function (s, d) { return editarContrato_(s, d, 'editar_contrato'); } },
  terminarContrato: {
    fn: function (s, d) { return editarContrato_(s, { contrato_id: d.contrato_id, cambios: { fecha_fin: d.fecha_fin }, motivo: d.motivo }, 'terminar_contrato'); },
  },
  anularContrato: { admin: true, fn: function (s, d) { anularContrato_(s, d); } },
  agregarTramo: { fn: function (s, d) { return agregarTramo_(s, d); } },
  anularTramo: { admin: true, fn: function (s, d) { anularTramo_(s, d); } },
  editarUnidad: { admin: true, fn: function (s, d) { editarUnidad_(s, d); } },
  ocultarLocatario: { admin: true, fn: function (s, d) { ocultarLocatario_(s, d); } },
  editarMedidor: { admin: true, fn: function (s, d) { editarMedidor_(s, d); } },
  // 1.4 Cierre mensual
  panelCierre: { lectura: true, fn: function (s, d) { return panelCierre_(s, d); } },
  datosLecturas: { lectura: true, fn: function (s, d) { return datosLecturas_(s, d); } },
  guardarLectura: { fn: function (s, d) { return guardarLectura_(s, d); } },
  guardarLecturaTraspaso: { fn: function (s, d) { return guardarLecturaTraspaso_(s, d); } },
  registrarCambioMedidor: { fn: function (s, d) { return registrarCambioMedidor_(s, d); } },
  resolverRevision: { admin: true, fn: function (s, d) { return resolverRevision_(s, d); } },
  anularLectura: { fn: function (s, d) { anularLectura_(s, d); } },
  datosBoletas: { lectura: true, fn: function (s, d) { return datosBoletas_(s, d); } },
  guardarBoleta: { fn: function (s, d) { return guardarBoleta_(s, d); } },
  ajustarCosto: { admin: true, fn: function (s, d) { return ajustarCosto_(s, d); } },
  datosGastos: { lectura: true, fn: function (s, d) { return datosGastos_(s, d); } },
  guardarGastosFijos: { fn: function (s, d) { return guardarGastosFijos_(s, d); } },
  agregarExtraordinario: { fn: function (s, d) { return agregarExtraordinario_(s, d); } },
  anularGasto: { fn: function (s, d) { anularGasto_(s, d); } },
  darDeBajaGastoFijo: { admin: true, fn: function (s, d) { return darDeBajaGastoFijo_(s, d); } },
  nuevoGastoFijo: { admin: true, fn: function (s, d) { return nuevoGastoFijo_(s, d); } },
  ajustarDivisor: { fn: function (s, d) { return ajustarDivisor_(s, d); } },
  resumen: { lectura: true, fn: function (s, d) { return resumen_(s, d); } },
  confirmarCierre: { admin: true, fn: function (s, d) { return confirmarCierre_(s, d); } },
  reabrirCierre: { admin: true, fn: function (s, d) { return reabrirCierre_(s, d); } },
  // 1.5 Movimientos
  datosMovimientos: { lectura: true, fn: function (s) { return datosMovimientos_(s); } },
  contratoMovimiento: { fn: function (s, d) { return contratoMovimiento_(s, d); } },
  crearMovimiento: { fn: function (s, d) { return crearMovimiento_(s, d); } },
  anularMovimiento: { fn: function (s, d) { return anularMovimiento_(s, d); } },
  datosPagos: { lectura: true, fn: function (s) { return datosPagos_(s); } },
  crearPago: { fn: function (s, d) { return crearPago_(s, d); } },
  anularPago: { fn: function (s, d) { anularPago_(s, d); } },
  // 1.6 Trazabilidad
  actividad: { admin: true, fn: function (s, d) { return actividad_(s, d); } },
  // 2.3 Boletas a locatarios (D117)
  boletasLocatarios: { lectura: true, fn: function (s, d) { return boletasLocatarios_(s, d); } },
  // 2.1 Reglas de cobro
  guardarUfManual: { admin: true, fn: function (s, d) { return guardarUfManual_(s, d); } },
};

function llamar(accion, token, datos) {
  try {
    var def = ACCIONES[accion];
    if (!def) throw ErrorApp_('ACCION', 'Acción desconocida.');
    var s = null;
    if (!def.publica) {
      s = obtenerSesion_(token);
      if (s.cp && !def.conPinTemporal) throw ErrorApp_('DEBE_CAMBIAR_PIN', 'Primero crea tu PIN personal.');
      if (def.admin) requerirAdministradora_(s);
      if (s.r === 'solo_lectura' && !def.lectura && !def.conPinTemporal) throw ErrorApp_('SIN_PERMISO', 'Tu usuario es de solo lectura.');
    }
    return { ok: true, datos: paraPantalla_(def.fn(s, datos || {}) || null) };
  } catch (e) {
    if (!e.codigo) console.error(accion + ': ' + (e.stack || e));
    return {
      ok: false, codigo: e.codigo || 'ERROR',
      error: e.codigo ? e.message : 'Ocurrió un error inesperado. Intenta de nuevo; si se repite, avisa a la administradora.',
    };
  }
}

function inicio_(s) {
  precargarTablas_(TABLAS_CIERRE.concat(['contrato_arriendos', 'valores_uf']));
  var confirmados = leerTabla_('cierres')
    .filter(function (c) { return c.estado === 'confirmado'; })
    .map(function (c) { return String(c.periodo); })
    .sort();
  var ultimo = confirmados.length ? confirmados[confirmados.length - 1] : null;
  return {
    nombre: s.n, rol: s.r, ultimoCierre: ultimo,
    periodoEnCurso: ultimo ? sumarMesesPeriodo(ultimo, 1) : null,
    panel: panelSeguro_(s), // panel del cierre en la misma llamada (antes eran dos viajes)
    uf: ufSegura_(ultimo ? sumarMesesPeriodo(ultimo, 1) : null), // 2.1: UF del mes en curso (D106)
  };
}

function ufSegura_(periodo) {
  try { return ufPendienteInicio_(periodo, hoy_()); } catch (e) { console.warn('uf en inicio: ' + e); return null; }
}

function panelSeguro_(s) {
  try { return panelCierre_(s, {}); } catch (e) { console.warn('panel en inicio: ' + e); return null; }
}
