/**
 * Sub-etapa 1.5: cargos/descuentos (hoja `movimientos`) y pagos/abonos (hoja `pagos`).
 * Solo registra; los saldos se calculan en la etapa 2.
 *
 * M1 anular: la administradora siempre; una digitadora lo que ella ingresó, el mismo día. Con motivo.
 * M2 cargos en un período ya confirmado: solo la administradora, con motivo.
 * M4 el cargo se asocia al contrato del local en el período, o al último terminado (con aviso).
 */

function leerMovimientos_() {
  return leerTabla_('movimientos').map(function (m) {
    m.periodo_aplica = String(m.periodo_aplica); m.monto = Number(m.monto); m.fecha = fechaOVacio_(m.fecha);
    return m;
  });
}

function leerPagos_() {
  return leerTabla_('pagos').map(function (p) {
    p.periodo_aplica = p.periodo_aplica === '' ? '' : String(p.periodo_aplica); p.monto = Number(p.monto);
    p.fecha_pago = fechaOVacio_(p.fecha_pago); p.referencia = String(p.referencia || '');
    return p;
  });
}

function catalogo_(tipo) {
  return leerTabla_('catalogos').filter(function (x) { return x.tipo === tipo && x.activo === true; })
    .sort(function (a, b) { return a.orden - b.orden; }).map(function (x) { return x.valor; });
}

function montoPositivo_(v, nombre) {
  var n = Number(String(v === undefined || v === null ? '' : v).replace(/[.\s$]/g, ''));
  if (!Number.isInteger(n) || n <= 0) throw ErrorApp_('DATOS', nombre + ' debe ser un número entero mayor que 0.');
  return n;
}

/** Datos comunes de las dos pantallas: unidades con su locatario actual, períodos y nombres de usuarias. */
function baseMovimientos_(s) {
  precargarTablas_(['cierres', 'contratos', 'locatarios', 'usuarios', 'unidades', 'catalogos', 'movimientos', 'pagos']);
  var hoy = hoy_();
  var ultimo = ultimoConfirmado_();
  var enCurso = periodoEnCurso(ultimo, periodoDe(hoy));
  var contratos = leerContratos_();
  var locatarios = {}, ocultos = [];
  leerTabla_('locatarios').forEach(function (l) { locatarios[l.locatario_id] = l.razon_social; if (l.oculto === true) ocultos.push(l.locatario_id); });
  var usuarios = { carga_inicial: 'carga inicial', sistema: 'sistema' };
  leerTabla_('usuarios').forEach(function (u) { usuarios[u.usuario_id] = u.nombre; });
  var unidades = leerTabla_('unidades').filter(function (u) { return u.tipo !== 'calle'; })
    .sort(function (a, b) { return a.orden - b.orden; }).map(function (u) {
      var r = contratoParaMovimiento(contratos, u.unidad_id, enCurso);
      return { unidad_id: u.unidad_id, nombre: u.nombre, locatario: r ? locatarios[r.contrato.locatario_id] : '',
        locatario_id: r ? r.contrato.locatario_id : '', terminado: r ? r.terminado : null };
    });
  var periodos = [];
  for (var i = -12; i <= 12; i++) periodos.push(sumarMesesPeriodo(enCurso, i));
  return { hoy: textoDeFecha(hoy), enCurso: enCurso, ultimoConfirmado: ultimo, esAdmin: s.r === 'administradora', yo: s.u,
    unidades: unidades, locatarios: locatarios, locatariosOcultos: ocultos, usuarios: usuarios, periodos: periodos };
}

// ---------------------------------------------------------------- Cargos / descuentos

function datosMovimientos_(s) {
  var b = baseMovimientos_(s);
  var hoy = hoy_();
  b.categorias = catalogo_('categoria_movimiento');
  b.movimientos = leerMovimientos_().map(function (m) {
    return { mov_id: m.mov_id, fecha: textoDeFecha(m.fecha), periodo_aplica: m.periodo_aplica, unidad_id: m.unidad_id,
      contrato_id: m.contrato_id, categoria: m.categoria, monto: m.monto, glosa: m.glosa, grupo_cuotas: m.grupo_cuotas,
      cuota_n: m.cuota_n, cuota_total: m.cuota_total, estado: m.estado, creado_por: b.usuarios[m.creado_por] || m.creado_por,
      creado_en: m.creado_en, motivo_anulacion: m.motivo_anulacion, puedeAnular: m.estado !== 'anulado' && puedeAnular(m, s.u, s.r, hoy) };
  });
  return b;
}

/** Contrato para el formulario (M4), antes de guardar. */
function contratoMovimiento_(s, d) {
  var r = contratoParaMovimiento(leerContratos_(), d.unidad_id, String(d.periodo_aplica));
  if (!r) return { contrato_id: null, aviso: 'Este local no tenía contrato en ese período ni antes: no se le puede cargar.' };
  var l = buscarPor_(leerTabla_('locatarios'), 'locatario_id', r.contrato.locatario_id);
  return { contrato_id: r.contrato.contrato_id, locatario: l ? l.razon_social : '', terminado: r.terminado,
    aviso: r.terminado ? 'El local no tiene contrato vigente en ese período: el cargo quedará asociado al último contrato, que terminó el ' +
      fechaParaMensaje(r.contrato.fecha_fin) + ' (' + (l ? l.razon_social : '') + ').' : null };
}

/** d: {unidad_id, tipo: 'cargo'|'descuento', categoria, monto, glosa, periodo_aplica, fecha, cuotas, motivo} */
function crearMovimiento_(s, d) {
  if (['cargo', 'descuento'].indexOf(d.tipo) === -1) throw ErrorApp_('DATOS', 'Elige si es cargo o descuento.');
  if (catalogo_('categoria_movimiento').indexOf(d.categoria) === -1) throw ErrorApp_('DATOS', 'Elige la categoría.');
  var total = montoPositivo_(d.monto, 'El monto');
  var glosa = String(d.glosa || '').trim();
  if (!glosa) throw ErrorApp_('DATOS', 'Escribe la glosa: es el texto que verá el locatario.');
  var periodo = String(d.periodo_aplica || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw ErrorApp_('DATOS', 'Elige el período al que aplica.');
  var fecha = d.fecha ? fechaDeTexto(d.fecha) : hoy_();
  if (!fecha) throw ErrorApp_('DATOS', 'La fecha no es válida.');
  var n = d.cuotas ? Number(d.cuotas) : 1;
  if (!Number.isInteger(n) || n < 1 || n > 36) throw ErrorApp_('DATOS', 'El número de cuotas debe estar entre 2 y 36.');
  var motivo = String(d.motivo || '').trim();

  return conCandado_(function () {
    if (esConfirmado_(periodo, ultimoConfirmado_())) exigirRetroactivo_(s, motivo, 'Un cargo en ' + periodo);
    var contratos = leerContratos_();
    var signo = d.tipo === 'descuento' ? -1 : 1;
    var montos = n > 1 ? dividirEnCuotas(total, n) : [total];
    var grupo = n > 1 ? 'GRP-' + siguienteId_('movimientos', 'mov_id', 'MOV-', 6).slice(4) : '';
    // Validar todas las cuotas antes de escribir la primera
    var asociados = montos.map(function (monto, i) {
      var p = sumarMesesPeriodo(periodo, i);
      var r = contratoParaMovimiento(contratos, d.unidad_id, p);
      if (!r) throw ErrorApp_('DATOS', 'El local no tenía contrato en ' + p + ' ni antes: no se le puede cargar.');
      return r;
    });
    var ids = [];
    montos.forEach(function (monto, i) {
      var p = sumarMesesPeriodo(periodo, i);
      var r = asociados[i];
      var id = siguienteId_('movimientos', 'mov_id', 'MOV-', 6);
      insertar_('movimientos', { mov_id: id, fecha: fecha, periodo_aplica: p, unidad_id: d.unidad_id, contrato_id: r.contrato.contrato_id,
        categoria: d.categoria, monto: signo * monto, glosa: n > 1 ? 'Cuota ' + (i + 1) + '/' + n + ' ' + glosa : glosa,
        grupo_cuotas: grupo, cuota_n: n > 1 ? i + 1 : '', cuota_total: n > 1 ? n : '' }, s.u);
      ids.push(id);
    });
    registrarLog_(s.u, n > 1 ? 'crear_plan_cuotas' : 'crear_movimiento', 'movimientos', ids.join(','), '',
      { unidad_id: d.unidad_id, monto_total: signo * total, cuotas: n, desde: periodo, glosa: glosa }, motivo);
    return { ids: ids };
  });
}

/** d: {mov_id, motivo, restoPlan}. restoPlan anula también las cuotas siguientes que no estén en un período confirmado. */
function anularMovimiento_(s, d) {
  var motivo = String(d.motivo || '').trim();
  if (!motivo) throw ErrorApp_('DATOS', 'Escribe el motivo.');
  return conCandado_(function () {
    var todos = leerMovimientos_();
    var m = buscarPor_(todos, 'mov_id', d.mov_id);
    if (!m || m.estado === 'anulado') throw ErrorApp_('DATOS', 'Registro no encontrado.');
    var ultimo = ultimoConfirmado_();
    var aAnular = [m];
    if (d.restoPlan && m.grupo_cuotas) {
      aAnular = todos.filter(function (x) {
        return x.grupo_cuotas === m.grupo_cuotas && x.estado !== 'anulado' && Number(x.cuota_n) >= Number(m.cuota_n) &&
          !esConfirmado_(x.periodo_aplica, ultimo);
      });
      if (!aAnular.length) throw ErrorApp_('DATOS', 'No quedan cuotas del plan fuera de períodos confirmados.');
    }
    var hoy = hoy_();
    aAnular.forEach(function (x) {
      if (!puedeAnular(x, s.u, s.r, hoy)) {
        throw ErrorApp_('SIN_PERMISO', 'Solo puedes anular lo que ingresaste hoy. Pídeselo a la administradora.');
      }
    });
    aAnular.forEach(function (x) {
      anularRegistro_('movimientos', x, s.u, motivo);
    });
    registrarLog_(s.u, 'anular_movimiento', 'movimientos', aAnular.map(function (x) { return x.mov_id; }).join(','),
      { monto: aAnular.reduce(function (a, x) { return a + x.monto; }, 0) }, { estado: 'anulado' }, motivo);
    return { anulados: aAnular.length };
  });
}

// ---------------------------------------------------------------- Pagos / abonos

function datosPagos_(s) {
  var b = baseMovimientos_(s);
  var hoy = hoy_();
  b.medios = catalogo_('medio_pago');
  b.pagos = leerPagos_().map(function (p) {
    return { pago_id: p.pago_id, fecha_pago: textoDeFecha(p.fecha_pago), unidad_id: p.unidad_id, locatario_id: p.locatario_id,
      periodo_aplica: p.periodo_aplica, monto: p.monto, medio: p.medio, referencia: p.referencia, glosa: p.glosa,
      estado: p.estado, creado_por: b.usuarios[p.creado_por] || p.creado_por, creado_en: p.creado_en,
      motivo_anulacion: p.motivo_anulacion, puedeAnular: p.estado !== 'anulado' && puedeAnular(p, s.u, s.r, hoy) };
  });
  return b;
}

/** d: {unidad_id, locatario_id?, fecha_pago, monto, medio, referencia, periodo_aplica?, glosa, confirmarDuplicado} */
function crearPago_(s, d) {
  var monto = montoPositivo_(d.monto, 'El monto');
  var fecha = fechaDeTexto(d.fecha_pago);
  if (!fecha) throw ErrorApp_('DATOS', 'La fecha de pago no es válida.');
  if (fecha > hoy_()) throw ErrorApp_('DATOS', 'La fecha de pago no puede ser futura.');
  var medios = catalogo_('medio_pago');
  var medio = d.medio || 'Transferencia';
  if (medios.indexOf(medio) === -1) throw ErrorApp_('DATOS', 'Elige el medio de pago.');
  var periodo = String(d.periodo_aplica || '');
  if (periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw ErrorApp_('DATOS', 'Período no válido.');

  return conCandado_(function () {
    var contratos = leerContratos_();
    var r = contratoParaMovimiento(contratos, d.unidad_id, periodo || periodoDe(fecha));
    var locatarioId = d.locatario_id || (r ? r.contrato.locatario_id : '');
    if (!locatarioId) throw ErrorApp_('DATOS', 'Este local no tiene ni tuvo contrato: elige quién pagó.');
    if (!buscarPor_(leerTabla_('locatarios'), 'locatario_id', locatarioId)) throw ErrorApp_('DATOS', 'Locatario no encontrado.');
    var nuevo = { unidad_id: d.unidad_id, monto: monto, referencia: String(d.referencia || '').trim() };
    var dup = pagoDuplicado(leerPagos_(), nuevo);
    if (dup && !d.confirmarDuplicado) {
      throw ErrorApp_('POSIBLE_DUPLICADO', 'Ya existe un pago de $' + Utilities.formatString('%,d', monto).replace(/,/g, '.') +
        ' para este local con la referencia ' + nuevo.referencia + ' (' + dup.pago_id + ', ' + textoDeFecha(dup.fecha_pago) + '). ¿Es otro pago?');
    }
    var id = siguienteId_('pagos', 'pago_id', 'PAG-', 6);
    insertar_('pagos', { pago_id: id, fecha_pago: fecha, unidad_id: d.unidad_id, locatario_id: locatarioId, periodo_aplica: periodo,
      monto: monto, medio: medio, referencia: nuevo.referencia, glosa: String(d.glosa || '').trim() }, s.u);
    // D98: el pago queda en Actividad, igual que los cargos
    registrarLog_(s.u, 'crear_pago', 'pagos', id, '', { unidad_id: d.unidad_id, monto: monto, medio: medio,
      referencia: nuevo.referencia, periodo_aplica: periodo }, dup ? 'posible duplicado confirmado' : '');
    return { pago_id: id };
  });
}

function anularPago_(s, d) {
  var motivo = String(d.motivo || '').trim();
  if (!motivo) throw ErrorApp_('DATOS', 'Escribe el motivo.');
  conCandado_(function () {
    var p = buscarPor_(leerPagos_(), 'pago_id', d.pago_id);
    if (!p || p.estado === 'anulado') throw ErrorApp_('DATOS', 'Pago no encontrado.');
    if (!puedeAnular(p, s.u, s.r, hoy_())) throw ErrorApp_('SIN_PERMISO', 'Solo puedes anular lo que ingresaste hoy. Pídeselo a la administradora.');
    anularRegistro_('pagos', p, s.u, motivo);
    registrarLog_(s.u, 'anular_pago', 'pagos', p.pago_id, { monto: p.monto, referencia: p.referencia }, { estado: 'anulado' }, motivo);
  });
}
