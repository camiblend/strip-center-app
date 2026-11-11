/**
 * Sub-etapa 2.3: boleta (estado de cuenta) por locatario, con una sección por local (D117).
 * En la base todo sigue por local; aquí se junta lo de cada locatario. Las sumas y el redondeo están en Calculos.js
 * (lineasGC, totalesSeccion) para poder probarlos sin el Sheet.
 */

/** Arriendo en pesos de un contrato en el período: mes completo o proporcional (D07, D99, D113). {monto, dias, diasMes, aviso}. */
function arriendoContrato_(c, ts, periodo, uf) {
  var t = tramoVigente(ts, periodo);
  if (!t) return { monto: null, aviso: 'sin arriendo para ' + periodo };
  var base = arriendoDelMes_(t, periodo, uf);
  if (base.pesosMes === null) return { monto: null, aviso: 'falta la UF del ' + base.ufFecha };
  var finAqui = c.fecha_fin && periodoDe(c.fecha_fin) === periodo;
  var inicioAqui = periodoDe(c.fecha_inicio) === periodo;
  var p = finAqui ? proporcionalUltimoMes(base.pesosMes, c.fecha_fin, c.fecha_inicio)
    : inicioAqui ? proporcionalPrimerMes(base.pesosMes, c.fecha_inicio) : null;
  return p ? { monto: p.monto, dias: p.dias, diasMes: p.diasMes, moneda: base.moneda, ufValor: base.ufValor, montoTramo: base.montoTramo }
    : { monto: base.pesosMes, moneda: base.moneda, ufValor: base.ufValor, montoTramo: base.montoTramo };
}

/** Conceptos del gasto común de un local en un mes completo, sin redondear (cada concepto ÷ divisor), en el orden de la boleta. */
function conceptosGCPorLocal_(g) {
  var div = g.divisor.usado;
  if (!(div > 0)) return [];
  var r = [{ concepto: 'Luz', monto: g.gc.luzGC / div }, { concepto: 'Agua', monto: g.gc.aguaGC / div }];
  g.fijos.forEach(function (f) { if (f.activo || f.monto) r.push({ concepto: f.concepto, monto: (f.monto || 0) / div }); });
  g.extras.forEach(function (e) { r.push({ concepto: e.glosa || 'Extraordinario', monto: e.monto / div }); });
  return r;
}

/** Texto del cargo en la boleta: la glosa (o la categoría) y la cuota si es un plan ("Reparación cortina (2/3)"). */
function glosaCargo_(m) {
  var t = String(m.glosa || '').trim() || String(m.categoria || '');
  return m.cuota_total && Number(m.cuota_total) > 1 ? t + ' (' + m.cuota_n + '/' + m.cuota_total + ')' : t;
}

/**
 * Boletas de un período: una por locatario, con una sección por local. No guarda nada.
 * Devuelve {periodo, estado, avisos: [texto], boletas: [{id, locatario_id, razon_social, arrendatario, correo,
 *   secciones: [{unidad_id, nombre, arriendo, luz: {anterior, actual, consumo, monto, estimado}, agua, gc: {lineas, dias, diasMes},
 *   cargos, totales}], total, avisos}]}.
 */
function boletasDelPeriodo_(periodo, base) {
  precargarTablas_(TABLAS_CIERRE.concat(['contrato_arriendos', 'valores_uf', 'movimientos']));
  // base: {cx, fichas, g} ya calculados (el Resumen los reutiliza para no leer todo dos veces)
  var cx = base ? base.cx : contextoPeriodo_(periodo);
  var fichas = base ? base.fichas : fichas_(cx);
  var g = base ? base.g : gastosDelPeriodo_(cx, fichas);
  var conceptos = conceptosGCPorLocal_(g);
  var cuota = g.gc.cuota;
  var cuotas = cx.gcProporcional ? cuotasGCProporcional(cx.contratos, cx.periodo, cuota) : null;
  var tramos = agruparPor_(leerTramos_(), 'contrato_id');
  var uf = buscadorUf_(cx.periodo);
  var mes = rangoDelMes(cx.periodo);
  var movimientos = leerMovimientos_().filter(function (m) { return m.estado !== 'anulado' && m.periodo_aplica === cx.periodo; });
  var avisos = [];
  ['luz', 'agua'].forEach(function (sv) { if (g.costo[sv] === null) avisos.push('Falta la boleta de ' + sv + ': no hay costo unitario.'); });

  var secciones = {}; // clave locatario|unidad
  var unidades = cx.unidades.filter(function (u) { return u.tipo !== 'calle' && CALLES.indexOf(u.unidad_id) === -1 && u.genera_estado_cuenta !== false; });
  var seccion = function (locatarioId, u) {
    var k = locatarioId + '|' + u.unidad_id;
    return secciones[k] = secciones[k] || { locatario_id: locatarioId, unidad_id: u.unidad_id, nombre: u.nombre, orden: Number(u.orden),
      contratos: [], arriendo: null, arriendoDetalle: [], luz: null, agua: null, gc: null, cargos: [], avisos: [] };
  };
  var ultimoDelMes = function (lista) { return lista.slice().sort(function (a, b) { return b.fecha_inicio - a.fecha_inicio; })[0] || null; };

  unidades.forEach(function (u) {
    var delMes = cx.contratos.filter(function (c) { return c.unidad_id === u.unidad_id && c.estado !== 'anulado' && seTraslapan(mes, c); });
    // Arriendo: cada contrato del mes, a su locatario
    delMes.forEach(function (c) {
      var s = seccion(c.locatario_id, u);
      s.contratos.push(c.contrato_id);
      var ts = (tramos[c.contrato_id] || []).filter(function (t) { return t.estado !== 'anulado'; });
      var a = arriendoContrato_(c, ts, cx.periodo, uf);
      if (a.aviso) s.avisos.push('Arriendo de ' + u.nombre + ': ' + a.aviso + '.');
      else s.arriendo = (s.arriendo || 0) + a.monto;
      s.arriendoDetalle.push(a);
    });
    // Luz y agua: con reparto por traspaso (D115) cada locatario su parte; si no, todo al locatario del mes (como hasta ahora)
    ['luz', 'agua'].forEach(function (sv) {
      var fs = fichas.filter(function (f) { return f.unidad_id === u.unidad_id && f.servicio === sv; });
      if (!fs.length || !delMes.length) return;
      var costo = g.costo[sv];
      fs.forEach(function (f) {
        if (f.consumo === null) {
          // Mes confirmado: al cerrar se marcó "Confirmo consumo 0" (p. ej. un local que no paga luz ni agua)
          if (cx.estado === 'confirmado') return;
          var s0 = seccion(ultimoDelMes(delMes).locatario_id, u);
          s0.avisos.push('Falta la lectura de ' + sv + ' de ' + u.nombre + '.');
          return;
        }
        var rep = repartoFicha_(cx, f);
        var partes = rep && rep.tramos ? rep.tramos : [{ locatario_id: ultimoDelMes(delMes).locatario_id, consumo: f.consumo, estimado: false }];
        var acum = 0, anterior = f.anterior ? Number(f.anterior.valor) : null;
        partes.forEach(function (p) {
          var desde = anterior === null || f.cambio ? null : anterior + acum;
          acum += p.consumo;
          if (!p.locatario_id) return; // días vacíos: los absorbe la administración
          var s = seccion(p.locatario_id, u);
          var prev = s[sv];
          var nuevo = { anterior: desde, actual: desde === null ? null : Math.round((desde + p.consumo) * 1000) / 1000,
            consumo: p.consumo, monto: costo === null ? null : p.consumo * costo, estimado: !!p.estimado, cambioMedidor: !!f.cambio };
          if (partes.length === 1) { nuevo.anterior = f.cambio ? null : anterior; nuevo.actual = f.actual ? Number(f.actual.valor) : null; }
          // Dos medidores del mismo servicio o dos tramos del mismo locatario: se suman (sin lecturas)
          s[sv] = !prev ? nuevo : { anterior: null, actual: null, consumo: redondear3(prev.consumo + nuevo.consumo),
            monto: prev.monto === null || nuevo.monto === null ? null : prev.monto + nuevo.monto, estimado: prev.estimado || nuevo.estimado };
        });
      });
    });
    // Gasto común por concepto (D117): las líneas suman la cuota del Resumen
    var pagos = [];
    if (cuotas) (cuotas[u.unidad_id] || []).forEach(function (x) { pagos.push({ locatario_id: x.locatario_id, factor: x.dias / x.diasMes, objetivo: x.monto, dias: x.dias, diasMes: x.diasMes }); });
    else if (cx.pagan.indexOf(u.unidad_id) !== -1) {
      var dia1 = mes.fecha_inicio;
      var c1 = ultimoDelMes(delMes.filter(function (c) { return c.paga_gc === true && c.fecha_inicio <= dia1; }));
      if (c1) pagos.push({ locatario_id: c1.locatario_id, factor: 1, objetivo: cuota === null ? null : Math.round(cuota) });
    }
    pagos.forEach(function (p) {
      var s = seccion(p.locatario_id, u);
      var lineas = lineasGC(conceptos, p.factor, p.objetivo);
      if (!s.gc) s.gc = { lineas: lineas, dias: p.dias || null, diasMes: p.diasMes || null };
      else { // mismo locatario con dos contratos en el mes: se suman concepto a concepto
        s.gc.lineas.forEach(function (l, i) { l.monto += lineas[i].monto; });
        s.gc.dias = (s.gc.dias || 0) + (p.dias || 0);
      }
    });
  });

  // Cargos y descuentos: al locatario del contrato del cargo (M4)
  movimientos.forEach(function (m) {
    var u = buscarPor_(unidades, 'unidad_id', m.unidad_id);
    if (!u) return;
    var c = m.contrato_id ? buscarPor_(cx.contratos, 'contrato_id', m.contrato_id) : null;
    if (!c) { var r = contratoParaMovimiento(cx.contratos, m.unidad_id, cx.periodo); c = r ? r.contrato : null; }
    if (!c) { avisos.push('El cargo ' + m.mov_id + ' de ' + u.nombre + ' no tiene locatario: no sale en ninguna boleta.'); return; }
    seccion(c.locatario_id, u).cargos.push({ mov_id: m.mov_id, glosa: glosaCargo_(m), monto: m.monto });
  });

  // Juntar por locatario
  var porLocatario = {};
  Object.keys(secciones).forEach(function (k) {
    var s = secciones[k];
    s.totales = totalesSeccion({ arriendo: s.arriendo, luz: s.luz && s.luz.monto, agua: s.agua && s.agua.monto,
      gc: s.gc ? s.gc.lineas : [], cargos: s.cargos });
    (porLocatario[s.locatario_id] = porLocatario[s.locatario_id] || []).push(s);
  });
  var boletas = Object.keys(porLocatario).map(function (id) {
    var ss = porLocatario[id].sort(function (a, b) { return a.orden - b.orden; });
    var l = buscarPor_(cx.locatarios, 'locatario_id', id) || {};
    var av = [];
    ss.forEach(function (s) { av = av.concat(s.avisos); });
    return { id: idBoleta(cx.periodo, ss.map(function (s) { return s.unidad_id; })), locatario_id: id,
      razon_social: l.razon_social || '', arrendatario: l.nombre_contacto || '', correo: l.correo || '',
      orden: ss[0].orden, secciones: ss, total: ss.reduce(function (a, s) { return a + s.totales.total; }, 0), avisos: av };
  }).sort(function (a, b) { return a.orden - b.orden; });
  return { periodo: cx.periodo, estado: cx.estado, divisor: g.divisor.usado, cuota: cuota === null ? null : Math.round(cuota),
    avisos: avisos, boletas: boletas };
}

/** Pantalla "Boletas a locatarios": vista previa de las boletas del período (D117). */
function boletasLocatarios_(s, d) {
  var b = boletasDelPeriodo_(d.periodo);
  var cx = contextoPeriodo_(b.periodo);
  if (s.r === 'solo_lectura') b.boletas.forEach(function (x) { x.correo = ''; }); // como en Maestros
  if (cx.estado !== 'confirmado') b.avisos.unshift('El período ' + cx.periodo + ' no está confirmado: los montos todavía pueden cambiar.');
  b.periodos = cx.periodos; b.estadosPeriodos = cx.estados; b.editable = cx.editable;
  b.fechaEmision = textoDeFecha(hoy_());
  return b;
}

/**
 * Diagnóstico (editor): guarda las boletas del período como JSON en la carpeta de la app, para compararlas con el Excel
 * (herramientas/comparar_boletas.py). No modifica la base.
 */
function fotoBoletas(periodo) {
  periodo = periodo || '2026-10';
  var b = boletasDelPeriodo_(periodo);
  var carpeta = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  var nombre = 'boletas_' + periodo + '.json';
  var viejos = carpeta.getFilesByName(nombre);
  while (viejos.hasNext()) viejos.next().setTrashed(true);
  var f = carpeta.createFile(nombre, JSON.stringify(b), 'application/json');
  var porBoleta = b.boletas.filter(function (x) { return x.avisos.length; }).map(function (x) { return x.id + ': ' + x.avisos.join(' '); });
  Logger.log('Boletas: ' + b.boletas.length + ' · avisos: ' + JSON.stringify(b.avisos.concat(porBoleta)) + ' · archivo: ' + f.getUrl());
  return f.getUrl();
}
