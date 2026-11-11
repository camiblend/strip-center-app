/** Diagnóstico: foto del Resumen y de quién paga GC en un período, para comparar antes y después de un cambio de reglas. No modifica datos. */
function fotoResumen(periodo) {
  periodo = periodo || '2026-10';
  var cx = contextoPeriodo_(periodo);
  var r = resumen_({ u: 'diagnostico', r: 'administradora' }, { periodo: periodo });
  var foto = { periodo: periodo, gc: r.gc, divisor: r.divisor, pagan: cx.pagan, conContrato: cx.conContrato,
    filas: r.filas.map(function (f) { return [f.unidad_id, f.locatario, f.pagaGC, f.cuotaGC === null ? null : Math.round(f.cuotaGC),
      f.gastoLuz === null ? null : Math.round(f.gastoLuz), f.gastoAgua === null ? null : Math.round(f.gastoAgua)]; }) };
  Logger.log(JSON.stringify(foto));
  return foto;
}
