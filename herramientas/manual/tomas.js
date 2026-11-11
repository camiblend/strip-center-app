// Capturas del manual, en pares: _pc (computador) y _cel (celular). Pasos: JavaScript que corre en la página, en orden.
const H = `window.$=function(s){return document.querySelector(s)};window.esc_=function(s,v){var e=$(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};
window.ant_=function(m){var f=llamar('datosLecturas','T-dig',{}).datos.fichas.filter(function(x){return x.medidor_id===m})[0];return f.anterior.valor};`;
const esperar = (ms) => `new Promise(function(r){setTimeout(r,${ms})})`;
const L13 = ['#tl-MED-L13-LUZ-1'];
const PC = { ancho: 840, alto: 760 };
const tomas = [];
// o: {recorte} o {pc:{...}, cel:{...}} con altoFijo/maxAlto por formato
const par = (nombre, url, pasos, o) => {
  o = o || {};
  tomas.push(Object.assign({ nombre: nombre + '_pc', url, pasos: [H].concat(pasos || []), recorte: o.recorte }, PC, o.pc || {}));
  tomas.push(Object.assign({ nombre: nombre + '_cel', url, pasos: [H].concat(pasos || []), recorte: o.recorte, ancho: 390 }, o.cel || {}));
};
const pantalla = { pc: { altoFijo: 760 }, cel: { maxAlto: 900 } };
const tarjeta = ['#contenido > div.tarjeta'];
const conTitulo = ['#contenido h1', '#contenido > div.tarjeta'];
// Ingreso y movimiento
par('ingreso', 'login=1', [], { recorte: ['.ingreso'] });
par('pin_nuevo', 'rol=nuevo', [], { recorte: ['.ingreso'] });
par('inicio', 'rol=dig', [], pantalla);
par('menu', 'rol=dig', ["if (innerWidth < 700) $('#b-menu').click()"], { pc: { altoFijo: 760 }, cel: { altoFijo: 844 } });
par('periodo', 'rol=dig&vista=boletas', ["$('.sp-boton').click()"], { recorte: ['#contenido h1', '.sp-boton', '.sp-panel'] });
par('sin_conexion', 'rol=dig&vista=inicio', ["window.SIN_CONEXION_FALSA=true", "IT.irA('boletas')", esperar(3800)], { recorte: ['#contenido .mensaje'] });
// Cierre del mes
par('boletas', 'rol=dig&vista=boletas', [], { recorte: conTitulo });
par('lecturas', 'rol=dig&vista=lecturas', [], { recorte: ['#contenido h1', '#tl-MED-L00-LUZ-1'] });
par('lectura_escribir', 'rol=dig&vista=lecturas', ["esc_('#in-MED-L13-LUZ-1', String(ant_('MED-L13-LUZ-1')+97))"], { recorte: L13 });
par('lectura_aviso', 'rol=dig&vista=lecturas', ["esc_('#in-MED-L13-LUZ-1', String(ant_('MED-L13-LUZ-1')+460))"], { recorte: L13 });
par('lectura_guardada', 'rol=dig&vista=lecturas', [], { recorte: ['#tl-MED-L07-LUZ-1'] });
par('lectura_menor', 'rol=dig&vista=lecturas', ["esc_('#in-MED-L13-LUZ-1', String(ant_('MED-L13-LUZ-1')-50))", "$('[data-guardar=\"MED-L13-LUZ-1\"]').click()"], { recorte: L13 });
par('lectura_mal', 'rol=dig&vista=lecturas', ["esc_('#in-MED-L13-LUZ-1', String(ant_('MED-L13-LUZ-1')-50))", "$('[data-guardar=\"MED-L13-LUZ-1\"]').click()", "$('#fm-mal-MED-L13-LUZ-1').click()", "esc_('#com-MED-L13-LUZ-1','El mes pasado se anotó un número de más')"], { recorte: L13 });
// 2.2 (D115): lectura de traspaso del Local 16 (la Óptica pagó hasta el 15-11 y la Peluquería entró el 16)
par('lectura_traspaso', 'rol=dig&vista=lecturas', ["esc_('#tr-MED-L16-LUZ-1-0', String(ant_('MED-L16-LUZ-1')+42))", "$('[data-traspaso]').click()", esperar(400)], { recorte: ['#tl-MED-L16-LUZ-1'] });
par('lectura_medidor_nuevo', 'rol=dig&vista=lecturas', ["esc_('#in-MED-L13-LUZ-1', '35')", "$('[data-guardar=\"MED-L13-LUZ-1\"]').click()", "$('#fm-si-MED-L13-LUZ-1').click()"], { recorte: L13 });
par('gastos_fijos', 'rol=dig&vista=gastos', ["$('[data-fijo-igual=\"2\"]').click()"], { recorte: tarjeta });
par('gastos_total', 'rol=dig&vista=gastos', ["document.querySelectorAll('#extras + .tarjeta details')[0].open=true"], { recorte: ['#extras', '#extras + .tarjeta'] });
// 2.1: la tabla se desplaza hasta el Local 16, que cambió de locatario en noviembre (GC por días)
par('resumen', 'rol=dig&vista=resumen', ["var r=Array.prototype.filter.call(document.querySelectorAll('.tabla-scroll tbody tr'),function(t){return t.innerText.indexOf('Local 15')===0})[0]; if(r){$('.tabla-scroll').scrollTop=r.offsetTop-60}"], { recorte: ['#contenido h1', '.tabla-scroll'], cel: { recorte: ['#contenido h1', '#contenido > div.tarjeta'] } });
// Movimientos
par('cargos', 'rol=dig&vista=cargos', [], pantalla);
par('cargo_nuevo', 'rol=dig&vista=cargos', ["$('#b-nuevo').click()", "esc_('#c-uni','L13')", "esc_('#c-cat','Otro')", "esc_('#c-monto','10000')", "esc_('#c-glosa','Marketing')", esperar(300)], { recorte: conTitulo });
par('cargo_cuotas', 'rol=dig&vista=cargos', ["$('#b-nuevo').click()", "esc_('#c-uni','L16')", "esc_('#c-monto','300000')", "$('#c-encuotas').click()", "esc_('#c-n','3')"], { recorte: ['label.casilla:has(#c-encuotas)', '#c-cuotas'] });
par('pagos', 'rol=dig&vista=pagos', [], pantalla);
par('pago_nuevo', 'rol=dig&vista=pagos', ["$('#b-nuevo').click()", "esc_('#p-uni','L13')", "esc_('#p-monto','425000')", "esc_('#p-ref','5530118')"], { recorte: conTitulo });
// Maestros
par('locatarios', 'rol=dig&vista=locatarios', [], pantalla);
par('locatario_nuevo', 'rol=dig&vista=locatarios', ["$('#l-nuevo').click()", "esc_('#lc-rut', llamar('maestros','T-dig',{}).datos.locatarios.filter(function(l){return l.locatario_id==='LOC-0007'})[0].rut)", "esc_('#lc-razon','Lavandería Burbujas')", "esc_('#lc-correo','burbujas@gmail.co')", "$('#f-loc button').click()", esperar(300)], { recorte: ['#contenido h1', '#m-form', '#contenido > div.tarjeta'] });
par('unidades', 'rol=dig&vista=contratos', [], pantalla);
par('unidad', 'rol=dig&vista=contratos', ["IT.irA('contratos', null, {unidad:'L13'})"], { recorte: ['#contenido h1', '#contenido > div.tarjeta'] });
par('contrato_nuevo', 'rol=dig&vista=contratos', ["IT.irA('contratos', null, {unidad:'L21'})", "$('#b-nuevo').click()", "esc_('#f-loc','LOC-0010')", "esc_('#f-inicio','2026-11-15')", "$('#f-usar').click()", esperar(900)], { recorte: conTitulo });
par('contrato_terminar', 'rol=dig&vista=contratos', ["IT.irA('contratos', null, {unidad:'L13'})", "$('[data-accion=terminar]').click()", "esc_('#x-fin','2026-12-31')", esperar(700)], { recorte: conTitulo });
par('cambiar_arriendo', 'rol=dig&vista=contratos', ["IT.irA('contratos', null, {unidad:'L30'})", "$('[data-accion=reajuste]').click()", "esc_('#t-monto','22')"], { recorte: conTitulo });
// Administradora
par('admin_uf', 'rol=admin&sinuf=1', [], { recorte: ['#contenido > div.tarjeta:has(#uf-form)'] });
par('admin_resolver', 'rol=admin&vista=lecturas&serv=agua', [], { recorte: ['#tl-MED-L12-AGUA-1'] });
par('admin_confirmar', 'rol=admin&vista=confirmar', [], { recorte: ['#contenido > div.tarjeta:nth-child(4)', '#contenido > div.tarjeta:nth-child(6)'] });
par('admin_reabrir', 'rol=admin&vista=confirmar&per=2026-10', [], { recorte: tarjeta });
par('admin_gastos_fijos', 'rol=admin&vista=gastos', [], { recorte: tarjeta });
par('admin_boleta', 'rol=admin&vista=boletas', ["document.querySelector('details').open=true"], { recorte: tarjeta });
par('admin_unidad', 'rol=admin&vista=contratos', ["IT.irA('contratos', null, {unidad:'L11'})"], { recorte: ['div.tarjeta:has(#u-cuenta-gc)'] });
par('admin_locatario_oculto', 'rol=admin&vista=locatarios', ["$('#l-ocultos').click()", "Array.prototype.filter.call(document.querySelectorAll('[data-loc]'),function(a){return a.innerText.indexOf('Prueba SPA')!==-1})[0].click()", esperar(200)], { recorte: conTitulo });
par('admin_usuarios', 'rol=admin&vista=usuarios', [], pantalla);
par('admin_pin_temporal', 'rol=admin&vista=usuarios', ["$('[data-accion=resetear][data-nombre=Digitadora]').click()"], { recorte: conTitulo });
par('admin_actividad', 'rol=admin&vista=actividad', [], pantalla);
module.exports = tomas;
