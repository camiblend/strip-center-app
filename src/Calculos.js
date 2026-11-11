/**
 * Cálculos del cierre mensual. Funciones puras (sin Sheets), probadas en tests/calculos.test.js.
 * Usan las utilidades de fechas y períodos de Reglas.js.
 */

/** Período en curso = el mes siguiente al último cierre confirmado. */
function periodoEnCurso(ultimoConfirmado, periodoHoy) {
  return ultimoConfirmado ? sumarMesesPeriodo(ultimoConfirmado, 1) : sumarMesesPeriodo(periodoHoy, -1);
}

function redondear3(x) { return Math.round(x * 1000) / 1000; }

/**
 * Consumo de una lectura.
 *  anterior: lectura anterior del mismo medidor (null si es la primera → consumo 0, queda como base)
 *  cambio:   {anteriorViejo, final, inicial} si esta lectura es la primera de un medidor nuevo (D13)
 *  revision: 'base' → consumo 0 este mes (L3-c)
 */
function consumoDe(actual, anterior, cambio, revision) {
  if (revision === 'base') return 0;
  if (cambio) {
    var tramoViejo = cambio.final !== null && cambio.final !== undefined && cambio.anteriorViejo !== null && cambio.anteriorViejo !== undefined
      ? cambio.final - cambio.anteriorViejo : 0;
    return redondear3(tramoViejo + (actual - (Number(cambio.inicial) || 0)));
  }
  if (anterior === null || anterior === undefined) return 0;
  return redondear3(actual - anterior);
}

/** Promedio de los últimos n consumos (ya filtrados: sin lecturas con alerta). null si no hay. */
function promedioConsumo(consumos, n) {
  var ult = consumos.slice(-n);
  if (!ult.length) return null;
  return redondear3(ult.reduce(function (a, b) { return a + b; }, 0) / ult.length);
}

/** ['FUERA_RANGO'] si el consumo se aleja del promedio según los parámetros (B8). */
function alertasRango(consumo, promedio, servicio, p) {
  if (promedio === null || promedio === undefined) return [];
  var minimo = servicio === 'luz' ? p.alerta_min_kwh : p.alerta_min_m3;
  if (Math.abs(consumo - promedio) < minimo) return [];
  if (consumo > promedio * p.alerta_factor_alto || consumo < promedio * p.alerta_factor_bajo) return ['FUERA_RANGO'];
  return [];
}

function costoUnitario(monto, consumo) {
  return consumo > 0 ? monto / consumo : null;
}

/** Aviso si el costo unitario cambia más que el umbral (0.3 = 30%) respecto del mes anterior. */
function variacionCosto(actual, anterior, umbral) {
  if (!actual || !anterior) return null;
  var v = actual / anterior - 1;
  return Math.abs(v) > umbral ? v : null;
}

/** D06: unidades con contrato que paga GC vigente el día 1 (el último día pagado es el día 1 o después, D113). */
function unidadesQuePaganGC(contratos, periodo) {
  var dia1 = fechaDeTexto(periodo + '-01');
  var u = {};
  contratos.forEach(function (c) {
    if (c.estado === 'anulado' || c.paga_gc !== true) return;
    if (c.fecha_inicio <= dia1 && (!c.fecha_fin || c.fecha_fin >= dia1)) u[c.unidad_id] = true;
  });
  return Object.keys(u).sort();
}

/**
 * 2.1 (cambia D06 desde el período de `periodo_reglas_2_1`, D112): paga todo contrato con "Paga GC" que cubra al menos
 * un día del mes: cuota × días con contrato ÷ días del mes, al peso (D11). Con cambio de locatario, cada uno paga sus días.
 * Mes completo = la cuota tal cual (se redondea al mostrar, como hasta ahora). cuota null = aún no se puede calcular.
 * Devuelve {unidad_id: [{contrato_id, locatario_id, dias, diasMes, monto}]}.
 */
function cuotasGCProporcional(contratos, periodo, cuota) {
  var mes = rangoDelMes(periodo), diasMes = mes.fecha_fin.getDate(), r = {};
  contratos.forEach(function (c) {
    if (c.estado === 'anulado' || c.paga_gc !== true || !seTraslapan(mes, c)) return;
    var desde = c.fecha_inicio > mes.fecha_inicio ? c.fecha_inicio : mes.fecha_inicio;
    var hasta = c.fecha_fin && c.fecha_fin < mes.fecha_fin ? c.fecha_fin : mes.fecha_fin;
    var dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1; // round: cambio de horario
    var monto = cuota === null || cuota === undefined ? null : dias === diasMes ? cuota : Math.round(cuota * dias / diasMes);
    (r[c.unidad_id] = r[c.unidad_id] || []).push({ contrato_id: c.contrato_id, locatario_id: c.locatario_id, dias: dias, diasMes: diasMes, monto: monto });
  });
  return r;
}

/** Quién paga GC en el período: regla del día 1 (D06) o, desde 2.1, al menos un día del mes. */
function unidadesQuePaganGCSegun(contratos, periodo, proporcional) {
  return proporcional ? Object.keys(cuotasGCProporcional(contratos, periodo, null)).sort() : unidadesQuePaganGC(contratos, periodo);
}

/** D94: el gasto común se divide siempre entre las unidades activas marcadas con cuenta_gc,
 *  estén ocupadas o no. La parte de las que no pagan la absorbe la administración. */
function unidadesDelDivisorGC(unidades) {
  return unidades.filter(function (u) { return u.cuenta_gc === true && u.activa === true; })
    .map(function (u) { return u.unidad_id; }).sort();
}

/** Unidades con contrato (no anulado) que se cruza con el mes: se espera su lectura (D12). */
function unidadesConContratoEnMes(contratos, periodo) {
  var mes = rangoDelMes(periodo);
  var u = {};
  contratos.forEach(function (c) {
    if (c.estado === 'anulado') return;
    if (seTraslapan(mes, c)) u[c.unidad_id] = true;
  });
  return Object.keys(u).sort();
}

/**
 * Gastos comunes del mes. fijos/extras: montos. consumoCalles/costo: {luz, agua}.
 * La cuota no se redondea aquí (se redondea al mostrar y, en la etapa 2, al emitir).
 */
function calcularGC(fijos, extras, consumoCalles, costo, divisor) {
  var suma = function (xs) { return xs.reduce(function (a, b) { return a + (Number(b) || 0); }, 0); };
  var luzGC = (consumoCalles.luz || 0) * (costo.luz || 0);
  var aguaGC = (consumoCalles.agua || 0) * (costo.agua || 0);
  var total = suma(fijos) + suma(extras) + luzGC + aguaGC;
  return { fijos: suma(fijos), extras: suma(extras), luzGC: luzGC, aguaGC: aguaGC, total: total,
    cuota: divisor > 0 ? total / divisor : null };
}

/**
 * Revisión antes de confirmar (L1, L2). Devuelve {bloqueos: [textos], pendientesCero: [unidad_id]}.
 *  r: {boletas: {luz, agua} (bool), callesSinLectura: [textos], enRevision: n, fijos: n, divisor: n,
 *      sinLectura: [unidad_id con contrato y sin lectura], confirmadosCero: [unidad_id],
 *      revisiones: [textos, opcional: "Local 10 · agua (bajó de 10 a 5)"] (D96)}
 */
function revisarParaConfirmar(r) {
  var b = [];
  if (!r.boletas.luz) b.push('Falta la boleta de luz.');
  if (!r.boletas.agua) b.push('Falta la boleta de agua.');
  r.callesSinLectura.forEach(function (t) { b.push('Falta la lectura de ' + t + '.'); });
  if (r.enRevision > 0) {
    // D96: se dice cuáles y quién las resuelve
    b.push(r.revisiones && r.revisiones.length
      ? 'Lecturas en revisión (' + r.enRevision + '): ' + r.revisiones.join('; ') + '. La administradora las resuelve en Lecturas.'
      : (r.enRevision === 1 ? 'Hay 1 lectura en revisión.' : 'Hay ' + r.enRevision + ' lecturas en revisión.'));
  }
  if (!r.fijos) b.push('No hay gastos comunes guardados.');
  if (!(r.divisor > 0)) b.push('El número de locales que pagan gasto común debe ser mayor que 0.');
  var pendientes = r.sinLectura.filter(function (u) { return r.confirmadosCero.indexOf(u) === -1; });
  return { bloqueos: b, pendientesCero: pendientes };
}

// ---------------------------------------------------------------- Movimientos y pagos (1.5)

/** M3: divide un total en n cuotas enteras; la diferencia queda en la última. */
function dividirEnCuotas(total, n) {
  var base = Math.floor(total / n);
  var cuotas = [];
  for (var i = 0; i < n - 1; i++) cuotas.push(base);
  cuotas.push(total - base * (n - 1));
  return cuotas;
}

/** M1: la administradora siempre; una digitadora solo lo que ella ingresó, el mismo día. */
function puedeAnular(registro, usuarioId, rol, hoy) {
  if (rol === 'administradora') return true;
  if (registro.creado_por !== usuarioId) return false;
  var c = registro.creado_en;
  return !!(c && c.getFullYear() === hoy.getFullYear() && c.getMonth() === hoy.getMonth() && c.getDate() === hoy.getDate());
}

/**
 * M4: contrato al que se asocia un cargo del local en el período.
 * {contrato, terminado: false} si hay uno que se cruza con el mes; si no, el último terminado
 * antes del mes con terminado: true; null si el local nunca tuvo contrato (antes o durante el mes).
 */
function contratoParaMovimiento(contratos, unidadId, periodo) {
  var mes = rangoDelMes(periodo);
  var delLocal = contratos.filter(function (c) { return c.unidad_id === unidadId && c.estado !== 'anulado'; });
  var enMes = delLocal.filter(function (c) { return seTraslapan(mes, c); })
    .sort(function (a, b) { return b.fecha_inicio - a.fecha_inicio; });
  if (enMes.length) return { contrato: enMes[0], terminado: false };
  var anteriores = delLocal.filter(function (c) { return c.fecha_fin && c.fecha_fin < mes.fecha_inicio; })
    .sort(function (a, b) { return b.fecha_fin - a.fecha_fin; });
  return anteriores.length ? { contrato: anteriores[0], terminado: true } : null;
}

/** Pago vigente con la misma referencia, local y monto (M5: aviso de posible duplicado). */
function pagoDuplicado(pagos, nuevo) {
  if (!String(nuevo.referencia || '').trim()) return null;
  return pagos.filter(function (p) {
    return p.estado !== 'anulado' && String(p.referencia).trim() === String(nuevo.referencia).trim() &&
      p.unidad_id === nuevo.unidad_id && Number(p.monto) === Number(nuevo.monto);
  })[0] || null;
}

// ---------------------------------------------------------------- Lecturas de traspaso (2.2, D115)

/**
 * Tramos del mes de una unidad según sus contratos (no anulados): días seguidos con el mismo contrato, o vacíos
 * (contrato_id null). Fechas de término = último día pagado (D113). Devuelve [{contrato_id, locatario_id, desde, hasta, dias}].
 */
function tramosDelMes(contratos, unidadId, periodo) {
  var mes = rangoDelMes(periodo), n = mes.fecha_fin.getDate(), tramos = [];
  var delLocal = contratos.filter(function (c) { return c.unidad_id === unidadId && c.estado !== 'anulado' && seTraslapan(mes, c); });
  for (var d = 1; d <= n; d++) {
    var dia = new Date(mes.fecha_inicio.getFullYear(), mes.fecha_inicio.getMonth(), d);
    var c = delLocal.filter(function (x) { return x.fecha_inicio <= dia && (!x.fecha_fin || x.fecha_fin >= dia); })
      .sort(function (a, b) { return b.fecha_inicio - a.fecha_inicio; })[0] || null;
    var id = c ? c.contrato_id : null, ult = tramos[tramos.length - 1];
    if (ult && ult.contrato_id === id) { ult.hasta = dia; ult.dias++; continue; }
    tramos.push({ contrato_id: id, locatario_id: c ? c.locatario_id : null, desde: dia, hasta: dia, dias: 1 });
  }
  return tramos;
}

/**
 * Clave de cada corte entre tramos: "salida:CON-…" si el tramo de la izquierda es un contrato; si no, "entrada:CON-…".
 * Un traspaso directo (sale uno y entra otro al día siguiente) es un solo corte, con la clave de salida.
 */
function cortesDeTramos(tramos) {
  var cortes = [];
  for (var i = 1; i < tramos.length; i++) {
    var izq = tramos[i - 1], der = tramos[i];
    cortes.push({ clave: izq.contrato_id ? 'salida:' + izq.contrato_id : 'entrada:' + der.contrato_id,
      fecha: izq.hasta, sale: izq.contrato_id, entra: der.contrato_id });
  }
  return cortes;
}

/**
 * Reparte el consumo del mes entre los tramos (D115). valores: {anterior, actual, consumo} del mes (consumo ya calculado,
 * con cambio de medidor o revisión incluidos); lecturasCorte: {clave: valor}. Si los valores no permiten usar las lecturas
 * (sin anterior, cambio de medidor, lectura fuera de orden), o falta alguna, esa parte se estima por días (estimado = true).
 * Devuelve los tramos con consumo y estimado.
 */
function repartirConsumo(tramos, valores, lecturasCorte, simple) {
  var cortes = cortesDeTramos(tramos);
  // Puntos conocidos: inicio (0), cortes con lectura válida y fin. Se trabaja en "consumo acumulado desde la anterior".
  var puntos = [{ i: 0, acum: 0 }];
  var usar = simple && valores.anterior !== null && valores.anterior !== undefined && valores.actual !== null && valores.actual !== undefined;
  var previo = 0;
  cortes.forEach(function (c, k) {
    var v = lecturasCorte[c.clave];
    if (!usar || v === undefined || v === null) return;
    var acum = v - valores.anterior;
    if (acum < previo || acum > valores.consumo) return; // fuera de orden: se ignora y se estima
    puntos.push({ i: k + 1, acum: acum }); previo = acum;
  });
  puntos.push({ i: tramos.length, acum: valores.consumo });
  var r = tramos.map(function (t) { return Object.assign({}, t, { consumo: 0, estimado: false }); });
  for (var p = 1; p < puntos.length; p++) {
    var a = puntos[p - 1], b = puntos[p], total = b.acum - a.acum, grupo = r.slice(a.i, b.i);
    var dias = grupo.reduce(function (s, t) { return s + t.dias; }, 0), repartido = 0;
    grupo.forEach(function (t, j) {
      t.consumo = j === grupo.length - 1 ? Math.round((total - repartido) * 1000) / 1000 : Math.round(total * t.dias / dias * 1000) / 1000;
      repartido += t.consumo;
      t.estimado = grupo.length > 1;
    });
  }
  return r;
}

// ---------------------------------------------------------------- Boleta por locatario (2.3, D117)

/**
 * Líneas del gasto común de un local, al peso (D117). conceptos: [{concepto, monto}] con el monto de un mes completo sin
 * redondear (concepto ÷ divisor); factor: días ÷ días del mes (1 = mes completo). objetivo: la cuota ya redondeada que
 * muestra el Resumen; la diferencia del redondeo (normalmente $1) se suma al concepto más grande, para que las líneas
 * sumen exactamente la cuota. objetivo null = solo se redondea.
 */
function lineasGC(conceptos, factor, objetivo) {
  var r = conceptos.map(function (c) { return { concepto: c.concepto, monto: Math.round((Number(c.monto) || 0) * factor) }; });
  if (objetivo === null || objetivo === undefined || !r.length) return r;
  var suma = r.reduce(function (a, x) { return a + x.monto; }, 0);
  var mayor = r.reduce(function (m, x, i) { return x.monto > r[m].monto ? i : m; }, 0);
  r[mayor].monto += objetivo - suma;
  return r;
}

/**
 * Totales de una sección (un local) de la boleta: cada línea al peso y las sumas son la suma de las líneas (D117).
 * s: {arriendo, luz, agua (montos en pesos o null), gc: [{concepto, monto}], cargos: [{glosa, monto}]}.
 * Tres bloques sin repetir los cargos (D119): Gastos locatario (arriendo, luz, agua), Otros gastos locatario
 * (cada cargo o descuento) y Gastos comunes, cada uno con su subtotal; el total del local es la suma de los tres.
 */
function totalesSeccion(s) {
  var peso = function (v) { return v === null || v === undefined ? 0 : Math.round(v); };
  var otros = (s.cargos || []).reduce(function (a, c) { return a + peso(c.monto); }, 0);
  var subLocatario = peso(s.arriendo) + peso(s.luz) + peso(s.agua);
  var subGC = (s.gc || []).reduce(function (a, c) { return a + peso(c.monto); }, 0);
  return { arriendo: s.arriendo === null || s.arriendo === undefined ? null : peso(s.arriendo),
    luz: s.luz === null || s.luz === undefined ? null : peso(s.luz), agua: s.agua === null || s.agua === undefined ? null : peso(s.agua),
    subtotalLocatario: subLocatario, otros: otros, subtotalGC: subGC, total: subLocatario + otros + subGC };
}

/** Id y nombre del PDF de la boleta (D117): SC-202611-L20-L30. unidades: ids ya en orden. */
function idBoleta(periodo, unidades) {
  return 'SC-' + periodo.replace('-', '') + '-' + unidades.join('-');
}

/**
 * Orden del Resumen (D117): por orden de local, pero un local de un locatario que ya apareció más arriba sube y queda
 * pegado a ese. filas: [{unidad_id, orden, locatario_id}] (locatario vacío = sin agrupar). Devuelve las mismas filas en
 * el nuevo orden, con grupo: {n, primero} si el locatario tiene más de un local.
 */
function ordenAgrupado(filas) {
  var orden = filas.slice().sort(function (a, b) { return a.orden - b.orden; });
  var usados = {}, r = [];
  orden.forEach(function (f) {
    if (usados[f.unidad_id]) return;
    var grupo = f.locatario_id ? orden.filter(function (x) { return x.locatario_id === f.locatario_id; }) : [f];
    grupo.forEach(function (x, i) {
      usados[x.unidad_id] = true;
      r.push(Object.assign({}, x, { grupo: grupo.length > 1 ? { n: grupo.length, primero: i === 0 } : null }));
    });
  });
  return r;
}
