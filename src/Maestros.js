/**
 * Sub-etapa 1.3: unidades, medidores, locatarios, contratos y tramos de arriendo.
 *
 * Cambios retroactivos (C2): lo que afecta un período ya confirmado solo lo hace la
 * administradora y con motivo:
 *  - inicio, locatario o "paga GC" de un contrato que ya estaba en un período confirmado;
 *  - una fecha de término (antigua o nueva) dentro de un período confirmado;
 *  - un tramo de arriendo desde un período confirmado.
 */

// ---------------------------------------------------------------- Lectura

function hoy_() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fechaOVacio_(v) {
  return esFecha_(v) ? new Date(v.getFullYear(), v.getMonth(), v.getDate()) : null;
}

function ultimoConfirmado_() {
  var ps = leerTabla_('cierres')
    .filter(function (c) { return c.estado === 'confirmado'; })
    .map(function (c) { return String(c.periodo); })
    .sort();
  return ps.length ? ps[ps.length - 1] : null;
}

function leerContratos_() {
  return leerTabla_('contratos').map(function (c) {
    c.fecha_inicio = fechaOVacio_(c.fecha_inicio);
    c.fecha_fin = fechaOVacio_(c.fecha_fin);
    return c;
  });
}

function leerTramos_() {
  return leerTabla_('contrato_arriendos').map(function (t) {
    t.desde_periodo = String(t.desde_periodo);
    t.monto = Number(t.monto);
    t.moneda = monedaDeTramo(t); // vacío = CLP (2.1)
    return t;
  });
}

function agruparPor_(lista, campo) {
  var m = {};
  lista.forEach(function (x) { (m[x[campo]] = m[x[campo]] || []).push(x); });
  return m;
}

/** 2.1: UF del último día de cada período. Usa lo guardado; pregunta a la CMF solo por `periodoConCmf`. */
function buscadorUf_(periodoConCmf) {
  var guardados = leerValoresUf_(), memo = {};
  return function (periodo) {
    if (periodo in memo) return memo[periodo];
    var fecha = ultimoDiaDelPeriodo(periodo);
    var g = ufDeFecha(guardados, fecha);
    var u = g ? { fecha: fecha, valor: Number(g.valor), fuente: g.fuente } : periodo === periodoConCmf ? ufParaFecha_(fecha) : null;
    memo[periodo] = u;
    return u;
  };
}

/** 2.1: arriendo de un mes completo con un tramo: moneda, UF usada y pesos (null si falta la UF). */
function arriendoDelMes_(tramo, periodo, uf) {
  var moneda = monedaDeTramo(tramo);
  var u = moneda === 'UF' ? uf(periodo) : null;
  return { periodo: periodo, moneda: moneda, montoTramo: tramo.monto,
    ufFecha: moneda === 'UF' ? textoDeFecha(ultimoDiaDelPeriodo(periodo)) : '', ufValor: u ? u.valor : null,
    pesosMes: arriendoEnPesos(tramo.monto, moneda, u ? u.valor : null) };
}

/** Primer o último mes proporcional sobre el arriendo en pesos ya redondeado (D07, D11). */
function mesProporcional_(base, prop) {
  return Object.assign({}, prop, base, { monto: base.pesosMes === null ? null : prop.monto });
}

function primerMes_(ts, c, uf) {
  var t = tramoVigente(ts, periodoDe(c.fecha_inicio));
  if (!t) return null;
  var base = arriendoDelMes_(t, periodoDe(c.fecha_inicio), uf);
  return mesProporcional_(base, proporcionalPrimerMes(base.pesosMes || 0, c.fecha_inicio));
}

function ultimoMes_(ts, c, uf) {
  var t = c.fecha_fin && tramoVigente(ts, periodoDe(c.fecha_fin));
  if (!t) return null;
  var base = arriendoDelMes_(t, periodoDe(c.fecha_fin), uf);
  return mesProporcional_(base, proporcionalUltimoMes(base.pesosMes || 0, c.fecha_fin, c.fecha_inicio));
}

/** Monto de un tramo según su moneda: pesos enteros o UF con decimales (2.1). */
function montoTramo_(v, moneda) {
  if (moneda === 'UF') {
    var n = numeroIngresado_(v, 'El arriendo en UF');
    var e = validarMontoArriendo(n, 'UF');
    if (e) throw ErrorApp_('DATOS', e);
    return n;
  }
  return montoEntero_(v);
}

function monedaIngresada_(v) {
  if (v !== 'UF' && v !== 'CLP') throw ErrorApp_('DATOS', 'Elige la moneda del arriendo (UF o pesos).');
  return v;
}

/** Todo lo que necesitan las pantallas de maestros, en una sola llamada. */
function maestros_(s) {
  precargarTablas_(['contratos', 'contrato_arriendos', 'unidades', 'locatarios', 'medidores', 'cierres', 'catalogos', 'parametros', 'valores_uf']);
  var hoy = hoy_();
  var periodoHoy = periodoDe(hoy);
  var contratos = leerContratos_();
  var tramos = agruparPor_(leerTramos_(), 'contrato_id');
  var catalogos = leerTabla_('catalogos');
  var ultimo = ultimoConfirmado_();
  var enCurso = ultimo ? sumarMesesPeriodo(ultimo, 1) : periodoHoy;
  var uf = buscadorUf_(enCurso);
  return {
    hoy: textoDeFecha(hoy), ultimoConfirmado: ultimo, esAdmin: s.r === 'administradora',
    periodoEnCurso: enCurso, periodoUf: periodoReglas21_(),
    // D116: UF del último día del mes en curso, para mostrar el valor mensual en pesos al escribir un arriendo en UF
    ufEnCurso: (function () { var x = uf(enCurso); return { fecha: textoDeFecha(ultimoDiaDelPeriodo(enCurso)), valor: x ? x.valor : null }; })(),
    unidades: leerTabla_('unidades').map(function (u) {
      return { unidad_id: u.unidad_id, nombre: u.nombre, tipo: u.tipo, activa: u.activa === true, notas: u.notas, orden: u.orden,
        cuenta_gc: u.cuenta_gc === true,
        // D110: arriendo sugerido al crear un contrato
        arriendo_sugerido: u.arriendo_sugerido === '' || u.arriendo_sugerido === null ? null : Number(u.arriendo_sugerido),
        moneda_sugerido: u.moneda_sugerido === 'UF' ? 'UF' : 'CLP' };
    }),
    medidores: leerTabla_('medidores').map(function (m) {
      return { medidor_id: m.medidor_id, unidad_id: m.unidad_id, servicio: m.servicio, n_serie: m.n_serie,
        fecha_instalacion: textoDeFecha(fechaOVacio_(m.fecha_instalacion)), estado: m.estado };
    }),
    locatarios: leerTabla_('locatarios').map(function (l) {
      return { locatario_id: l.locatario_id, rut: l.rut, razon_social: l.razon_social, nombre_contacto: l.nombre_contacto,
        correo: s.r === 'solo_lectura' ? '' : l.correo, telefono: String(l.telefono || ''), notas: l.notas, oculto: l.oculto === true };
    }),
    contratos: contratos.map(function (c) {
      var ts = (tramos[c.contrato_id] || []).filter(function (t) { return t.estado !== 'anulado'; })
        .sort(function (a, b) { return a.desde_periodo < b.desde_periodo ? -1 : 1; });
      var actual = tramoVigente(ts, periodoHoy > periodoDe(c.fecha_inicio) ? periodoHoy : periodoDe(c.fecha_inicio));
      var tCurso = tramoVigente(ts, enCurso);
      var cubreEnCurso = tCurso && c.estado !== 'anulado' && periodoDe(c.fecha_inicio) <= enCurso &&
        (!c.fecha_fin || periodoDe(c.fecha_fin) >= enCurso);
      return {
        contrato_id: c.contrato_id, unidad_id: c.unidad_id, locatario_id: c.locatario_id,
        fecha_inicio: textoDeFecha(c.fecha_inicio), fecha_fin: textoDeFecha(c.fecha_fin),
        estado: estadoContrato(c, hoy), paga_gc: c.paga_gc === true, garantia_monto: c.garantia_monto, notas: c.notas,
        arriendo: actual ? actual.monto : null, moneda: actual ? actual.moneda : 'CLP',
        tramos: ts.map(function (t) {
          return { tramo_id: t.tramo_id, desde_periodo: t.desde_periodo, monto: t.monto, moneda: t.moneda, motivo: t.motivo, comentario: t.comentario };
        }),
        // 2.1: arriendo del período en curso en pesos ("11 UF × $39.643,26 = $436.076")
        arriendoMes: cubreEnCurso ? arriendoDelMes_(tCurso, enCurso, uf) : null,
        // D99: si empieza y termina el mismo mes, solo se muestra ese único mes
        primerMes: !(c.fecha_fin && periodoDe(c.fecha_fin) === periodoDe(c.fecha_inicio)) ? primerMes_(ts, c, uf) : null,
        ultimoMes: ultimoMes_(ts, c, uf),
      };
    }),
    motivosTramo: catalogos.filter(function (x) { return x.tipo === 'motivo_tramo' && x.activo === true; })
      .map(function (x) { return x.valor; }),
  };
}

// ---------------------------------------------------------------- Utilidades de escritura

function buscarPor_(lista, campo, valor) {
  for (var i = 0; i < lista.length; i++) if (lista[i][campo] === valor) return lista[i];
  return null;
}

function exigirRetroactivo_(s, motivo, que) {
  if (s.r !== 'administradora') {
    throw ErrorApp_('SIN_PERMISO', que + ' afecta un período ya confirmado: solo la administradora puede hacerlo.');
  }
  if (!String(motivo || '').trim()) throw ErrorApp_('DATOS', que + ' afecta un período ya confirmado: escribe el motivo.');
}

function esConfirmado_(periodo, ultimo) {
  return !!(ultimo && periodo && periodo <= ultimo);
}

function montoEntero_(v) {
  var n = Number(String(v === undefined || v === null ? '' : v).replace(/[.\s$]/g, ''));
  if (String(v).trim() === '' || !Number.isInteger(n) || n < 0) throw ErrorApp_('DATOS', 'El arriendo debe ser un monto entero en pesos.');
  return n;
}

/** Valida unidad, locatario, fechas y traslape. Devuelve {inicio, fin}. */
function validarContrato_(d, contratos, contratoId) {
  var unidad = buscarPor_(leerTabla_('unidades'), 'unidad_id', d.unidad_id);
  if (!unidad) throw ErrorApp_('DATOS', 'Elige la unidad.');
  if (unidad.activa !== true) throw ErrorApp_('DATOS', unidad.nombre + ' está inactiva.');
  if (unidad.tipo === 'calle') throw ErrorApp_('DATOS', 'Las calles no se arriendan.');
  if (!buscarPor_(leerTabla_('locatarios'), 'locatario_id', d.locatario_id)) throw ErrorApp_('DATOS', 'Elige el locatario.');
  var inicio = fechaDeTexto(d.fecha_inicio);
  if (!inicio) throw ErrorApp_('DATOS', 'La fecha de inicio no es válida.');
  var fin = d.fecha_fin ? fechaDeTexto(d.fecha_fin) : null;
  if (d.fecha_fin && !fin) throw ErrorApp_('DATOS', 'La fecha de término no es válida.');
  if (fin && fin < inicio) throw ErrorApp_('DATOS', 'El último día pagado no puede ser anterior al inicio.');
  var choque = buscarTraslape({ contrato_id: contratoId, unidad_id: d.unidad_id, fecha_inicio: inicio, fecha_fin: fin }, contratos);
  if (choque) {
    throw ErrorApp_('DATOS', 'Se cruza con el contrato ' + choque.contrato_id + ' de esta unidad (' +
      fechaParaMensaje(choque.fecha_inicio) + ' a ' + (choque.fecha_fin ? fechaParaMensaje(choque.fecha_fin) : 'sin término') + ').');
  }
  return { inicio: inicio, fin: fin };
}

/** Estado que se guarda en el Sheet (C1): el mismo que se calcula en pantalla. */
function estadoParaSheet_(c) {
  return estadoContrato(c, hoy_());
}

// ---------------------------------------------------------------- Locatarios

/** D115: solo la administradora. No se oculta a quien tiene un contrato vigente o por iniciar. */
function ocultarLocatario_(s, d) {
  conCandado_(function () {
    var l = buscarPor_(leerTabla_('locatarios'), 'locatario_id', d.locatario_id);
    if (!l) throw ErrorApp_('DATOS', 'Locatario no encontrado.');
    var ocultar = d.oculto === true;
    if ((l.oculto === true) === ocultar) return;
    if (ocultar) {
      var activo = leerContratos_().filter(function (c) {
        return c.locatario_id === l.locatario_id && ['vigente', 'por_iniciar'].indexOf(estadoContrato(c, hoy_())) !== -1;
      })[0];
      if (activo) throw ErrorApp_('DATOS', 'No se puede ocultar: tiene el contrato ' + activo.contrato_id + ' ' +
        (estadoContrato(activo, hoy_()) === 'vigente' ? 'vigente' : 'por iniciar') + '.');
    }
    actualizarFila_('locatarios', l, { oculto: ocultar ? true : '' }, s.u);
    registrarLog_(s.u, ocultar ? 'ocultar_locatario' : 'mostrar_locatario', 'locatarios', l.locatario_id, { oculto: l.oculto === true }, { oculto: ocultar });
  });
}

function guardarLocatario_(s, d) {
  var rut = normalizarRut(d.rut);
  if (!rutValido(rut)) throw ErrorApp_('DATOS', 'El RUT no es válido (revisa el dígito verificador).');
  var razon = String(d.razon_social || '').trim();
  if (!razon) throw ErrorApp_('DATOS', 'Falta la razón social o nombre.');
  var correo = revisarCorreo(d.correo);
  if (correo.error) throw ErrorApp_('DATOS', correo.error);
  var datos = { rut: rut, razon_social: razon, nombre_contacto: String(d.nombre_contacto || '').trim(),
    correo: correo.correo, telefono: String(d.telefono || '').trim(), notas: String(d.notas || '').trim() };

  return conCandado_(function () {
    var lista = leerTabla_('locatarios');
    var otro = lista.filter(function (l) { return l.rut === rut && l.locatario_id !== d.locatario_id; })[0];
    if (otro) throw ErrorApp_('DATOS', 'Ya existe un locatario con ese RUT: ' + otro.razon_social + '.');
    var id;
    if (d.locatario_id) {
      var actual = buscarPor_(lista, 'locatario_id', d.locatario_id);
      if (!actual) throw ErrorApp_('DATOS', 'Locatario no encontrado.');
      var antes = {}, cambios = {};
      Object.keys(datos).forEach(function (k) {
        if (String(actual[k] || '') !== datos[k]) { antes[k] = actual[k]; cambios[k] = datos[k]; }
      });
      if (Object.keys(cambios).length) {
        actualizarFila_('locatarios', actual, cambios, s.u);
        registrarLog_(s.u, 'editar_locatario', 'locatarios', d.locatario_id, antes, cambios);
      }
      id = d.locatario_id;
    } else {
      id = siguienteId_('locatarios', 'locatario_id', 'LOC-', 4);
      var nuevo = insertar_('locatarios', Object.assign({ locatario_id: id }, datos), s.u);
      registrarLog_(s.u, 'crear_locatario', 'locatarios', id, '', nuevo);
    }
    return { locatario_id: id, aviso: correo.aviso };
  });
}

// ---------------------------------------------------------------- Contratos

/** Vista previa mientras se llena el formulario: proporcionales y traslape, sin guardar. */
function previsualizarContrato_(s, d) {
  var r = { primerMes: null, ultimoMes: null, error: null };
  try {
    var f = validarContrato_(d, leerContratos_(), d.contrato_id || null);
    var moneda = d.moneda === 'UF' ? 'UF' : 'CLP';
    var monto = d.monto === '' || d.monto === undefined || d.monto === null ? null : montoTramo_(d.monto, moneda);
    if (monto !== null) {
      var ts = [{ desde_periodo: periodoDe(f.inicio), monto: monto, moneda: moneda, estado: 'vigente' }];
      var c = { fecha_inicio: f.inicio, fecha_fin: f.fin };
      var uf = buscadorUf_(null);
      if (f.fin) r.ultimoMes = ultimoMes_(ts, c, uf);
      if (!(r.ultimoMes && r.ultimoMes.unico)) r.primerMes = primerMes_(ts, c, uf);
    }
  } catch (e) {
    if (!e.codigo) throw e;
    r.error = e.message;
  }
  return r;
}

function crearContrato_(s, d) {
  var moneda = monedaIngresada_(d.moneda);
  var monto = montoTramo_(d.monto, moneda);
  if (monto === 0 && !String(d.comentario || '').trim()) throw ErrorApp_('DATOS', 'Un arriendo de $0 requiere un motivo.');
  return conCandado_(function () {
    var f = validarContrato_(d, leerContratos_(), null);
    if (moneda === 'UF' && periodoDe(f.inicio) < periodoReglas21_()) {
      throw ErrorApp_('DATOS', 'El arriendo en UF rige desde ' + periodoReglas21_() + ': un contrato que empieza antes va en pesos.');
    }
    var ultimo = ultimoConfirmado_();
    if (esConfirmado_(periodoDe(f.inicio), ultimo)) exigirRetroactivo_(s, d.motivo, 'Un contrato que empieza en ' + periodoDe(f.inicio));
    var id = siguienteId_('contratos', 'contrato_id', 'CON-', 4);
    var c = { contrato_id: id, unidad_id: d.unidad_id, locatario_id: d.locatario_id, fecha_inicio: f.inicio,
      fecha_fin: f.fin || '', paga_gc: d.paga_gc !== false, garantia_monto: d.garantia_monto === '' || d.garantia_monto === undefined
        ? '' : montoEntero_(d.garantia_monto), notas: String(d.notas || '').trim() };
    c.estado = estadoParaSheet_({ fecha_inicio: f.inicio, fecha_fin: f.fin });
    insertar_('contratos', c, s.u);
    var tramoId = siguienteId_('contrato_arriendos', 'tramo_id', 'TRA-', 6);
    insertar_('contrato_arriendos', { tramo_id: tramoId, contrato_id: id, desde_periodo: periodoDe(f.inicio),
      monto: monto, moneda: moneda, motivo: 'Inicial', comentario: String(d.comentario || '').trim() }, s.u);
    registrarLog_(s.u, 'crear_contrato', 'contratos', id, '', Object.assign({}, c, { arriendo: monto, moneda: moneda }), d.motivo);
    return { contrato_id: id };
  });
}

/** cambios: locatario_id, fecha_inicio, fecha_fin, paga_gc, garantia_monto, notas. */
function editarContrato_(s, d, accion) {
  return conCandado_(function () {
    var contratos = leerContratos_();
    var c = buscarPor_(contratos, 'contrato_id', d.contrato_id);
    if (!c) throw ErrorApp_('DATOS', 'Contrato no encontrado.');
    if (c.estado === 'anulado') throw ErrorApp_('DATOS', 'El contrato está anulado.');
    var ch = d.cambios || {};
    var propuesta = {
      unidad_id: c.unidad_id,
      locatario_id: ch.locatario_id !== undefined ? ch.locatario_id : c.locatario_id,
      fecha_inicio: ch.fecha_inicio !== undefined ? ch.fecha_inicio : textoDeFecha(c.fecha_inicio),
      fecha_fin: ch.fecha_fin !== undefined ? ch.fecha_fin : textoDeFecha(c.fecha_fin),
    };
    var f = validarContrato_(propuesta, contratos, c.contrato_id);
    var nuevo = {
      locatario_id: propuesta.locatario_id, fecha_inicio: f.inicio, fecha_fin: f.fin || '',
      paga_gc: ch.paga_gc !== undefined ? ch.paga_gc === true : c.paga_gc === true,
      garantia_monto: ch.garantia_monto !== undefined ? (ch.garantia_monto === '' ? '' : montoEntero_(ch.garantia_monto)) : c.garantia_monto,
      notas: ch.notas !== undefined ? String(ch.notas).trim() : c.notas,
    };
    var cambios = {}, antes = {};
    Object.keys(nuevo).forEach(function (k) {
      var a = esFecha_(c[k]) ? textoDeFecha(c[k]) : c[k], b = esFecha_(nuevo[k]) ? textoDeFecha(nuevo[k]) : nuevo[k];
      if (String(a === null || a === undefined ? '' : a) !== String(b)) { cambios[k] = nuevo[k]; antes[k] = c[k]; }
    });
    if (!Object.keys(cambios).length) return { contrato_id: c.contrato_id };

    var ultimo = ultimoConfirmado_();
    var yaCerrado = esConfirmado_(periodoDe(c.fecha_inicio), ultimo);
    if (yaCerrado && ('fecha_inicio' in cambios || 'locatario_id' in cambios || 'paga_gc' in cambios)) {
      exigirRetroactivo_(s, d.motivo, 'Cambiar inicio, locatario o "paga GC" de este contrato');
    }
    if ('fecha_fin' in cambios && (esConfirmado_(c.fecha_fin && periodoDe(c.fecha_fin), ultimo) ||
        esConfirmado_(f.fin && periodoDe(f.fin), ultimo))) {
      exigirRetroactivo_(s, d.motivo, 'Esta fecha de término');
    }
    cambios.estado = estadoParaSheet_({ fecha_inicio: f.inicio, fecha_fin: f.fin });
    if (cambios.estado === c.estado) delete cambios.estado;
    actualizarFila_('contratos', c, cambios, s.u);

    // Si el inicio cambia de mes, el arriendo inicial se mueve al nuevo mes (anular + nuevo tramo)
    if ('fecha_inicio' in cambios && periodoDe(f.inicio) !== periodoDe(c.fecha_inicio)) {
      moverTramoInicial_(s, c.contrato_id, periodoDe(c.fecha_inicio), periodoDe(f.inicio));
    }
    registrarLog_(s.u, accion || 'editar_contrato', 'contratos', c.contrato_id, antes, cambios, d.motivo);
    return { contrato_id: c.contrato_id };
  });
}

function moverTramoInicial_(s, contratoId, desdeAntes, desdeNuevo) {
  var t = leerTramos_().filter(function (x) {
    return x.contrato_id === contratoId && x.estado !== 'anulado' && x.desde_periodo === desdeAntes;
  })[0];
  if (!t) return;
  actualizarFila_('contrato_arriendos', t, { estado: 'anulado', anulado_por: s.u, anulado_en: new Date(),
    motivo_anulacion: 'cambio de fecha de inicio a ' + desdeNuevo }, s.u);
  var id = siguienteId_('contrato_arriendos', 'tramo_id', 'TRA-', 6);
  insertar_('contrato_arriendos', { tramo_id: id, contrato_id: contratoId, desde_periodo: desdeNuevo, monto: t.monto,
    moneda: t.moneda, motivo: t.motivo, comentario: t.comentario, reemplaza_a: t.tramo_id }, s.u);
  registrarLog_(s.u, 'mover_tramo', 'contrato_arriendos', id, { tramo_id: t.tramo_id, desde_periodo: desdeAntes },
    { tramo_id: id, desde_periodo: desdeNuevo });
}

function anularContrato_(s, d) {
  if (!String(d.motivo || '').trim()) throw ErrorApp_('DATOS', 'Escribe el motivo de la anulación.');
  conCandado_(function () {
    var c = buscarPor_(leerContratos_(), 'contrato_id', d.contrato_id);
    if (!c) throw ErrorApp_('DATOS', 'Contrato no encontrado.');
    if (c.estado === 'anulado') return;
    actualizarFila_('contratos', c, { estado: 'anulado' }, s.u);
    registrarLog_(s.u, 'anular_contrato', 'contratos', c.contrato_id, { estado: c.estado }, { estado: 'anulado' }, d.motivo);
  });
}

// ---------------------------------------------------------------- Tramos

function agregarTramo_(s, d) {
  var moneda = monedaIngresada_(d.moneda);
  var monto = montoTramo_(d.monto, moneda);
  return conCandado_(function () {
    var c = buscarPor_(leerContratos_(), 'contrato_id', d.contrato_id);
    if (!c || c.estado === 'anulado') throw ErrorApp_('DATOS', 'Contrato no encontrado.');
    var tramos = leerTramos_().filter(function (t) { return t.contrato_id === c.contrato_id; });
    var error = validarTramoNuevo(String(d.desde_periodo), monto, d.comentario, tramos, moneda, periodoReglas21_());
    if (error) throw ErrorApp_('DATOS', error);
    if (d.desde_periodo < periodoDe(c.fecha_inicio)) throw ErrorApp_('DATOS', 'El arriendo no puede regir antes del inicio del contrato.');
    if (esConfirmado_(d.desde_periodo, ultimoConfirmado_())) exigirRetroactivo_(s, d.motivo_retroactivo, 'Un arriendo desde ' + d.desde_periodo);
    var id = siguienteId_('contrato_arriendos', 'tramo_id', 'TRA-', 6);
    var t = insertar_('contrato_arriendos', { tramo_id: id, contrato_id: c.contrato_id, desde_periodo: String(d.desde_periodo),
      monto: monto, moneda: moneda, motivo: d.motivo || 'Reajuste', comentario: String(d.comentario || '').trim() }, s.u);
    registrarLog_(s.u, 'agregar_tramo', 'contrato_arriendos', id, '', t, d.motivo_retroactivo);
    return { tramo_id: id };
  });
}

function anularTramo_(s, d) {
  if (!String(d.motivo || '').trim()) throw ErrorApp_('DATOS', 'Escribe el motivo de la anulación.');
  conCandado_(function () {
    var tramos = leerTramos_();
    var t = buscarPor_(tramos, 'tramo_id', d.tramo_id);
    if (!t || t.estado === 'anulado') throw ErrorApp_('DATOS', 'Arriendo no encontrado.');
    var otros = tramos.filter(function (x) { return x.contrato_id === t.contrato_id && x.estado !== 'anulado' && x.tramo_id !== t.tramo_id; });
    if (!otros.length) throw ErrorApp_('DATOS', 'Es el único arriendo del contrato: agrega primero el correcto y luego anula este.');
    actualizarFila_('contrato_arriendos', t, { estado: 'anulado', anulado_por: s.u, anulado_en: new Date(),
      motivo_anulacion: String(d.motivo).trim() }, s.u);
    registrarLog_(s.u, 'anular_tramo', 'contrato_arriendos', t.tramo_id, { estado: 'vigente' }, { estado: 'anulado' }, d.motivo);
  });
}

// ---------------------------------------------------------------- Unidades y medidores (C6: solo administradora)

function editarUnidad_(s, d) {
  conCandado_(function () {
    var u = buscarPor_(leerTabla_('unidades'), 'unidad_id', d.unidad_id);
    if (!u) throw ErrorApp_('DATOS', 'Unidad no encontrada.');
    var cambios = {}, antes = {};
    if (d.notas !== undefined && String(d.notas).trim() !== String(u.notas || '')) { cambios.notas = String(d.notas).trim(); antes.notas = u.notas; }
    if (d.activa !== undefined && (d.activa === true) !== (u.activa === true)) { cambios.activa = d.activa === true; antes.activa = u.activa; }
    // D94: cuenta en el divisor del GC. Afecta los períodos no confirmados.
    if (d.cuenta_gc !== undefined && (d.cuenta_gc === true) !== (u.cuenta_gc === true)) { cambios.cuenta_gc = d.cuenta_gc === true; antes.cuenta_gc = u.cuenta_gc; }
    // D110: arriendo sugerido (vacío = sin sugerido)
    if (d.arriendo_sugerido !== undefined) {
      var sug = String(d.arriendo_sugerido).trim() === '' ? '' : montoTramo_(d.arriendo_sugerido, monedaIngresada_(d.moneda_sugerido));
      var mon = sug === '' ? '' : d.moneda_sugerido;
      if (String(sug) !== String(u.arriendo_sugerido === null || u.arriendo_sugerido === undefined ? '' : u.arriendo_sugerido) ||
          mon !== String(u.moneda_sugerido || '')) {
        cambios.arriendo_sugerido = sug; cambios.moneda_sugerido = mon;
        antes.arriendo_sugerido = u.arriendo_sugerido; antes.moneda_sugerido = u.moneda_sugerido;
      }
    }
    if (!Object.keys(cambios).length) return;
    actualizarFila_('unidades', u, cambios, s.u);
    registrarLog_(s.u, 'editar_unidad', 'unidades', u.unidad_id, antes, cambios);
  });
}

function editarMedidor_(s, d) {
  conCandado_(function () {
    var m = buscarPor_(leerTabla_('medidores'), 'medidor_id', d.medidor_id);
    if (!m) throw ErrorApp_('DATOS', 'Medidor no encontrado.');
    var cambios = {}, antes = {};
    if (d.n_serie !== undefined && String(d.n_serie).trim() !== String(m.n_serie || '')) { cambios.n_serie = String(d.n_serie).trim(); antes.n_serie = m.n_serie; }
    if (d.fecha_instalacion !== undefined) {
      var f = d.fecha_instalacion ? fechaDeTexto(d.fecha_instalacion) : '';
      if (d.fecha_instalacion && !f) throw ErrorApp_('DATOS', 'La fecha de instalación no es válida.');
      if (textoDeFecha(f || null) !== textoDeFecha(fechaOVacio_(m.fecha_instalacion))) { cambios.fecha_instalacion = f; antes.fecha_instalacion = m.fecha_instalacion; }
    }
    if (!Object.keys(cambios).length) return;
    actualizarFila_('medidores', m, cambios, s.u);
    registrarLog_(s.u, 'editar_medidor', 'medidores', m.medidor_id, antes, cambios);
  });
}
