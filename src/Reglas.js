/**
 * Reglas del negocio para locatarios y contratos. Funciones puras (sin Sheets), probadas en
 * tests/reglas.test.js. Las fechas son objetos Date a medianoche (hora local del script).
 */

// ---------------------------------------------------------------- RUT y correo

/** '76.543.210-3' -> '76543210-3'. Devuelve '' si no hay suficientes caracteres. */
function normalizarRut(rut) {
  var limpio = String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
  return limpio.length < 2 ? '' : limpio.slice(0, -1) + '-' + limpio.slice(-1);
}

function rutValido(rut) {
  var limpio = String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return false;
  var cuerpo = limpio.slice(0, -1), dv = limpio.slice(-1), suma = 0, mult = 2;
  for (var i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  var r = 11 - (suma % 11);
  return dv === (r === 11 ? '0' : r === 10 ? 'K' : String(r));
}

/** {correo normalizado, error, aviso}. El aviso no impide guardar. */
function revisarCorreo(correo) {
  var c = String(correo || '').trim().toLowerCase();
  if (!c) return { correo: '', error: 'Falta el correo.', aviso: null };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(c)) return { correo: c, error: 'El correo no tiene un formato válido.', aviso: null };
  // D99: dominios conocidos con la terminación mal escrita (.co, .con, .cm, .om…) o el nombre mal escrito (gmial, gamil…)
  var dom = c.split('@')[1];
  var m = dom.match(/^(gmail|hotmail|outlook|yahoo|live)\.(co|con|cm|om|comm|cpm|vom|xom|cim|coom)$/);
  if (m) return { correo: c, error: null, aviso: 'El correo termina en ".' + m[2] + '". ¿Quisiste decir "@' + m[1] + '.com"?' };
  var mal = { gmial: 'gmail', gamil: 'gmail', gmal: 'gmail', gmai: 'gmail', gnail: 'gmail', hotmial: 'hotmail', hotmal: 'hotmail', hotmai: 'hotmail' };
  var n = dom.match(/^([a-z]+)\./);
  if (n && mal[n[1]]) return { correo: c, error: null, aviso: '¿Quisiste decir "@' + mal[n[1]] + dom.slice(n[1].length) + '"?' };
  return { correo: c, error: null, aviso: null };
}

// ---------------------------------------------------------------- Fechas y períodos

function diasDelMes(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}

function periodoDe(fecha) {
  var m = fecha.getMonth() + 1;
  return fecha.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
}

function sumarMesesPeriodo(periodo, n) {
  var total = Number(periodo.slice(0, 4)) * 12 + Number(periodo.slice(5, 7)) - 1 + n;
  var m = total % 12 + 1;
  return Math.floor(total / 12) + '-' + (m < 10 ? '0' : '') + m;
}

/** 'yyyy-mm-dd' -> Date a medianoche local. '' -> null. */
function fechaDeTexto(texto) {
  if (!texto) return null;
  var p = String(texto).split('-').map(Number);
  if (p.length !== 3 || p.some(isNaN)) return null;
  var d = new Date(p[0], p[1] - 1, p[2]);
  return d.getMonth() === p[1] - 1 ? d : null; // rechaza 2026-02-30
}

function textoDeFecha(fecha) {
  if (!fecha) return '';
  var m = fecha.getMonth() + 1, d = fecha.getDate();
  return fecha.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}

/** D99: fecha para mensajes en pantalla, como el resto de la app: 15-11-2026. */
function fechaParaMensaje(fecha) {
  var t = textoDeFecha(fecha);
  return t ? t.slice(8, 10) + '-' + t.slice(5, 7) + '-' + t.slice(0, 4) : '';
}

// ---------------------------------------------------------------- Contratos

/** 'anulado' | 'por_iniciar' | 'vigente' | 'terminado'. fecha_fin = último día pagado (D95, D113): ese día sigue vigente. */
function estadoContrato(c, hoy) {
  if (c.estado === 'anulado') return 'anulado';
  if (c.fecha_inicio > hoy) return 'por_iniciar';
  if (c.fecha_fin && hoy > c.fecha_fin) return 'terminado';
  return 'vigente';
}

/** Intervalos [inicio, fin] con ambos días incluidos (D113); fin vacío = indefinido. */
function seTraslapan(a, b) {
  var finA = a.fecha_fin ? a.fecha_fin.getTime() : Infinity;
  var finB = b.fecha_fin ? b.fecha_fin.getTime() : Infinity;
  return a.fecha_inicio.getTime() <= finB && b.fecha_inicio.getTime() <= finA;
}

/** Del día 1 al último día del período, ambos incluidos (para compararlo con seTraslapan). */
function rangoDelMes(periodo) {
  return { fecha_inicio: fechaDeTexto(periodo + '-01'), fecha_fin: new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0) };
}

/** Primer contrato no anulado de la misma unidad que se cruza con `nuevo` (excluye el propio). */
function buscarTraslape(nuevo, contratos) {
  for (var i = 0; i < contratos.length; i++) {
    var c = contratos[i];
    if (c.estado === 'anulado' || c.contrato_id === nuevo.contrato_id || c.unidad_id !== nuevo.unidad_id) continue;
    if (seTraslapan(nuevo, c)) return c;
  }
  return null;
}

/** D07: primer mes = monto ÷ días del mes × días desde el inicio (incluido). Redondeo al peso (D11). */
function proporcionalPrimerMes(monto, inicio) {
  var total = diasDelMes(inicio), dias = total - inicio.getDate() + 1;
  return { periodo: periodoDe(inicio), dias: dias, diasMes: total, monto: Math.round(monto * dias / total) };
}

/**
 * D95, D113: último mes = hasta el último día pagado, incluido (termina el día 1 = se cobra 1 día).
 * D99: con `inicio` en el mismo mes, es el único mes del contrato: se cuentan los días de inicio a término (unico = true).
 */
function proporcionalUltimoMes(monto, fin, inicio) {
  var total = diasDelMes(fin);
  var unico = !!inicio && periodoDe(inicio) === periodoDe(fin);
  var dias = unico ? fin.getDate() - inicio.getDate() + 1 : fin.getDate();
  return { periodo: periodoDe(fin), dias: dias, diasMes: total, monto: Math.round(monto * dias / total), unico: unico };
}

// ---------------------------------------------------------------- Tramos y reajustes (D09)

/** Tramo que rige en un período: el de desde_periodo más reciente que sea ≤ período. */
function tramoVigente(tramos, periodo) {
  var elegido = null;
  tramos.forEach(function (t) {
    if (t.estado === 'anulado' || t.desde_periodo > periodo) return;
    if (!elegido || t.desde_periodo > elegido.desde_periodo) elegido = t;
  });
  return elegido;
}

function ultimoAniversario(inicio, hasta) {
  var ultimo = null;
  for (var n = 1; ; n++) {
    var aniv = new Date(inicio.getFullYear() + n, inicio.getMonth(), inicio.getDate());
    if (aniv.getMonth() !== inicio.getMonth()) aniv = new Date(inicio.getFullYear() + n, inicio.getMonth() + 1, 0); // 29-feb
    if (aniv > hasta) return ultimo;
    ultimo = aniv;
  }
}

/** El reajuste rige desde el primer mes que empieza en el aniversario o después. */
function periodoDesdeAniversario(aniv) {
  var p = periodoDe(aniv);
  return aniv.getDate() === 1 ? p : sumarMesesPeriodo(p, 1);
}

/**
 * Contratos vigentes que ya cumplieron un aniversario y no tienen un tramo desde el período
 * que le corresponde. `tramosDe(contrato_id)` devuelve sus tramos.
 */
function reajustesPendientes(contratos, tramosDe, hoy) {
  var pendientes = [];
  contratos.forEach(function (c) {
    if (estadoContrato(c, hoy) !== 'vigente') return;
    var aniv = ultimoAniversario(c.fecha_inicio, hoy);
    if (!aniv) return;
    var desde = periodoDesdeAniversario(aniv);
    var tramos = tramosDe(c.contrato_id).filter(function (t) { return t.estado !== 'anulado'; });
    if (tramos.some(function (t) { return t.desde_periodo >= desde; })) return;
    var actual = tramoVigente(tramos, desde);
    pendientes.push({ contrato_id: c.contrato_id, unidad_id: c.unidad_id, aniversario: aniv,
      desde_periodo: desde, monto_actual: actual ? actual.monto : null });
  });
  return pendientes;
}

/** Aniversarios que caen exactamente hoy (para el correo diario). */
function aniversariosDeHoy(contratos, hoy) {
  return contratos.filter(function (c) {
    if (estadoContrato(c, hoy) !== 'vigente') return false;
    var aniv = ultimoAniversario(c.fecha_inicio, hoy);
    return aniv !== null && aniv.getTime() === hoy.getTime();
  });
}

/**
 * Valida un tramo nuevo frente a los existentes. Devuelve mensaje de error o null.
 * moneda: 'CLP' (por defecto) o 'UF'; periodoUf: desde qué período se permite UF (D112).
 */
function validarTramoNuevo(desdePeriodo, monto, comentario, tramos, moneda, periodoUf) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(desdePeriodo))) return 'Elige el mes desde el que rige.';
  var error = validarMontoArriendo(monto, moneda || 'CLP', comentario);
  if (error) return error;
  if (moneda === 'UF' && periodoUf && desdePeriodo < periodoUf) return 'El arriendo en UF rige desde ' + periodoUf + ': antes de eso va en pesos.';
  var vigentes = tramos.filter(function (t) { return t.estado !== 'anulado'; });
  if (vigentes.some(function (t) { return t.desde_periodo === desdePeriodo; })) return 'Ya existe un arriendo desde ' + desdePeriodo + '. Anúlalo primero si está mal.';
  var ultimo = vigentes.reduce(function (m, t) { return !m || t.desde_periodo > m ? t.desde_periodo : m; }, null);
  if (ultimo && desdePeriodo < ultimo) return 'El nuevo arriendo debe regir desde ' + ultimo + ' o después.';
  return null;
}

// ---------------------------------------------------------------- UF (2.1, D106, D108)

/** Último día del período 'AAAA-MM': la boleta de un mes usa la UF de ese día (D106). */
function ultimoDiaDelPeriodo(periodo) {
  return new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0);
}

/** Valor de la UF en un texto de la CMF ("39.643,26") -> 39643.26. null si no se entiende. */
function numeroDeTextoCmf(texto) {
  var t = String(texto || '').trim().replace(/\./g, '').replace(',', '.');
  var n = Number(t);
  return t && !isNaN(n) && n > 0 ? n : null;
}

/** Respuesta JSON de la CMF -> {fecha: 'AAAA-MM-DD', valor} o null. Formato: {"UFs":[{"Valor":"…","Fecha":"…"}]}. */
function ufDesdeRespuestaCmf(json) {
  var lista = json && (json.UFs || json.UFS);
  var u = lista && lista[0];
  if (!u) return null;
  var valor = numeroDeTextoCmf(u.Valor);
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(u.Fecha) ? { fecha: u.Fecha, valor: valor } : null;
}

/** Valor vigente (no anulado) de la UF para una fecha, o null. Si hay más de uno, el último registrado. */
function ufDeFecha(valores, fecha) {
  var t = fecha.getTime(), elegido = null;
  valores.forEach(function (v) {
    if (v.estado === 'anulado' || !v.fecha || v.fecha.getTime() !== t) return;
    if (!elegido || String(v.uf_id) > String(elegido.uf_id)) elegido = v;
  });
  return elegido;
}

/** Valida un valor de UF ingresado a mano. La UF anda cerca de $40.000: se rechaza lo que no tiene sentido. */
function validarUfManual(valor, motivo) {
  if (!(typeof valor === 'number' && valor >= 10000 && valor <= 200000)) return 'El valor de la UF debe estar entre $10.000 y $200.000 (ej. 39643,26).';
  if (Math.abs(Math.round(valor * 100) - valor * 100) > 1e-6) return 'La UF tiene a lo más dos decimales.';
  if (!String(motivo || '').trim()) return 'Escribe el motivo (ej. "la CMF no respondió").';
  return null;
}

// ---------------------------------------------------------------- Arriendo en UF (2.1)

/** CLP: entero ≥ 0 ($0 con comentario). UF: mayor que 0 y a lo más dos decimales (ej. 16,5). */
function validarMontoArriendo(monto, moneda, comentario) {
  if (moneda !== 'CLP' && moneda !== 'UF') return 'Elige la moneda del arriendo (UF o pesos).';
  if (moneda === 'UF') {
    if (!(typeof monto === 'number' && monto > 0 && monto < 10000)) return 'El arriendo en UF debe ser mayor que 0 (ej. 11 o 16,5).';
    if (Math.abs(Math.round(monto * 100) - monto * 100) > 1e-6) return 'El arriendo en UF tiene a lo más dos decimales.';
    return null;
  }
  if (!(Number.isInteger(monto) && monto >= 0)) return 'El arriendo debe ser un monto entero en pesos.';
  if (monto === 0 && !String(comentario || '').trim()) return 'Un arriendo de $0 requiere un motivo (comentario).';
  return null;
}

/** Moneda de un tramo: vacío = CLP (tramos anteriores a 2.1). */
function monedaDeTramo(t) {
  return t && t.moneda === 'UF' ? 'UF' : 'CLP';
}

/**
 * Arriendo del mes completo en pesos. UF: monto × UF del último día del mes, redondeado al peso (D11, D106).
 * Devuelve null si es UF y falta el valor de la UF.
 */
function arriendoEnPesos(monto, moneda, valorUf) {
  if (moneda !== 'UF') return Number(monto);
  return valorUf ? Math.round(Number(monto) * valorUf) : null;
}
