/**
 * Sub-etapa 1.6: revisiones de integridad del Sheet (T4) y textos legibles del log.
 * Las funciones sin _ son puras y se prueban en tests/integridad.test.js.
 */

/** Encabezados distintos al esquema (usa planEncabezados de Setup.js). */
function problemasEncabezados(hoja, actuales, esperadas) {
  var plan = planEncabezados(actuales, esperadas);
  var p = [];
  plan.distintas.forEach(function (d) {
    p.push(hoja + ': la columna ' + (d.indice + 1) + ' dice "' + d.actual + '" y debería ser "' + d.esperada + '".');
  });
  plan.sobrantes.forEach(function (n) { p.push(hoja + ': columna "' + n + '" que no está en el esquema.'); });
  plan.agregar.forEach(function (n) { p.push(hoja + ': falta la columna "' + n + '".'); });
  return p;
}

/** IDs vacíos o repetidos. ids: valores de la columna clave en las filas con datos. */
function problemasIds(hoja, clave, ids) {
  var p = [], vistos = {}, repetidos = {};
  var vacios = 0;
  ids.forEach(function (id) {
    var t = String(id === null || id === undefined ? '' : id).trim();
    if (!t) { vacios++; return; }
    if (vistos[t]) repetidos[t] = true;
    vistos[t] = true;
  });
  if (vacios) p.push(hoja + ': ' + vacios + (vacios === 1 ? ' fila sin ' : ' filas sin ') + clave + '.');
  var r = Object.keys(repetidos);
  if (r.length) p.push(hoja + ': ' + clave + ' repetido: ' + r.slice(0, 10).join(', ') + (r.length > 10 ? '…' : '') + '.');
  return p;
}

/** Períodos que no están guardados como texto AAAA-MM (por ejemplo, convertidos en fecha). */
function problemasPeriodos(hoja, columna, valores) {
  var malos = valores.filter(function (v) {
    return v !== '' && v !== null && v !== undefined && !(typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v));
  });
  return malos.length ? [hoja + ': ' + malos.length + ' valor(es) de ' + columna + ' no tienen el formato AAAA-MM (ej. ' + String(malos[0]).slice(0, 30) + ').'] : [];
}

/**
 * Texto legible de los cambios de una entrada del log: [{campo, antes, despues}].
 * antes/despues son JSON de objetos o texto simple.
 */
function cambiosLegibles(antes, despues) {
  var parse = function (t) {
    if (!t) return {};
    try { var o = JSON.parse(t); return o && typeof o === 'object' && !Array.isArray(o) ? o : { valor: o }; } catch (e) { return { valor: t }; }
  };
  var a = parse(antes), d = parse(despues);
  var campos = Object.keys(a).concat(Object.keys(d).filter(function (k) { return !(k in a); }));
  return campos.map(function (k) {
    var texto = function (v) { return v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); };
    return { campo: k, antes: texto(a[k]), despues: texto(d[k]) };
  });
}

// ---------------------------------------------------------------- Revisión sobre el Sheet

/** Revisa todas las hojas del esquema. Devuelve una lista de textos (vacía si todo está bien). */
function revisarIntegridad_() {
  var ss = abrirBase();
  var problemas = [];
  ESQUEMA.forEach(function (tabla) {
    var hoja = ss.getSheetByName(tabla.hoja);
    if (!hoja) { problemas.push('Falta la hoja ' + tabla.hoja + '.'); return; }
    var valores = hoja.getDataRange().getValues();
    var enc = valores.shift().map(String);
    var esperadas = columnasDe(tabla).map(function (c) { return c[0]; });
    problemas = problemas.concat(problemasEncabezados(tabla.hoja, enc.filter(function (x) { return x !== ''; }), esperadas));
    var filas = valores.filter(function (f) { return f.some(function (v) { return v !== ''; }); });
    if (tabla.clave) {
      var i = enc.indexOf(tabla.clave);
      if (i !== -1) problemas = problemas.concat(problemasIds(tabla.hoja, tabla.clave, filas.map(function (f) { return f[i]; })));
    }
    columnasDe(tabla).forEach(function (c) {
      if (c[1] !== 'periodo') return;
      var j = enc.indexOf(c[0]);
      if (j !== -1) problemas = problemas.concat(problemasPeriodos(tabla.hoja, c[0], filas.map(function (f) { return f[j]; })));
    });
  });
  return problemas;
}

/** Alertas de estructura (filas o columnas eliminadas) registradas desde `desde`. */
function alertasEstructuraDesde_(desde) {
  return leerTabla_('log').filter(function (l) {
    return String(l.accion).indexOf('alerta_') === 0 && l.accion !== 'alerta_integridad' && esFecha_(l.timestamp) && l.timestamp >= desde;
  });
}
