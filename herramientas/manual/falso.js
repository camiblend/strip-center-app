/* Servidor de mentira para las capturas del manual: datos ficticios en memoria y servicios de Google simulados.
   Se carga después de los .js del servidor y reemplaza la capa del Sheet. */
var FALSO = (function () {
  var D = function (a, m, d, h, mi) { return new Date(a, m - 1, d, h || 0, mi || 0); };
  var T = {};
  var add = function (tabla, o) { (T[tabla] = T[tabla] || []).push(o); o._fila = T[tabla].length + 1; return o; };
  var aud = { creado_por: 'USR-01', creado_en: D(2026, 1, 5, 10, 0) };
  var tx = function (o) { return Object.assign({ creado_por: 'USR-02', creado_en: D(2026, 11, 3, 10, 0), estado: 'vigente' }, o); };

  // ------------------------------------------------ unidades y medidores
  var nums = [0]; for (var n = 6; n <= 31; n++) nums.push(n);
  var orden = 1;
  nums.forEach(function (n) {
    var id = 'L' + (n < 10 ? '0' : '') + n;
    add('unidades', Object.assign({ unidad_id: id, nombre: 'Local ' + n, tipo: 'local', genera_estado_cuenta: true, es_area_comun: false,
      orden: orden++, activa: true, notas: '', cuenta_gc: n === 0 || (n >= 6 && n <= 20) || n >= 26,
      // 2.1 (D110): arriendo sugerido
      arriendo_sugerido: n === 0 ? 1000000 : n === 30 ? 20 : n === 29 ? 18 : n >= 26 ? 16.5 : n === 11 ? '' : 11,
      moneda_sugerido: n === 0 ? 'CLP' : n === 11 ? '' : 'UF' }, aud));
  });
  [['CEX', 'Calle Exterior'], ['CIN', 'Calle Interior']].forEach(function (c) {
    add('unidades', Object.assign({ unidad_id: c[0], nombre: c[1], tipo: 'calle', genera_estado_cuenta: false, es_area_comun: true,
      orden: orden++, activa: true, notas: '', cuenta_gc: false }, aud));
  });
  T.unidades.forEach(function (u) {
    ['luz', 'agua'].forEach(function (sv) {
      add('medidores', Object.assign({ medidor_id: 'MED-' + u.unidad_id + '-' + sv.toUpperCase() + '-1', unidad_id: u.unidad_id, servicio: sv,
        n_serie: '', fecha_instalacion: D(2024, 2, 1), lectura_inicial: 0, fecha_retiro: '', lectura_final: '', lectura_final_desconocida: false,
        estado: 'activo' }, aud));
    });
  });

  // ------------------------------------------------ locatarios y contratos (todo inventado)
  var LOC = [
    ['LOC-0001', '76.111.111-6', 'Panadería El Trigal SpA', 'Rosa Pérez'],
    ['LOC-0002', '11.111.111-1', 'Ferretería Don Lucho', 'Luis Soto'],
    ['LOC-0003', '76.222.222-1', 'Farmacia Vida Sana Ltda.', 'Marta Rojas'],
    ['LOC-0004', '22.222.222-2', 'Peluquería Estilo', 'Carla Díaz'],
    ['LOC-0005', '76.333.333-7', 'Minimarket La Esquina SpA', 'Pedro Muñoz'],
    ['LOC-0006', '33.333.333-3', 'Café del Valle', 'Ana Torres'],
    ['LOC-0007', '76.444.444-2', 'Lavandería Burbujas Ltda.', 'Jorge Vega'],
    ['LOC-0008', '44.444.444-4', 'Sushi Kame', 'Daniela Reyes'],
    ['LOC-0009', '76.555.555-8', 'Óptica Visión Clara SpA', 'Felipe Castro'],
    ['LOC-0010', '55.555.555-5', 'Florería Primavera', 'Isabel Fuentes'],
    ['LOC-0011', '76.666.666-3', 'Gimnasio Activo SpA', 'Tomás Lagos'],
    ['LOC-0012', '66.666.666-6', 'Librería Papelito', 'Sofía Herrera'],
    ['LOC-0013', '77.777.777-7', 'Prueba SPA - no usar', ''],
  ];
  LOC.forEach(function (l, i) {
    add('locatarios', Object.assign({ locatario_id: l[0], rut: normalizarRut(l[1]), razon_social: l[2], nombre_contacto: l[3],
      correo: 'contacto' + (i + 1) + '@ejemplo.cl', telefono: '+56 9 1234 56' + (10 + i), notas: '',
      oculto: l[0] === 'LOC-0013' ? true : '' }, aud)); // D115: un locatario de prueba oculto
  });
  var nc = 1, nt = 1;
  var contrato = function (u, loc, ini, fin, monto, extra, moneda) {
    var id = 'CON-00' + (nc < 10 ? '0' : '') + nc++;
    add('contratos', Object.assign({ contrato_id: id, unidad_id: u, locatario_id: loc, fecha_inicio: ini, fecha_fin: fin || '', estado: 'vigente',
      paga_gc: true, garantia_monto: monto, notas: '' }, aud, extra || {}));
    add('contrato_arriendos', Object.assign(tx({ tramo_id: 'TRA-0000' + (nt < 10 ? '0' : '') + nt++, contrato_id: id,
      desde_periodo: periodoDe(ini), monto: monto, moneda: moneda || '', motivo: 'Inicial', comentario: '' }), { creado_por: 'USR-01' }));
    return id;
  };
  contrato('L00', 'LOC-0011', D(2025, 3, 1), null, 300000);
  contrato('L07', 'LOC-0001', D(2025, 8, 1), null, 450000);
  contrato('L08', 'LOC-0002', D(2025, 4, 1), null, 450000);
  contrato('L09', 'LOC-0003', D(2025, 1, 1), null, 450000);
  contrato('L10', 'LOC-0004', D(2026, 1, 1), null, 450000);
  contrato('L11', 'LOC-0005', D(2026, 1, 3), null, 450000, { paga_gc: false, notas: 'Exento de gasto común' });
  contrato('L12', 'LOC-0006', D(2026, 1, 1), null, 450000);
  contrato('L13', 'LOC-0007', D(2025, 5, 1), null, 450000);
  contrato('L15', 'LOC-0008', D(2026, 5, 1), null, 450000);
  contrato('L16', 'LOC-0009', D(2026, 8, 1), D(2026, 11, 15), 450000, { estado: 'terminado' });
  contrato('L17', 'LOC-0010', D(2026, 8, 1), null, 450000);
  contrato('L20', 'LOC-0012', D(2026, 8, 1), null, 450000);
  contrato('L29', 'LOC-0006', D(2026, 2, 1), null, 740000);
  contrato('L30', 'LOC-0011', D(2025, 6, 1), null, 820000);
  contrato('L31', 'LOC-0009', D(2026, 9, 24), null, 450000);
  // Reajustes ya hechos (solo el local 8 queda con reajuste pendiente)
  [['CON-0001', '2026-03'], ['CON-0002', '2026-08'], ['CON-0004', '2026-01'], ['CON-0008', '2026-05'], ['CON-0014', '2026-06']].forEach(function (r) {
    add('contrato_arriendos', tx({ tramo_id: 'TRA-0001' + nt++, contrato_id: r[0], desde_periodo: r[1], monto: 465000, motivo: 'Reajuste', comentario: '', creado_por: 'USR-01' }));
  });
  contrato('L06', 'LOC-0004', D(2024, 3, 1), D(2026, 6, 30), 420000, { estado: 'terminado' });
  // 2.1: arriendo en UF desde noviembre 2026 (el local 0 sigue en pesos; el 11, exento, también)
  var UF21 = { 'CON-0013': 18, 'CON-0014': 20, 'CON-0015': 16.5 };
  T.contratos.forEach(function (c) {
    if (['CON-0001', 'CON-0006', 'CON-0016'].indexOf(c.contrato_id) !== -1) return;
    add('contrato_arriendos', tx({ tramo_id: 'TRA-0002' + nt++, contrato_id: c.contrato_id, desde_periodo: '2026-11', monto: UF21[c.contrato_id] || 11,
      moneda: 'UF', motivo: 'Renegociación', comentario: 'Paso a UF', creado_por: 'USR-01' }));
  });
  // Cambio de locatario en noviembre: la Óptica pagó hasta el 15 y la Peluquería entra el 16 (GC proporcional)
  contrato('L16', 'LOC-0004', D(2026, 11, 16), null, 11, { garantia_monto: 460000 }, 'UF');
  add('valores_uf', tx({ uf_id: 'UF-000001', fecha: D(2026, 11, 30), valor: 41250.37, fuente: 'cmf', motivo: '', creado_por: 'sistema' }));
  if (typeof location !== 'undefined' && location.search.indexOf('sinuf') !== -1) T.valores_uf = [];

  // ------------------------------------------------ cierres, boletas, gastos
  var PERIODOS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  PERIODOS.forEach(function (p) {
    add('cierres', Object.assign({ periodo: p, estado: 'confirmado', n_locales_gc_calculado: 22, n_locales_gc_usado: 22, motivo_ajuste_gc: '',
      ajuste_gc_por: '', ajuste_gc_en: '', confirmado_por: 'USR-01', confirmado_en: D(2026, Number(p.slice(5)) + 1, 5, 18, 13),
      reabierto_por: '', reabierto_en: '', motivo_reapertura: '' }, aud));
  });
  add('cierres', Object.assign({ periodo: '2026-11', estado: 'borrador', n_locales_gc_calculado: 22, n_locales_gc_usado: 22, motivo_ajuste_gc: '',
    ajuste_gc_por: '', ajuste_gc_en: '', confirmado_por: '', confirmado_en: '', reabierto_por: '', reabierto_en: '', motivo_reapertura: '' }, aud));
  var nb = 1, ng = 1;
  var boleta = function (p, sv, monto, consumo) {
    var c = monto / consumo;
    add('boletas_servicio', tx({ boleta_id: 'BOL-0000' + (nb < 10 ? '0' : '') + nb++, periodo: p, servicio: sv, monto_total: monto, consumo_total: consumo,
      costo_unitario_calculado: c, costo_unitario_usado: c, motivo_ajuste: '', ajustado_por: '', ajustado_en: '' }));
  };
  var gasto = function (p, concepto, monto, glosa) {
    add('gastos_comunes', tx({ gasto_id: 'GC-0000' + (ng < 10 ? '0' : '') + ng++, periodo: p, concepto: concepto, monto: monto, glosa: glosa || '' }));
  };
  PERIODOS.concat(['2026-11']).forEach(function (p, i) {
    boleta(p, 'luz', 3200000 + i * 15000, 12000 + i * 40);
    boleta(p, 'agua', 250000 + i * 1200, 145 + i);
    var todos = p !== '2026-11';
    gasto(p, 'Administración', 300000);
    gasto(p, 'Aseo general', 45000);
    if (todos) { gasto(p, 'Jardinería', 20000); gasto(p, 'Personal aseo', 639650); gasto(p, 'Seguridad', 0); }
  });
  gasto('2026-10', 'Extraordinario', 85000, 'Juegos inflables día del niño');

  // ------------------------------------------------ lecturas (de mayo a noviembre)
  var nl = 1;
  var lectura = function (p, m, valor, fecha, extra) {
    var id = 'LEC-' + String(nl++).padStart(6, '0');
    add('lecturas', tx(Object.assign({ lectura_id: id, periodo: p, medidor_id: m.medidor_id, unidad_id: m.unidad_id, servicio: m.servicio,
      lectura: valor, fecha_lectura: fecha, origen: 'manual', es_cambio_medidor: false, alertas: '', comentario_alerta: '', estado_revision: '' }, extra || {})));
  };
  var conContrato = ['L00', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L15', 'L16', 'L17', 'L20', 'L29', 'L30', 'L31', 'CEX', 'CIN'];
  var sinLeerNov = ['L13', 'L31', 'CIN'];
  T.medidores.forEach(function (m, k) {
    if (conContrato.indexOf(m.unidad_id) === -1 || m.unidad_id === 'L00') return;
    var luz = m.servicio === 'luz';
    var paso = luz ? 80 + (k * 7) % 60 : 2 + (k % 4);
    var v = luz ? 20000 + k * 1137 : 300 + k * 11;
    PERIODOS.forEach(function (p) {
      v += paso;
      lectura(p, m, luz ? v : Math.round(v * 100) / 100, D(Number(p.slice(0, 4)), Number(p.slice(5)) + 1, 2));
    });
    if (sinLeerNov.indexOf(m.unidad_id) !== -1) return;
    if (m.unidad_id === 'L12' && !luz) {
      lectura('2026-11', m, v - 4, D(2026, 11, 7), { alertas: 'NEGATIVO', comentario_alerta: 'El mes pasado anotaron mal, el medidor marca menos', estado_revision: 'en_revision' });
      return;
    }
    lectura('2026-11', m, luz ? v + paso : Math.round((v + paso) * 100) / 100, D(2026, 11, 7));
  });
  // Ajustes a la fecha de hoy: lo de noviembre se ingresa en los primeros días de diciembre
  T.lecturas.forEach(function (l) { if (l.periodo === '2026-11') { l.fecha_lectura = D(2026, 12, 2); l.creado_en = D(2026, 12, 2, 9, 30); } });

  // ------------------------------------------------ movimientos y pagos
  var nm = 1;
  var mov = function (o) { add('movimientos', tx(Object.assign({ mov_id: 'MOV-0000' + (nm < 10 ? '0' : '') + nm++, fecha: D(2026, 12, 2), grupo_cuotas: '', cuota_n: '', cuota_total: '' }, o))); };
  [['L07', 'CON-0002'], ['L08', 'CON-0003'], ['L09', 'CON-0004'], ['L12', 'CON-0007'], ['L15', 'CON-0009']].forEach(function (x) {
    mov({ periodo_aplica: '2026-11', unidad_id: x[0], contrato_id: x[1], categoria: 'Otro', monto: 10000, glosa: 'Marketing', creado_en: D(2026, 12, 2, 10, 5) });
  });
  mov({ periodo_aplica: '2026-11', unidad_id: 'L10', contrato_id: 'CON-0005', categoria: 'Deuda arrastrada', monto: 120000, glosa: 'Saldo pendiente de octubre', creado_en: D(2026, 12, 2, 10, 12) });
  mov({ periodo_aplica: '2026-11', unidad_id: 'L13', contrato_id: 'CON-0008', categoria: 'Descuento', monto: -25000, glosa: 'Descuento por reparación del techo', creado_en: D(2026, 12, 2, 10, 20) });
  [1, 2, 3].forEach(function (i) {
    mov({ periodo_aplica: ['2026-11', '2026-12', '2027-01'][i - 1], unidad_id: 'L16', contrato_id: 'CON-0010', categoria: 'Cuota garantía', monto: 150000,
      glosa: 'Garantía en cuotas', grupo_cuotas: 'GRP-0001', cuota_n: i, cuota_total: 3, creado_en: D(2026, 12, 2, 10, 30) });
  });
  var np = 1;
  var pago = function (o) { add('pagos', tx(Object.assign({ pago_id: 'PAG-0000' + (np < 10 ? '0' : '') + np++, medio: 'Transferencia', referencia: '', glosa: '', periodo_aplica: '2026-11' }, o))); };
  pago({ fecha_pago: D(2026, 12, 3), unidad_id: 'L07', locatario_id: 'LOC-0001', monto: 581000, referencia: '4471203' });
  pago({ fecha_pago: D(2026, 12, 4), unidad_id: 'L12', locatario_id: 'LOC-0006', monto: 560000, referencia: '9912034' });
  pago({ fecha_pago: D(2026, 12, 4), unidad_id: 'L29', locatario_id: 'LOC-0006', monto: 850000, referencia: '9912034' });
  pago({ fecha_pago: D(2026, 12, 5), unidad_id: 'L13', locatario_id: 'LOC-0007', monto: 425000, referencia: '5530118' });
  pago({ fecha_pago: D(2026, 12, 5), unidad_id: 'L09', locatario_id: 'LOC-0003', monto: 300000, medio: 'Efectivo', glosa: 'Abono parcial' });

  // ------------------------------------------------ usuarios, log, catálogos
  add('usuarios', Object.assign({ usuario_id: 'USR-01', nombre: 'Administradora', rol: 'administradora', activo: true, pin_hash: 'x', pin_salt: 'x',
    intentos_fallidos: 0, bloqueado_hasta: '', debe_cambiar_pin: false, pin_cambiado_en: '' }, aud));
  add('usuarios', Object.assign({ usuario_id: 'USR-02', nombre: 'Digitadora', rol: 'digitadora', activo: true, pin_hash: 'x', pin_salt: 'x',
    intentos_fallidos: 0, bloqueado_hasta: '', debe_cambiar_pin: false, pin_cambiado_en: '' }, aud));
  add('usuarios', Object.assign({ usuario_id: 'USR-03', nombre: 'Rosa', rol: 'digitadora', activo: true, pin_hash: 'x', pin_salt: 'x',
    intentos_fallidos: 5, bloqueado_hasta: D(2026, 12, 5, 11, 40), debe_cambiar_pin: false, pin_cambiado_en: '' }, aud));
  var nlog = 1;
  var log = function (ts, u, accion, tabla, reg, antes, despues, motivo) {
    add('log', { log_id: 'LOG-' + String(nlog++).padStart(6, '0'), timestamp: ts, usuario_id: u, origen: 'app', accion: accion, tabla: tabla,
      registro_id: reg, antes: antes || '', despues: despues || '', motivo: motivo || '' });
  };
  log(D(2026, 12, 2, 9, 30), 'USR-02', 'crear', 'lecturas', 'LEC-000200', '', JSON.stringify({ lectura: 25384.4, periodo: '2026-11' }));
  log(D(2026, 12, 2, 10, 5), 'USR-02', 'crear', 'movimientos', 'MOV-000001', '', JSON.stringify({ monto: 10000, glosa: 'Marketing' }));
  log(D(2026, 12, 3, 12, 10), 'USR-01', 'crear_pago', 'pagos', 'PAG-000001', '', JSON.stringify({ monto: 581000 }));
  log(D(2026, 12, 4, 16, 45), 'USR-01', 'editar_contrato', 'contratos', 'CON-0008', JSON.stringify({ fecha_fin: '' }), JSON.stringify({ fecha_fin: '2026-12-31' }), 'Avisó que deja el local');
  log(D(2026, 12, 5, 11, 25), 'USR-03', 'login_fallido', 'usuarios', 'USR-03', '', '');
  CATALOGOS_INICIALES.forEach(function (c) { c[1].forEach(function (v, i) { add('catalogos', { tipo: c[0], valor: v, activo: true, orden: i + 1 }); }); });
  PARAMETROS_INICIALES.forEach(function (p) { add('parametros', { clave: p[0], valor: p[1], descripcion: p[2] }); });
  return { T: T };
})();

// ------------------------------------------------ reemplazos de la capa de datos y de los servicios
var HOY_FALSO = new Date(2026, 11, 5); // 5 de diciembre de 2026: noviembre en curso
hoy_ = function () { return new Date(HOY_FALSO.getTime()); };
leerTabla_ = function (n) { return (FALSO.T[n] || []).map(function (o) { return Object.assign({}, o); }); };
precargarTablas_ = function () {};
conCandado_ = function (fn) { return fn(); };
insertar_ = function (n, obj, u) {
  var t = tablaEsquema_(n), f = Object.assign({}, obj);
  if (t.clase !== 'sistema') { f.creado_por = u; f.creado_en = new Date(); }
  if (t.clase === 'transaccional' && !f.estado) f.estado = 'vigente';
  (FALSO.T[n] = FALSO.T[n] || []).push(f); f._fila = FALSO.T[n].length + 1;
  return f;
};
actualizarFila_ = function (n, obj, cambios, u) {
  var lista = FALSO.T[n], i = obj._fila - 2;
  var nuevo = Object.assign({}, lista[i], cambios);
  if (tablaEsquema_(n).clase === 'maestro') { nuevo.actualizado_por = u; nuevo.actualizado_en = new Date(); }
  lista[i] = nuevo;
  return nuevo;
};
siguienteId_ = function (n, campo, prefijo, ancho) {
  return siguienteIdDe((FALSO.T[n] || []).map(function (o) { return String(o[campo]); }), prefijo, ancho);
};
var CACHE_FALSA = {};
var CacheService = { getScriptCache: function () { return {
  get: function (k) { return CACHE_FALSA[k] || null; }, put: function (k, v) { CACHE_FALSA[k] = v; }, remove: function (k) { delete CACHE_FALSA[k]; } }; } };
var PROPS = {};
var PropertiesService = { getScriptProperties: function () { return {
  getProperty: function (k) { return PROPS[k] || null; }, setProperty: function (k, v) { PROPS[k] = v; } }; } };
var LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
var Session = { getActiveUser: function () { return { getEmail: function () { return 'prueba@ejemplo.cl'; } }; } };
var SpreadsheetApp = { flush: function () {} };
var MailApp = { sendEmail: function () {} };
var Utilities = {
  getUuid: function () { return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function () { return (Math.random() * 16 | 0).toString(16); }); },
  formatDate: function (d, z, f) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
      .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
  },
  DigestAlgorithm: {}, Charset: {},
  computeDigest: function () { var a = []; for (var i = 0; i < 32; i++) a.push(Math.random() * 256 | 0); return a; },
  formatString: function (f, n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
};
// Sesiones listas para cada rol (el ingreso con PIN no se simula)
[['T-admin', 'USR-01', 'Administradora', 'administradora'], ['T-dig', 'USR-02', 'Digitadora', 'digitadora'], ['T-nuevo', 'USR-02', 'Digitadora', 'digitadora', true]].forEach(function (s) {
  CACHE_FALSA['ses_' + s[0]] = JSON.stringify({ u: s[1], n: s[2], r: s[3], v: 0, c: Date.now(), a: Date.now(), cp: !!s[4] });
});
