/**
 * Sub-etapa 1.4: cierre mensual. Boletas, lecturas (con cambio de medidor y revisión),
 * gastos comunes, divisor, resumen del período, confirmación y reapertura.
 *
 * Solo se ingresan datos en el período en curso (mes siguiente al último confirmado) o en uno
 * reabierto (L8). Los registros nunca se editan: corregir = anular + crear uno que lo reemplaza.
 */

var CONCEPTO_EXTRA = 'Extraordinario';

/** Gastos fijos activos (catálogo concepto_gc, sin "Extraordinario"), en su orden. D77 */
function conceptosFijos_() {
  return leerTabla_('catalogos')
    .filter(function (c) { return c.tipo === 'concepto_gc' && c.activo === true && c.valor !== CONCEPTO_EXTRA; })
    .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
    .map(function (c) { return String(c.valor); });
}
var CALLES = ['CEX', 'CIN'];
var MINIMO_LECTURA_IGUAL = 100;

// ---------------------------------------------------------------- Lectura de tablas

function numeroONulo_(v) {
  return v === '' || v === null || v === undefined ? null : Number(v);
}

/** Lecturas del mes (vigentes). Las de traspaso (D115) van aparte: no cuentan para el consumo, el promedio ni las alertas. */
function leerLecturas_() {
  return leerTodasLecturas_().filter(function (l) { return !l.traspaso; });
}

function leerTraspasos_() {
  return leerTodasLecturas_().filter(function (l) { return !!l.traspaso; });
}

function leerTodasLecturas_() {
  return leerTabla_('lecturas').filter(function (l) { return l.estado !== 'anulado'; }).map(function (l) {
    l.periodo = String(l.periodo); l.lectura = Number(l.lectura); l.fecha_lectura = fechaOVacio_(l.fecha_lectura);
    l.traspaso = String(l.traspaso || '');
    return l;
  });
}

function leerMedidores_() {
  return leerTabla_('medidores').map(function (m) {
    m.lectura_inicial = numeroONulo_(m.lectura_inicial); m.lectura_final = numeroONulo_(m.lectura_final);
    m.fecha_retiro = fechaOVacio_(m.fecha_retiro);
    return m;
  });
}

function vigentesDe_(tabla, periodo) {
  return leerTabla_(tabla).filter(function (x) { return x.estado !== 'anulado' && String(x.periodo) === periodo; });
}

/** Número escrito por una persona: acepta "1.369,3" o "1369.3". */
function numeroIngresado_(v, nombre) {
  var t = String(v === undefined || v === null ? '' : v).trim();
  // "25.384" es ambiguo (¿25 mil o 25 coma 384?): se pide escribirlo sin punto de miles
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) throw ErrorApp_('DATOS', nombre + ': escribe el número sin punto de miles (ej. 25384 o 25384,4).');
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  var n = Number(t);
  if (t === '' || isNaN(n) || n < 0) throw ErrorApp_('DATOS', nombre + ' debe ser un número mayor o igual a 0.');
  return n;
}

// ---------------------------------------------------------------- Contexto del período

var TABLAS_CIERRE = ['cierres', 'contratos', 'unidades', 'locatarios', 'medidores', 'lecturas', 'parametros',
  'boletas_servicio', 'gastos_comunes', 'usuarios'];

function contextoPeriodo_(periodo) {
  precargarTablas_(TABLAS_CIERRE);
  var hoy = hoy_();
  var cierres = leerTabla_('cierres').map(function (c) { c.periodo = String(c.periodo); return c; });
  var confirmados = cierres.filter(function (c) { return c.estado === 'confirmado'; }).map(function (c) { return c.periodo; }).sort();
  var ultimo = confirmados.length ? confirmados[confirmados.length - 1] : null;
  var enCurso = periodoEnCurso(ultimo, periodoDe(hoy));
  periodo = periodo || enCurso;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw ErrorApp_('DATOS', 'Período no válido.');
  if (periodo > enCurso) throw ErrorApp_('DATOS', 'Todavía no se puede ingresar ' + periodo + ': el período en curso es ' + enCurso + '.');
  var cierre = cierres.filter(function (c) { return c.periodo === periodo; })[0] || null;
  var estado = cierre ? cierre.estado : 'abierto';
  var reabiertos = cierres.filter(function (c) { return c.estado === 'reabierto'; }).map(function (c) { return c.periodo; });
  var periodos = confirmados.concat(reabiertos, [enCurso]).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort().reverse();
  // Para el selector de período (D92): estado de cada mes de la lista (sin fila en cierres = 'abierto', sin datos)
  var estados = {};
  periodos.forEach(function (x) { var c = cierres.filter(function (k) { return k.periodo === x; })[0]; estados[x] = c ? c.estado : 'abierto'; });
  var contratos = leerContratos_();
  var unidades = leerTabla_('unidades');
  var proporcional = periodo >= periodoReglas21_(); // 2.1: GC proporcional a los días (D112)
  return {
    periodo: periodo, enCurso: enCurso, ultimoConfirmado: ultimo, cierre: cierre, estado: estado,
    editable: estado !== 'confirmado' && (periodo === enCurso || estado === 'reabierto'),
    periodos: periodos, estados: estados, p: parametros_(), contratos: contratos,
    unidades: unidades, locatarios: leerTabla_('locatarios'),
    medidores: leerMedidores_(), lecturas: leerLecturas_(), traspasos: leerTraspasos_(),
    reparto: proporcional, // D115: reparto del consumo entre locatarios desde el período de 2.1
    gcProporcional: proporcional,
    pagan: unidadesQuePaganGCSegun(contratos, periodo, proporcional), enDivisor: unidadesDelDivisorGC(unidades), conContrato: unidadesConContratoEnMes(contratos, periodo),
  };
}

function exigirEditable_(cx) {
  if (!cx.editable) {
    throw ErrorApp_('NO_EDITABLE', cx.estado === 'confirmado'
      ? 'El período ' + cx.periodo + ' está confirmado. La administradora puede reabrirlo.'
      : 'Solo se puede ingresar datos en el período en curso (' + cx.enCurso + ') o en uno reabierto.');
  }
}

function divisorDe_(cx) {
  var calc = cx.enDivisor.length; // D94
  var c = cx.cierre;
  if (c && (c.estado === 'confirmado' || c.ajuste_gc_por)) return { calculado: c.estado === 'confirmado' ? Number(c.n_locales_gc_calculado) : calc, usado: Number(c.n_locales_gc_usado), motivo: c.motivo_ajuste_gc || '' };
  return { calculado: calc, usado: calc, motivo: '' };
}

/** Crea la fila del cierre (borrador) al guardar el primer dato del período. Llamar con candado. */
function asegurarCierre_(cx, usuarioId) {
  if (cx.cierre) return cx.cierre;
  cx.cierre = insertar_('cierres', { periodo: cx.periodo, estado: 'borrador', n_locales_gc_calculado: cx.enDivisor.length,
    n_locales_gc_usado: cx.enDivisor.length }, usuarioId);
  registrarLog_(usuarioId, 'abrir_cierre', 'cierres', cx.periodo, '', { estado: 'borrador' });
  return cx.cierre;
}

function anularRegistro_(tabla, obj, usuarioId, motivo) {
  actualizarFila_(tabla, obj, { estado: 'anulado', anulado_por: usuarioId, anulado_en: new Date(), motivo_anulacion: motivo }, usuarioId);
}

// ---------------------------------------------------------------- Fichas de medidores

function nombreUnidad_(cx, id) {
  var u = buscarPor_(cx.unidades, 'unidad_id', id);
  return u ? u.nombre : id;
}

function locatarioEnMes_(cx, unidadId) {
  var mes = rangoDelMes(cx.periodo);
  var c = cx.contratos.filter(function (x) {
    return x.unidad_id === unidadId && x.estado !== 'anulado' && seTraslapan(mes, x);
  }).sort(function (a, b) { return b.fecha_inicio - a.fecha_inicio; })[0];
  var l = c ? buscarPor_(cx.locatarios, 'locatario_id', c.locatario_id) : null;
  return l ? l.razon_social : '';
}

/** Medidor que fue reemplazado por `m` (mismo local y servicio, retirado más recientemente). */
function medidorReemplazado_(cx, m) {
  return cx.medidores.filter(function (x) {
    return x.unidad_id === m.unidad_id && x.servicio === m.servicio && x.estado === 'retirado' && x.medidor_id !== m.medidor_id;
  }).sort(function (a, b) { return (b.fecha_retiro || 0) - (a.fecha_retiro || 0); })[0] || null;
}

function fichaMedidor_(cx, m, porMedidor) {
  var serie = porMedidor[m.medidor_id] || [];
  var actual = serie.filter(function (l) { return l.periodo === cx.periodo; })[0] || null;
  var previas = serie.filter(function (l) { return l.periodo < cx.periodo; });
  var ant = previas.length ? previas[previas.length - 1] : null;
  var anteriorValor = ant ? ant.lectura : m.lectura_inicial;
  var cambio = null;
  if (actual && actual.es_cambio_medidor === true) {
    var viejo = medidorReemplazado_(cx, m);
    var previasViejo = viejo ? (porMedidor[viejo.medidor_id] || []).filter(function (l) { return l.periodo < cx.periodo; }) : [];
    cambio = { medidorViejo: viejo ? viejo.medidor_id : null,
      anteriorViejo: previasViejo.length ? previasViejo[previasViejo.length - 1].lectura : (viejo ? viejo.lectura_inicial : null),
      final: viejo ? viejo.lectura_final : null, inicial: m.lectura_inicial || 0 };
  }
  // Historial para el promedio: consumo mensual de meses anteriores sin alertas ni cambio de medidor.
  // Si entre dos lecturas hay meses sin leer, el consumo se reparte entre esos meses.
  var meses = function (a, b) { return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)); };
  var historial = [];
  for (var i = 1; i < previas.length; i++) {
    if (previas[i].alertas || previas[i].es_cambio_medidor === true || previas[i].estado_revision === 'base') continue;
    var nMeses = meses(previas[i - 1].periodo, previas[i].periodo);
    if (nMeses > 0) historial.push((previas[i].lectura - previas[i - 1].lectura) / nMeses);
  }
  return {
    medidor_id: m.medidor_id, unidad_id: m.unidad_id, servicio: m.servicio, estadoMedidor: m.estado,
    anterior: anteriorValor === null || anteriorValor === undefined ? null
      : { valor: anteriorValor, periodo: ant ? ant.periodo : null, fecha: ant ? textoDeFecha(ant.fecha_lectura) : null },
    actual: actual ? { lectura_id: actual.lectura_id, valor: actual.lectura, fecha: textoDeFecha(actual.fecha_lectura),
      alertas: actual.alertas, comentario: actual.comentario_alerta, revision: actual.estado_revision || '',
      esCambio: actual.es_cambio_medidor === true } : null,
    consumo: actual ? consumoDe(actual.lectura, cambio ? null : anteriorValor, cambio, actual.estado_revision) : null,
    promedio: promedioConsumo(historial, cx.p.alerta_meses_promedio), cambio: cambio,
  };
}

function fichas_(cx) {
  var porMedidor = agruparPor_(cx.lecturas.slice().sort(function (a, b) { return a.periodo < b.periodo ? -1 : 1; }), 'medidor_id');
  return cx.medidores.filter(function (m) {
    return m.estado === 'activo' || (porMedidor[m.medidor_id] || []).some(function (l) { return l.periodo === cx.periodo; });
  }).map(function (m) { return fichaMedidor_(cx, m, porMedidor); });
}

/** Consumo por unidad y servicio en el período: {L07: {luz: 94.3, agua: 3}, …}. */
function consumosPorUnidad_(fichas) {
  var r = {};
  fichas.forEach(function (f) {
    if (f.consumo === null) return;
    r[f.unidad_id] = r[f.unidad_id] || {};
    r[f.unidad_id][f.servicio] = (r[f.unidad_id][f.servicio] || 0) + f.consumo;
  });
  return r;
}

// ---------------------------------------------------------------- Lecturas de traspaso (D115)

function nombreLocatario_(cx, id) {
  var l = id ? buscarPor_(cx.locatarios, 'locatario_id', id) : null;
  return l ? l.razon_social : '';
}

/**
 * Cortes y reparto del consumo de un medidor entre los locatarios del mes. null si en el mes hay un solo tramo
 * (lo normal), si es una calle o si el período es anterior a 2.1.
 */
function repartoFicha_(cx, f) {
  if (!cx.reparto || CALLES.indexOf(f.unidad_id) !== -1) return null;
  var tramos = tramosDelMes(cx.contratos, f.unidad_id, cx.periodo);
  if (tramos.length < 2) return null;
  var lecturas = {}, porClave = {};
  cx.traspasos.forEach(function (l) {
    if (l.periodo !== cx.periodo || l.medidor_id !== f.medidor_id) return;
    lecturas[l.traspaso] = l.lectura; porClave[l.traspaso] = l;
  });
  var cortes = cortesDeTramos(tramos).map(function (c) {
    var l = porClave[c.clave];
    var etiqueta = c.sale && c.entra ? 'Lectura de traspaso: sale ' + nombreLocatario_(cx, contratoDe_(cx, c.sale)) + ' (pagó hasta el ' + fechaParaMensaje(c.fecha) +
        '), entra ' + nombreLocatario_(cx, contratoDe_(cx, c.entra))
      : c.sale ? 'Lectura al salir ' + nombreLocatario_(cx, contratoDe_(cx, c.sale)) + ' (pagó hasta el ' + fechaParaMensaje(c.fecha) + ')'
        : 'Lectura al entrar ' + nombreLocatario_(cx, contratoDe_(cx, c.entra)) + ' (desde el ' + fechaParaMensaje(new Date(c.fecha.getTime() + 86400000)) + ')';
    return { clave: c.clave, fecha: textoDeFecha(c.fecha), etiqueta: etiqueta,
      lectura: l ? { lectura_id: l.lectura_id, valor: l.lectura, fecha: textoDeFecha(l.fecha_lectura) } : null };
  });
  var r = { cortes: cortes, tramos: null, faltan: cortes.filter(function (c) { return !c.lectura; }).length };
  if (f.consumo !== null && f.consumo !== undefined) {
    var simple = !f.cambio && !!f.anterior && !!f.actual && f.actual.revision !== 'base';
    r.tramos = repartirConsumo(tramos, { anterior: f.anterior ? f.anterior.valor : null, actual: f.actual ? f.actual.valor : null, consumo: f.consumo },
      lecturas, simple).map(function (t) {
      return { contrato_id: t.contrato_id, locatario_id: t.locatario_id, // 2.3: para armar la boleta de cada locatario
        locatario: t.contrato_id ? nombreLocatario_(cx, t.locatario_id) : 'vacío (administración)', vacio: !t.contrato_id,
        dias: t.dias, consumo: t.consumo, estimado: t.estimado };
    });
  }
  return r;
}

function contratoDe_(cx, contratoId) {
  var c = buscarPor_(cx.contratos, 'contrato_id', contratoId);
  return c ? c.locatario_id : null;
}

/** D115: guarda (o corrige) una lectura de traspaso. d: {periodo, medidor_id, clave, lectura, fecha} */
function guardarLecturaTraspaso_(s, d) {
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    var m = buscarPor_(cx.medidores, 'medidor_id', d.medidor_id);
    if (!m || m.estado !== 'activo') throw ErrorApp_('DATOS', 'Medidor no encontrado o retirado.');
    var porMedidor = agruparPor_(cx.lecturas.slice().sort(function (a, b) { return a.periodo < b.periodo ? -1 : 1; }), 'medidor_id');
    var f = fichaMedidor_(cx, m, porMedidor);
    var rep = repartoFicha_(cx, f);
    var corte = rep && rep.cortes.filter(function (c) { return c.clave === d.clave; })[0];
    if (!corte) throw ErrorApp_('DATOS', 'Este medidor no tiene un cambio de locatario en ' + cx.periodo + '.');
    var lectura = numeroIngresado_(d.lectura, 'La lectura de traspaso');
    var fecha = d.fecha ? fechaDeTexto(d.fecha) : fechaDeTexto(corte.fecha);
    if (!fecha) throw ErrorApp_('DATOS', 'La fecha de la lectura no es válida.');
    if (f.anterior && !f.cambio && lectura < f.anterior.valor) {
      throw ErrorApp_('DATOS', 'La lectura de traspaso (' + lectura + ') no puede ser menor que la del mes anterior (' + f.anterior.valor + ').');
    }
    if (f.actual && !f.cambio && lectura > f.actual.valor) {
      throw ErrorApp_('DATOS', 'La lectura de traspaso (' + lectura + ') no puede ser mayor que la lectura del mes (' + f.actual.valor + ').');
    }
    asegurarCierre_(cx, s.u);
    var previa = cx.traspasos.filter(function (l) { return l.periodo === cx.periodo && l.medidor_id === m.medidor_id && l.traspaso === d.clave; })[0];
    if (previa) anularRegistro_('lecturas', previa, s.u, 'corregida');
    var id = siguienteId_('lecturas', 'lectura_id', 'LEC-', 6);
    insertar_('lecturas', { lectura_id: id, periodo: cx.periodo, medidor_id: m.medidor_id, unidad_id: m.unidad_id, servicio: m.servicio,
      lectura: lectura, fecha_lectura: fecha, origen: 'manual', es_cambio_medidor: false, alertas: '', comentario_alerta: '',
      estado_revision: '', traspaso: d.clave, reemplaza_a: previa ? previa.lectura_id : '' }, s.u);
    registrarLog_(s.u, previa ? 'corregir_lectura_traspaso' : 'lectura_traspaso', 'lecturas', id, previa ? { lectura: previa.lectura } : '',
      { lectura: lectura, traspaso: d.clave });
    var cx2 = contextoPeriodo_(cx.periodo);
    var m2 = buscarPor_(cx2.medidores, 'medidor_id', m.medidor_id);
    var por2 = agruparPor_(cx2.lecturas.slice().sort(function (a, b) { return a.periodo < b.periodo ? -1 : 1; }), 'medidor_id');
    return { lectura_id: id, ficha: decorarFicha_(cx2, fichaMedidor_(cx2, m2, por2)) };
  });
}

// ---------------------------------------------------------------- Lecturas

/** Agrega a una ficha los datos que muestra la pantalla de Lecturas. */
function decorarFicha_(cx, f) {
  var u = buscarPor_(cx.unidades, 'unidad_id', f.unidad_id);
  f.unidad = u ? u.nombre : f.unidad_id;
  f.locatario = locatarioEnMes_(cx, f.unidad_id);
  f.esCalle = CALLES.indexOf(f.unidad_id) !== -1;
  f.esperada = f.esCalle || cx.conContrato.indexOf(f.unidad_id) !== -1;
  f.orden = u ? u.orden : 999;
  f.traspaso = repartoFicha_(cx, f); // D115
  return f;
}

function datosLecturas_(s, d) {
  var cx = contextoPeriodo_(d.periodo);
  var lista = fichas_(cx).map(function (f) { return decorarFicha_(cx, f); })
    .sort(function (a, b) { return a.orden - b.orden || (a.servicio < b.servicio ? -1 : 1); });
  return { periodo: cx.periodo, periodos: cx.periodos, estadosPeriodos: cx.estados, estado: cx.estado, editable: cx.editable && s.r !== 'solo_lectura',
    esAdmin: s.r === 'administradora', hoy: textoDeFecha(hoy_()), fichas: lista,
    rango: { alto: cx.p.alerta_factor_alto, bajo: cx.p.alerta_factor_bajo, minKwh: cx.p.alerta_min_kwh, minM3: cx.p.alerta_min_m3 } };
}

/**
 * d: {periodo, medidor_id, lectura, fecha, comentario, modo: 'normal' | 'revision'}
 * Error con código para la pantalla: MENOR_QUE_ANTERIOR (abre el flujo D13). Las alertas de rango
 * o lectura repetida se guardan junto a la lectura y se devuelven para avisar; el comentario es opcional (R3).
 */
function guardarLectura_(s, d) {
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    var m = buscarPor_(cx.medidores, 'medidor_id', d.medidor_id);
    if (!m || m.estado !== 'activo') throw ErrorApp_('DATOS', 'Medidor no encontrado o retirado.');
    var lectura = numeroIngresado_(d.lectura, 'La lectura');
    var fecha = d.fecha ? fechaDeTexto(d.fecha) : hoy_();
    if (!fecha) throw ErrorApp_('DATOS', 'La fecha de lectura no es válida.');
    var porMedidor = agruparPor_(cx.lecturas.slice().sort(function (a, b) { return a.periodo < b.periodo ? -1 : 1; }), 'medidor_id');
    var f = fichaMedidor_(cx, m, porMedidor);
    var comentario = String(d.comentario || '').trim();
    var alertas = [], revision = '';
    var anterior = f.actual && f.actual.esCambio ? m.lectura_inicial : (f.anterior ? f.anterior.valor : null);

    if (anterior !== null && lectura < anterior) {
      if (d.modo !== 'revision') {
        throw ErrorApp_('MENOR_QUE_ANTERIOR', 'La lectura (' + lectura + ') es menor que la última registrada (' + anterior +
          (f.anterior && f.anterior.periodo ? ', ' + f.anterior.periodo : '') + ').');
      }
      if (!comentario) throw ErrorApp_('DATOS', 'Explica por qué la lectura anterior puede estar mal.');
      alertas.push('NEGATIVO');
      revision = 'en_revision';
    } else if (anterior !== null) {
      alertas = alertasRango(lectura - anterior, f.promedio, m.servicio, cx.p);
    }
    var repetida = lectura >= MINIMO_LECTURA_IGUAL && cx.lecturas.some(function (l) {
      return l.periodo === cx.periodo && l.medidor_id !== m.medidor_id && l.lectura === lectura &&
        buscarPor_(cx.medidores, 'medidor_id', l.medidor_id).servicio === m.servicio;
    });
    if (repetida) alertas.push('IGUAL_A_OTRO_MEDIDOR');
    // R3: las alertas de rango y de lectura repetida quedan registradas, pero el comentario es opcional

    asegurarCierre_(cx, s.u);
    var previa = f.actual ? buscarPor_(cx.lecturas, 'lectura_id', f.actual.lectura_id) : null;
    if (previa) anularRegistro_('lecturas', previa, s.u, 'corregida');
    var id = siguienteId_('lecturas', 'lectura_id', 'LEC-', 6);
    insertar_('lecturas', { lectura_id: id, periodo: cx.periodo, medidor_id: m.medidor_id, unidad_id: m.unidad_id,
      servicio: m.servicio, lectura: lectura, fecha_lectura: fecha, origen: 'manual',
      es_cambio_medidor: previa ? previa.es_cambio_medidor === true : false, alertas: alertas.join(','),
      comentario_alerta: comentario, estado_revision: revision, reemplaza_a: previa ? previa.lectura_id : '' }, s.u);
    if (previa) registrarLog_(s.u, 'corregir_lectura', 'lecturas', id, { lectura_id: previa.lectura_id, lectura: previa.lectura }, { lectura: lectura });
    // La pantalla actualiza solo esta tarjeta con la ficha recalculada (sin recargar la lista)
    var cx2 = contextoPeriodo_(cx.periodo);
    var m2 = buscarPor_(cx2.medidores, 'medidor_id', m.medidor_id);
    var por2 = agruparPor_(cx2.lecturas.slice().sort(function (a, b) { return a.periodo < b.periodo ? -1 : 1; }), 'medidor_id');
    return { lectura_id: id, alertas: alertas, ficha: decorarFicha_(cx2, fichaMedidor_(cx2, m2, por2)) };
  });
}

/** D13 "Sí, es un medidor nuevo". d: {periodo, medidor_id, final ('' = no la tengo), inicial, fecha_cambio, lectura, fecha, comentario} */
function registrarCambioMedidor_(s, d) {
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    var viejo = buscarPor_(cx.medidores, 'medidor_id', d.medidor_id);
    if (!viejo || viejo.estado !== 'activo') throw ErrorApp_('DATOS', 'Medidor no encontrado o ya retirado.');
    var porMedidor = agruparPor_(cx.lecturas.slice().sort(function (a, b) { return a.periodo < b.periodo ? -1 : 1; }), 'medidor_id');
    var f = fichaMedidor_(cx, viejo, porMedidor);
    var anterior = f.anterior ? f.anterior.valor : null;
    var final = d.final === '' || d.final === null || d.final === undefined ? null : numeroIngresado_(d.final, 'La última lectura del medidor retirado');
    if (final !== null && anterior !== null && final < anterior) {
      throw ErrorApp_('DATOS', 'La última lectura del medidor retirado (' + final + ') no puede ser menor que la anterior registrada (' + anterior + ').');
    }
    var inicial = numeroIngresado_(d.inicial === '' || d.inicial === undefined ? 0 : d.inicial, 'La lectura inicial del medidor nuevo');
    var lectura = numeroIngresado_(d.lectura, 'La lectura actual');
    if (lectura < inicial) throw ErrorApp_('DATOS', 'La lectura actual no puede ser menor que la inicial del medidor nuevo.');
    var fechaCambio = fechaDeTexto(d.fecha_cambio) || hoy_();
    var fecha = d.fecha ? fechaDeTexto(d.fecha) : hoy_();

    asegurarCierre_(cx, s.u);
    var n = cx.medidores.filter(function (x) { return x.unidad_id === viejo.unidad_id && x.servicio === viejo.servicio; }).length + 1;
    var nuevoId = 'MED-' + viejo.unidad_id + '-' + viejo.servicio.toUpperCase() + '-' + n;
    actualizarFila_('medidores', viejo, { estado: 'retirado', fecha_retiro: fechaCambio, lectura_final: final === null ? '' : final,
      lectura_final_desconocida: final === null }, s.u);
    insertar_('medidores', { medidor_id: nuevoId, unidad_id: viejo.unidad_id, servicio: viejo.servicio, estado: 'activo',
      fecha_instalacion: fechaCambio, lectura_inicial: inicial }, s.u);
    var previa = f.actual ? buscarPor_(cx.lecturas, 'lectura_id', f.actual.lectura_id) : null;
    if (previa) anularRegistro_('lecturas', previa, s.u, 'cambio de medidor');
    var id = siguienteId_('lecturas', 'lectura_id', 'LEC-', 6);
    insertar_('lecturas', { lectura_id: id, periodo: cx.periodo, medidor_id: nuevoId, unidad_id: viejo.unidad_id,
      servicio: viejo.servicio, lectura: lectura, fecha_lectura: fecha, origen: 'manual', es_cambio_medidor: true,
      alertas: '', comentario_alerta: String(d.comentario || '').trim(), estado_revision: '', reemplaza_a: previa ? previa.lectura_id : '' }, s.u);
    registrarLog_(s.u, 'cambio_medidor', 'medidores', nuevoId,
      { medidor: viejo.medidor_id, anterior: anterior },
      { medidor_nuevo: nuevoId, final_retirado: final === null ? 'desconocida' : final, inicial: inicial, lectura: lectura });
    return { medidor_id: nuevoId, lectura_id: id };
  });
}

/** L3: la administradora resuelve una lectura en revisión. d: {lectura_id, modo: 'base' | 'corregir_anterior', valor, motivo} */
function resolverRevision_(s, d) {
  var motivo = String(d.motivo || '').trim();
  if (!motivo) throw ErrorApp_('DATOS', 'Escribe el motivo.');
  return conCandado_(function () {
    var todas = leerLecturas_();
    var l = buscarPor_(todas, 'lectura_id', d.lectura_id);
    if (!l || l.estado_revision !== 'en_revision') throw ErrorApp_('DATOS', 'La lectura no está en revisión.');
    var cx = contextoPeriodo_(l.periodo);
    exigirEditable_(cx);
    var copia = function (cambios) {
      anularRegistro_('lecturas', l, s.u, 'revisión resuelta');
      var id = siguienteId_('lecturas', 'lectura_id', 'LEC-', 6);
      insertar_('lecturas', Object.assign({ lectura_id: id, periodo: l.periodo, medidor_id: l.medidor_id, unidad_id: l.unidad_id,
        servicio: l.servicio, lectura: l.lectura, fecha_lectura: l.fecha_lectura, origen: l.origen,
        es_cambio_medidor: l.es_cambio_medidor === true, alertas: l.alertas, comentario_alerta: l.comentario_alerta,
        reemplaza_a: l.lectura_id }, cambios), s.u);
      return id;
    };
    if (d.modo === 'base') {
      var id = copia({ estado_revision: 'base', comentario_alerta: l.comentario_alerta + ' · Resuelta: este mes queda como base (consumo 0). ' + motivo });
      registrarLog_(s.u, 'resolver_revision', 'lecturas', id, { estado_revision: 'en_revision' }, { estado_revision: 'base' }, motivo);
      return { lectura_id: id };
    }
    if (d.modo === 'corregir_anterior') {
      var valor = numeroIngresado_(d.valor, 'La lectura anterior corregida');
      if (l.lectura < valor) throw ErrorApp_('DATOS', 'Con ese valor la lectura de este mes (' + l.lectura + ') sigue siendo menor. Revisa el número o usa otra opción.');
      var previas = todas.filter(function (x) { return x.medidor_id === l.medidor_id && x.periodo < l.periodo; })
        .sort(function (a, b) { return a.periodo < b.periodo ? -1 : 1; });
      var ant = previas[previas.length - 1];
      if (!ant) throw ErrorApp_('DATOS', 'No hay una lectura anterior registrada para corregir.');
      // D98: un mes confirmado no cambia sin reabrirlo
      if (esConfirmado_(ant.periodo, cx.ultimoConfirmado)) {
        throw ErrorApp_('DATOS', 'La lectura anterior es de ' + ant.periodo + ', que está confirmado: reábrelo para corregirla, ' +
          'o usa "Este mes queda como base (consumo 0)".');
      }
      anularRegistro_('lecturas', ant, s.u, 'corrección por revisión de ' + l.periodo);
      var idAnt = siguienteId_('lecturas', 'lectura_id', 'LEC-', 6);
      insertar_('lecturas', { lectura_id: idAnt, periodo: ant.periodo, medidor_id: ant.medidor_id, unidad_id: ant.unidad_id,
        servicio: ant.servicio, lectura: valor, fecha_lectura: ant.fecha_lectura, origen: ant.origen,
        es_cambio_medidor: ant.es_cambio_medidor === true, alertas: '', comentario_alerta: 'Corregida (antes ' + ant.lectura + '): ' + motivo,
        estado_revision: '', reemplaza_a: ant.lectura_id }, s.u);
      var idNueva = copia({ alertas: '', estado_revision: 'resuelta', comentario_alerta: l.comentario_alerta + ' · Resuelta: se corrigió la lectura anterior.' });
      registrarLog_(s.u, 'corregir_lectura_anterior', 'lecturas', idAnt, { lectura_id: ant.lectura_id, periodo: ant.periodo, lectura: ant.lectura },
        { lectura: valor, periodo_confirmado: ant.periodo <= (cx.ultimoConfirmado || '') }, motivo);
      return { lectura_id: idNueva };
    }
    throw ErrorApp_('DATOS', 'Opción no válida.');
  });
}

function anularLectura_(s, d) {
  var motivo = String(d.motivo || '').trim();
  if (!motivo) throw ErrorApp_('DATOS', 'Escribe el motivo.');
  conCandado_(function () {
    var l = buscarPor_(leerTodasLecturas_(), 'lectura_id', d.lectura_id); // también las de traspaso (D115)
    if (!l) throw ErrorApp_('DATOS', 'Lectura no encontrada.');
    exigirEditable_(contextoPeriodo_(l.periodo));
    anularRegistro_('lecturas', l, s.u, motivo);
    registrarLog_(s.u, 'anular_lectura', 'lecturas', l.lectura_id, { lectura: l.lectura }, { estado: 'anulado' }, motivo);
  });
}

// ---------------------------------------------------------------- Boletas

function boletaVigente_(periodo, servicio) {
  return vigentesDe_('boletas_servicio', periodo).filter(function (b) { return b.servicio === servicio; })[0] || null;
}

function datosBoletas_(s, d) {
  var cx = contextoPeriodo_(d.periodo);
  var r = { periodo: cx.periodo, periodos: cx.periodos, estadosPeriodos: cx.estados, estado: cx.estado, editable: cx.editable && s.r !== 'solo_lectura', esAdmin: s.r === 'administradora' };
  ['luz', 'agua'].forEach(function (sv) {
    var b = boletaVigente_(cx.periodo, sv), prev = boletaVigente_(sumarMesesPeriodo(cx.periodo, -1), sv);
    r[sv] = b ? { monto_total: b.monto_total, consumo_total: b.consumo_total, calculado: b.costo_unitario_calculado,
      usado: b.costo_unitario_usado, motivo_ajuste: b.motivo_ajuste, ajustado_por: b.ajustado_por } : null;
    r[sv + 'Anterior'] = prev ? Number(prev.costo_unitario_usado) : null;
    r[sv + 'Variacion'] = b && prev ? variacionCosto(Number(b.costo_unitario_usado), Number(prev.costo_unitario_usado), cx.p.alerta_costo_unitario_variacion) : null;
  });
  return r;
}

function guardarBoleta_(s, d) {
  if (['luz', 'agua'].indexOf(d.servicio) === -1) throw ErrorApp_('DATOS', 'Servicio no válido.');
  var monto = numeroIngresado_(d.monto_total, 'El monto');
  if (!Number.isInteger(monto)) throw ErrorApp_('DATOS', 'El monto debe ser un número entero en pesos.');
  var consumo = numeroIngresado_(d.consumo_total, 'El consumo');
  if (!(consumo > 0)) throw ErrorApp_('DATOS', 'El consumo total debe ser mayor que 0.');
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    asegurarCierre_(cx, s.u);
    var previa = boletaVigente_(cx.periodo, d.servicio);
    if (previa) anularRegistro_('boletas_servicio', previa, s.u, 'corregida');
    var costo = costoUnitario(monto, consumo);
    var id = siguienteId_('boletas_servicio', 'boleta_id', 'BOL-', 6);
    insertar_('boletas_servicio', { boleta_id: id, periodo: cx.periodo, servicio: d.servicio, monto_total: monto,
      consumo_total: consumo, costo_unitario_calculado: costo, costo_unitario_usado: costo, reemplaza_a: previa ? previa.boleta_id : '' }, s.u);
    if (previa) registrarLog_(s.u, 'corregir_boleta', 'boletas_servicio', id,
      { monto_total: previa.monto_total, consumo_total: previa.consumo_total, costo_unitario_usado: previa.costo_unitario_usado },
      { monto_total: monto, consumo_total: consumo, costo_unitario_usado: costo });
    return { boleta_id: id, ajusteReiniciado: !!(previa && previa.ajustado_por) };
  });
}

/** D14: solo la administradora, con motivo. */
function ajustarCosto_(s, d) {
  var costo = numeroIngresado_(d.costo, 'El costo unitario');
  if (!(costo > 0)) throw ErrorApp_('DATOS', 'El costo unitario debe ser mayor que 0.');
  var motivo = String(d.motivo || '').trim();
  if (!motivo) throw ErrorApp_('DATOS', 'Escribe el motivo del ajuste.');
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    var b = boletaVigente_(cx.periodo, d.servicio);
    if (!b) throw ErrorApp_('DATOS', 'Primero ingresa la boleta.');
    anularRegistro_('boletas_servicio', b, s.u, 'ajuste de costo unitario');
    var id = siguienteId_('boletas_servicio', 'boleta_id', 'BOL-', 6);
    insertar_('boletas_servicio', { boleta_id: id, periodo: cx.periodo, servicio: b.servicio, monto_total: b.monto_total,
      consumo_total: b.consumo_total, costo_unitario_calculado: b.costo_unitario_calculado, costo_unitario_usado: costo,
      motivo_ajuste: motivo, ajustado_por: s.u, ajustado_en: new Date(), reemplaza_a: b.boleta_id }, s.u);
    registrarLog_(s.u, 'ajustar_costo', 'boletas_servicio', id, { costo_unitario_usado: b.costo_unitario_usado },
      { costo_unitario_usado: costo, costo_unitario_calculado: b.costo_unitario_calculado }, motivo);
    return { boleta_id: id };
  });
}

// ---------------------------------------------------------------- Gastos comunes y divisor

function gastosDelPeriodo_(cx, fichas) {
  var gastos = vigentesDe_('gastos_comunes', cx.periodo);
  var previos = vigentesDe_('gastos_comunes', sumarMesesPeriodo(cx.periodo, -1));
  // Activos + los que tengan monto guardado este mes aunque se hayan dado de baja después (meses pasados)
  var activos = conceptosFijos_();
  var conceptos = activos.concat(gastos.map(function (x) { return x.concepto; })
    .filter(function (c, i, a) { return c !== CONCEPTO_EXTRA && activos.indexOf(c) === -1 && a.indexOf(c) === i; }));
  var fijos = conceptos.map(function (c) {
    var g = gastos.filter(function (x) { return x.concepto === c; })[0];
    var p = previos.filter(function (x) { return x.concepto === c; })[0];
    return { concepto: c, gasto_id: g ? g.gasto_id : null, monto: g ? Number(g.monto) : null, anterior: p ? Number(p.monto) : null,
      activo: activos.indexOf(c) !== -1 };
  });
  var extras = gastos.filter(function (x) { return x.concepto === CONCEPTO_EXTRA; })
    .map(function (x) { return { gasto_id: x.gasto_id, monto: Number(x.monto), glosa: x.glosa, creado_por: x.creado_por }; });
  var consumos = consumosPorUnidad_(fichas);
  var calles = { luz: 0, agua: 0 };
  CALLES.forEach(function (u) { if (consumos[u]) { calles.luz += consumos[u].luz || 0; calles.agua += consumos[u].agua || 0; } });
  var costo = {};
  ['luz', 'agua'].forEach(function (sv) { var b = boletaVigente_(cx.periodo, sv); costo[sv] = b ? Number(b.costo_unitario_usado) : null; });
  var divisor = divisorDe_(cx);
  var gc = calcularGC(fijos.map(function (f) { return f.monto || 0; }), extras.map(function (e) { return e.monto; }), calles, costo, divisor.usado);
  return { fijos: fijos, extras: extras, consumoCalles: calles, costo: costo, divisor: divisor, gc: gc, consumos: consumos };
}

function datosGastos_(s, d) {
  var cx = contextoPeriodo_(d.periodo);
  var g = gastosDelPeriodo_(cx, fichas_(cx));
  return { periodo: cx.periodo, periodos: cx.periodos, estadosPeriodos: cx.estados, estado: cx.estado, editable: cx.editable && s.r !== 'solo_lectura', esAdmin: s.r === 'administradora',
    fijos: g.fijos, extras: g.extras, consumoCalles: g.consumoCalles, costo: g.costo, divisor: g.divisor, gc: g.gc,
    gcProporcional: cx.gcProporcional,
    pagan: cx.pagan.map(function (u) { return nombreUnidad_(cx, u); }),
    // D94: dentro del divisor sin pagar (vacías o exentas) → absorbe la administración; pagan sin estar en el divisor → aviso
    absorbe: cx.enDivisor.filter(function (u) { return cx.pagan.indexOf(u) === -1; }).map(function (u) { return nombreUnidad_(cx, u); }),
    fueraDivisor: cx.pagan.filter(function (u) { return cx.enDivisor.indexOf(u) === -1; }).map(function (u) { return nombreUnidad_(cx, u); }) };
}

/** d: {periodo, montos: {concepto: monto}} — solo guarda lo que cambió. */
function guardarGastosFijos_(s, d) {
  var montos = d.montos || {};
  var limpios = {};
  conceptosFijos_().forEach(function (c) {
    if (montos[c] === undefined || String(montos[c]).trim() === '') return;
    var n = numeroIngresado_(String(montos[c]).replace(/\./g, ''), c);
    if (!Number.isInteger(n)) throw ErrorApp_('DATOS', c + ': el monto debe ser un número entero en pesos.');
    limpios[c] = n;
  });
  if (!Object.keys(limpios).length) throw ErrorApp_('DATOS', 'Ingresa al menos un monto.');
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    asegurarCierre_(cx, s.u);
    var gastos = vigentesDe_('gastos_comunes', cx.periodo);
    var guardados = 0;
    Object.keys(limpios).forEach(function (c) {
      var g = gastos.filter(function (x) { return x.concepto === c; })[0];
      if (g && Number(g.monto) === limpios[c]) return;
      if (g) anularRegistro_('gastos_comunes', g, s.u, 'corregido');
      insertar_('gastos_comunes', { gasto_id: siguienteId_('gastos_comunes', 'gasto_id', 'GC-', 6), periodo: cx.periodo,
        concepto: c, monto: limpios[c], glosa: '', reemplaza_a: g ? g.gasto_id : '' }, s.u);
      guardados++;
    });
    return { guardados: guardados };
  });
}

/** D77: el gasto fijo deja de serlo desde este período (solo administradora). Si ya tenía monto este mes, se anula. */
function darDeBajaGastoFijo_(s, d) {
  var concepto = String(d.concepto || '');
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    var fila = leerTabla_('catalogos').filter(function (c) { return c.tipo === 'concepto_gc' && c.valor === concepto && c.activo === true; })[0];
    if (!fila || concepto === CONCEPTO_EXTRA) throw ErrorApp_('DATOS', 'Gasto fijo no encontrado.');
    actualizarFila_('catalogos', fila, { activo: false }, s.u);
    var g = vigentesDe_('gastos_comunes', cx.periodo).filter(function (x) { return x.concepto === concepto; })[0];
    if (g) anularRegistro_('gastos_comunes', g, s.u, 'gasto fijo dado de baja');
    registrarLog_(s.u, 'baja_gasto_fijo', 'catalogos', concepto, { activo: true }, { activo: false, desde: cx.periodo,
      monto_anulado: g ? Number(g.monto) : '' }, d.motivo || '');
    return { concepto: concepto };
  });
}

/** D77: agrega un gasto fijo nuevo o reactiva uno dado de baja (solo administradora). */
function nuevoGastoFijo_(s, d) {
  var nombre = String(d.nombre || '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 2) throw ErrorApp_('DATOS', 'Escribe el nombre del gasto fijo.');
  if (nombre.toLowerCase() === CONCEPTO_EXTRA.toLowerCase()) throw ErrorApp_('DATOS', 'Ese nombre está reservado para los gastos extraordinarios.');
  return conCandado_(function () {
    var cat = leerTabla_('catalogos').filter(function (c) { return c.tipo === 'concepto_gc'; });
    var existente = cat.filter(function (c) { return String(c.valor).toLowerCase() === nombre.toLowerCase(); })[0];
    if (existente) {
      if (existente.activo === true) throw ErrorApp_('DATOS', 'Ese gasto fijo ya está activo.');
      actualizarFila_('catalogos', existente, { activo: true }, s.u);
      registrarLog_(s.u, 'reactivar_gasto_fijo', 'catalogos', existente.valor, { activo: false }, { activo: true });
      return { concepto: existente.valor, reactivado: true };
    }
    var orden = cat.reduce(function (m, c) { return Math.max(m, Number(c.orden) || 0); }, 0) + 1;
    insertar_('catalogos', { tipo: 'concepto_gc', valor: nombre, activo: true, orden: orden }, s.u);
    registrarLog_(s.u, 'nuevo_gasto_fijo', 'catalogos', nombre, '', { valor: nombre });
    return { concepto: nombre, reactivado: false };
  });
}

function agregarExtraordinario_(s, d) {
  var monto = numeroIngresado_(String(d.monto || '').replace(/\./g, ''), 'El monto');
  if (!Number.isInteger(monto) || monto === 0) throw ErrorApp_('DATOS', 'El monto debe ser un número entero en pesos.');
  var glosa = String(d.glosa || '').trim();
  if (!glosa) throw ErrorApp_('DATOS', 'Escribe la glosa (ej. "Juegos inflables").');
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    asegurarCierre_(cx, s.u);
    var id = siguienteId_('gastos_comunes', 'gasto_id', 'GC-', 6);
    insertar_('gastos_comunes', { gasto_id: id, periodo: cx.periodo, concepto: CONCEPTO_EXTRA, monto: monto, glosa: glosa }, s.u);
    return { gasto_id: id };
  });
}

function anularGasto_(s, d) {
  var motivo = String(d.motivo || '').trim();
  if (!motivo) throw ErrorApp_('DATOS', 'Escribe el motivo.');
  conCandado_(function () {
    var g = leerTabla_('gastos_comunes').filter(function (x) { return x.gasto_id === d.gasto_id && x.estado !== 'anulado'; })[0];
    if (!g) throw ErrorApp_('DATOS', 'Gasto no encontrado.');
    exigirEditable_(contextoPeriodo_(String(g.periodo)));
    anularRegistro_('gastos_comunes', g, s.u, motivo);
    registrarLog_(s.u, 'anular_gasto', 'gastos_comunes', g.gasto_id, { concepto: g.concepto, monto: g.monto }, { estado: 'anulado' }, motivo);
  });
}

/** D05: cualquier usuario, con motivo. Si se vuelve al valor calculado, el divisor sigue al cálculo. */
function ajustarDivisor_(s, d) {
  var n = Number(d.n);
  if (!Number.isInteger(n) || n <= 0) throw ErrorApp_('DATOS', 'El número de locales debe ser un número entero mayor que 0.');
  var motivo = String(d.motivo || '').trim();
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    asegurarCierre_(cx, s.u);
    var antes = divisorDe_(cx);
    var vuelve = n === cx.enDivisor.length;
    if (!vuelve && !motivo) throw ErrorApp_('DATOS', 'Escribe el motivo del ajuste.');
    var fila = leerTabla_('cierres').filter(function (x) { return String(x.periodo) === cx.periodo; })[0];
    actualizarFila_('cierres', fila, { n_locales_gc_calculado: cx.enDivisor.length, n_locales_gc_usado: n,
      motivo_ajuste_gc: vuelve ? '' : motivo, ajuste_gc_por: vuelve ? '' : s.u, ajuste_gc_en: vuelve ? '' : new Date() }, s.u);
    registrarLog_(s.u, 'ajustar_divisor', 'cierres', cx.periodo, { usado: antes.usado }, { usado: n, calculado: cx.enDivisor.length }, motivo);
    return { usado: n };
  });
}

// ---------------------------------------------------------------- Resumen y panel

function resumen_(s, d) {
  var cx = contextoPeriodo_(d.periodo);
  var fichas = fichas_(cx);
  var g = gastosDelPeriodo_(cx, fichas);
  var cuotas = cx.gcProporcional ? cuotasGCProporcional(cx.contratos, cx.periodo, g.gc.cuota) : null;
  var filas = cx.unidades.slice().sort(function (a, b) { return a.orden - b.orden; }).map(function (u) {
    var c = g.consumos[u.unidad_id] || {};
    var paga = cx.pagan.indexOf(u.unidad_id) !== -1;
    var partes = cuotas ? cuotas[u.unidad_id] || [] : null;
    var cuota = !paga ? null : !partes ? g.gc.cuota : g.gc.cuota === null ? null
      : partes.reduce(function (a, x) { return a + x.monto; }, 0);
    // 2.1: si alguien pagó solo parte del mes, se muestra cuántos días pagó cada uno
    var detalle = partes && (partes.length > 1 || (partes[0] && partes[0].dias < partes[0].diasMes)) ? partes.map(function (x) {
      var l = buscarPor_(cx.locatarios, 'locatario_id', x.locatario_id);
      return { locatario: l ? l.razon_social : '', dias: x.dias, diasMes: x.diasMes, monto: x.monto };
    }) : null;
    return { unidad_id: u.unidad_id, unidad: u.nombre, locatario: locatarioEnMes_(cx, u.unidad_id), esCalle: CALLES.indexOf(u.unidad_id) !== -1,
      consumoLuz: c.luz === undefined ? null : c.luz, consumoAgua: c.agua === undefined ? null : c.agua,
      gastoLuz: c.luz === undefined || g.costo.luz === null ? null : c.luz * g.costo.luz,
      gastoAgua: c.agua === undefined || g.costo.agua === null ? null : c.agua * g.costo.agua,
      pagaGC: paga, cuotaGC: cuota, detalleGC: detalle, detalleConsumo: detalleConsumo_(cx, fichas, u.unidad_id, g.costo) };
  });
  // 2.3 (D117): arriendo, otros y total de cada local salen del mismo cálculo de las boletas; orden agrupado por locatario
  var b = boletasDelPeriodo_(cx.periodo, { cx: cx, fichas: fichas, g: g });
  var porUnidad = {}, totalLocatario = {};
  b.boletas.forEach(function (bo) {
    totalLocatario[bo.locatario_id] = bo.total;
    bo.secciones.forEach(function (sc) {
      var x = porUnidad[sc.unidad_id] = porUnidad[sc.unidad_id] || { arriendo: null, otros: 0, total: 0 };
      if (sc.totales.arriendo !== null) x.arriendo = (x.arriendo || 0) + sc.totales.arriendo;
      x.otros += sc.totales.otros; x.total += sc.totales.total;
    });
  });
  filas.forEach(function (f) {
    var x = porUnidad[f.unidad_id];
    f.arriendo = x ? x.arriendo : null; f.otros = x ? x.otros : null; f.total = x ? x.total : null;
    var c = cx.contratos.filter(function (k) { return k.unidad_id === f.unidad_id && k.estado !== 'anulado' && seTraslapan(rangoDelMes(cx.periodo), k); })
      .sort(function (a, z) { return z.fecha_inicio - a.fecha_inicio; })[0];
    f.locatario_id = c ? c.locatario_id : '';
    f.totalLocatario = c ? totalLocatario[c.locatario_id] || null : null;
  });
  var orden = ordenAgrupado(cx.unidades.map(function (u) {
    var f = filas.filter(function (x) { return x.unidad_id === u.unidad_id; })[0];
    return { unidad_id: u.unidad_id, orden: Number(u.orden), locatario_id: f && f.total !== null ? f.locatario_id : '' };
  }));
  orden.forEach(function (o, i) {
    var f = filas.filter(function (x) { return x.unidad_id === o.unidad_id; })[0];
    if (f) { f.posicion = i; f.grupo = o.grupo; }
  });
  return { periodo: cx.periodo, gcProporcional: cx.gcProporcional, periodos: cx.periodos, estadosPeriodos: cx.estados, estado: cx.estado, costo: g.costo, gc: g.gc, divisor: g.divisor,
    fijos: g.fijos, extras: g.extras, consumoCalles: g.consumoCalles, filas: filas, avisosBoletas: b.avisos };
}

/** D115: reparto de luz y agua entre locatarios de una unidad con cambio en el mes; null si no hay. */
function detalleConsumo_(cx, fichas, unidadId, costo) {
  var r = [];
  fichas.filter(function (f) { return f.unidad_id === unidadId; }).forEach(function (f) {
    var rep = repartoFicha_(cx, f);
    if (!rep || !rep.tramos) return;
    r.push({ servicio: f.servicio, partes: rep.tramos.map(function (t) {
      return { locatario: t.locatario, consumo: t.consumo, estimado: t.estimado, vacio: t.vacio,
        monto: costo[f.servicio] === null ? null : t.consumo * costo[f.servicio] };
    }) });
  });
  return r.length ? r : null;
}

function revisionDe_(cx, fichas, confirmadosCero) {
  var g = gastosDelPeriodo_(cx, fichas);
  var conLectura = {};
  fichas.forEach(function (f) { if (f.actual) conLectura[f.unidad_id + '|' + f.servicio] = true; });
  var callesSin = [];
  CALLES.forEach(function (u) {
    ['luz', 'agua'].forEach(function (sv) { if (!conLectura[u + '|' + sv]) callesSin.push(nombreUnidad_(cx, u) + ' (' + sv + ')'); });
  });
  var sinLectura = cx.conContrato.filter(function (u) {
    return CALLES.indexOf(u) === -1 && (!conLectura[u + '|luz'] || !conLectura[u + '|agua']);
  });
  // D96: cuáles lecturas están en revisión, para nombrarlas y enlazarlas
  var enRev = fichas.filter(function (f) { return f.actual && f.actual.revision === 'en_revision'; }).map(function (f) {
    var baja = f.anterior && f.actual.valor < f.anterior.valor;
    var n = function (x) { return String(x).replace('.', ','); };
    return { medidor_id: f.medidor_id, servicio: f.servicio,
      texto: nombreUnidad_(cx, f.unidad_id) + ' · ' + f.servicio + (baja ? ' (bajó de ' + n(f.anterior.valor) + ' a ' + n(f.actual.valor) + ')' : '') };
  });
  var r = revisarParaConfirmar({
    boletas: { luz: !!boletaVigente_(cx.periodo, 'luz'), agua: !!boletaVigente_(cx.periodo, 'agua') },
    callesSinLectura: callesSin, enRevision: enRev.length, revisiones: enRev.map(function (x) { return x.texto; }),
    fijos: g.fijos.filter(function (f) { return f.monto !== null; }).length, divisor: g.divisor.usado,
    sinLectura: sinLectura, confirmadosCero: confirmadosCero || [],
  });
  r.sinLectura = sinLectura.map(function (u) {
    return { unidad_id: u, unidad: nombreUnidad_(cx, u), locatario: locatarioEnMes_(cx, u),
      falta: ['luz', 'agua'].filter(function (sv) { return !conLectura[u + '|' + sv]; }) };
  });
  r.gc = g.gc; r.divisor = g.divisor; r.revisiones = enRev;
  // D115: falta de lectura de traspaso = aviso (se estima por días), no bloquea
  r.avisosTraspaso = [];
  fichas.forEach(function (f) {
    var rep = repartoFicha_(cx, f);
    if (rep && rep.faltan) r.avisosTraspaso.push({ medidor_id: f.medidor_id, servicio: f.servicio,
      texto: nombreUnidad_(cx, f.unidad_id) + ' · ' + f.servicio + ': falta la lectura de traspaso; el consumo se reparte estimado por días.' });
  });
  return r;
}

function panelCierre_(s, d) {
  var cx = contextoPeriodo_(d.periodo);
  var fichas = fichas_(cx);
  var esperadas = fichas.filter(function (f) { return CALLES.indexOf(f.unidad_id) !== -1 || cx.conContrato.indexOf(f.unidad_id) !== -1; });
  var rev = revisionDe_(cx, fichas, []);
  var g = gastosDelPeriodo_(cx, fichas);
  return {
    periodo: cx.periodo, periodos: cx.periodos, estadosPeriodos: cx.estados, estado: cx.estado, editable: cx.editable && s.r !== 'solo_lectura', enCurso: cx.enCurso,
    ultimoConfirmado: cx.ultimoConfirmado, esAdmin: s.r === 'administradora',
    boletas: { luz: !!boletaVigente_(cx.periodo, 'luz'), agua: !!boletaVigente_(cx.periodo, 'agua') },
    lecturas: { hechas: esperadas.filter(function (f) { return f.actual; }).length, esperadas: esperadas.length },
    enRevision: fichas.filter(function (f) { return f.actual && f.actual.revision === 'en_revision'; }).length,
    fijos: g.fijos.filter(function (f) { return f.monto !== null; }).length, extras: g.extras.length,
    divisor: g.divisor, gc: g.gc, bloqueos: rev.bloqueos, sinLectura: rev.sinLectura, revisiones: rev.revisiones,
    avisosTraspaso: rev.avisosTraspaso,
    confirmado: cx.cierre && cx.estado === 'confirmado' ? { por: nombreUsuario_(cx.cierre.confirmado_por), en: cx.cierre.confirmado_en } : null,
  };
}

function nombreUsuario_(id) {
  if (id === 'carga_inicial') return 'carga inicial';
  var u = buscarPor_(leerTabla_('usuarios'), 'usuario_id', id);
  return u ? u.nombre : id;
}

// ---------------------------------------------------------------- Confirmar y reabrir (administradora)

function confirmarCierre_(s, d) {
  return conCandado_(function () {
    var cx = contextoPeriodo_(d.periodo);
    exigirEditable_(cx);
    var fichas = fichas_(cx);
    var r = revisionDe_(cx, fichas, d.consumoCero || []);
    if (r.bloqueos.length) throw ErrorApp_('NO_CONFIRMABLE', 'No se puede confirmar: ' + r.bloqueos.join(' '));
    if (r.pendientesCero.length) throw ErrorApp_('FALTA_CONSUMO_CERO', 'Marca "Confirmo consumo 0" para cada unidad sin lectura.');
    var c = asegurarCierre_(cx, s.u);
    var fila = leerTabla_('cierres').filter(function (x) { return String(x.periodo) === cx.periodo; })[0];
    actualizarFila_('cierres', fila, { estado: 'confirmado', n_locales_gc_calculado: cx.enDivisor.length, n_locales_gc_usado: r.divisor.usado,
      confirmado_por: s.u, confirmado_en: new Date() }, s.u);
    registrarLog_(s.u, 'confirmar_cierre', 'cierres', cx.periodo, { estado: c.estado },
      { estado: 'confirmado', divisor_usado: r.divisor.usado, divisor_calculado: cx.enDivisor.length, total_gc: Math.round(r.gc.total),
        consumo_cero: (d.consumoCero || []).join(',') });
    return { periodo: cx.periodo };
  });
}

function reabrirCierre_(s, d) {
  var motivo = String(d.motivo || '').trim();
  if (!motivo) throw ErrorApp_('DATOS', 'Escribe el motivo de la reapertura.');
  return conCandado_(function () {
    var fila = leerTabla_('cierres').filter(function (x) { return String(x.periodo) === d.periodo; })[0];
    if (!fila || fila.estado !== 'confirmado') throw ErrorApp_('DATOS', 'Ese período no está confirmado.');
    actualizarFila_('cierres', fila, { estado: 'reabierto', reabierto_por: s.u, reabierto_en: new Date(), motivo_reapertura: motivo }, s.u);
    registrarLog_(s.u, 'reabrir_cierre', 'cierres', d.periodo, { estado: 'confirmado' }, { estado: 'reabierto' }, motivo);
    return { periodo: d.periodo };
  });
}
