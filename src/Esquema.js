/**
 * Esquema de la base de datos (Google Sheet).
 *
 * Única fuente de verdad sobre qué hojas existen y qué columnas tiene cada una.
 * Lo usan Setup.js (para crear/verificar las hojas) y, más adelante, la capa de datos de la app.
 *
 * Tipos de columna (definen el formato de la columna en el Sheet):
 *   texto     texto libre
 *   id        identificador generado por la app (texto)
 *   periodo   'AAAA-MM' guardado como texto
 *   fecha     fecha (sin hora)
 *   fechahora fecha y hora
 *   monto     pesos enteros
 *   decimal   número con decimales (lecturas, consumos, costos unitarios)
 *   entero    número entero
 *   booleano  VERDADERO / FALSO
 *
 * Clases de tabla (definen qué columnas de auditoría se agregan):
 *   maestro       se edita en el lugar; cada cambio queda en `log` con valor antes/después
 *   transaccional nada se edita: corregir = anular + crear un registro nuevo que lo reemplaza
 *   sistema       configuración y registro interno
 *
 * No hay tablas de resultados: los cálculos (consumos, cuotas, totales) los hace la app al vuelo
 * a partir de estos datos. Qué se congela al emitir un estado de cuenta se decide en la etapa 2.
 */

var AUDITORIA_MAESTRO = [
  ['creado_por', 'texto', 'usuario_id de quien creó el registro'],
  ['creado_en', 'fechahora', 'cuándo se creó'],
  ['actualizado_por', 'texto', 'usuario_id del último cambio'],
  ['actualizado_en', 'fechahora', 'cuándo fue el último cambio'],
];

var AUDITORIA_TRANSACCIONAL = [
  ['creado_por', 'texto', 'usuario_id de quien lo registró'],
  ['creado_en', 'fechahora', 'cuándo se registró'],
  ['estado', 'texto', 'vigente / anulado'],
  ['anulado_por', 'texto', 'usuario_id de quien lo anuló'],
  ['anulado_en', 'fechahora', 'cuándo se anuló'],
  ['motivo_anulacion', 'texto', 'por qué se anuló'],
  ['reemplaza_a', 'id', 'ID del registro que este corrige, si aplica'],
];

var ESQUEMA = [
  // ---------------------------------------------------------------- Maestros
  {
    hoja: 'unidades', clase: 'maestro', clave: 'unidad_id',
    columnas: [
      ['unidad_id', 'id', 'L00…L31, BOD, CEX, CIN (se usa en el nombre del PDF)'],
      ['nombre', 'texto', 'Local 7, Bodega, Calle Exterior…'],
      ['tipo', 'texto', 'local / bodega / calle'],
      ['genera_estado_cuenta', 'booleano', 'las calles no generan'],
      ['es_area_comun', 'booleano', 'calles: su gasto va a Luz GC / Agua GC'],
      ['orden', 'entero', 'orden en pantallas'],
      ['activa', 'booleano', ''],
      ['notas', 'texto', ''],
      ['cuenta_gc', 'booleano', 'cuenta en el divisor del gasto común aunque esté vacía o exenta (D94)'],
      ['arriendo_sugerido', 'decimal', 'monto sugerido al crear un contrato; vacío = sin sugerido (D110)'],
      ['moneda_sugerido', 'texto', 'UF / CLP (D110)'],
    ],
  },
  {
    hoja: 'medidores', clase: 'maestro', clave: 'medidor_id',
    columnas: [
      ['medidor_id', 'id', 'ej. MED-L07-LUZ-1'],
      ['unidad_id', 'id', ''],
      ['servicio', 'texto', 'luz / agua'],
      ['n_serie', 'texto', 'opcional'],
      ['fecha_instalacion', 'fecha', ''],
      ['lectura_inicial', 'decimal', 'lectura al instalar (no siempre 0)'],
      ['fecha_retiro', 'fecha', 'vacío si sigue instalado'],
      ['lectura_final', 'decimal', 'última lectura antes del retiro; vacío si se desconoce'],
      ['lectura_final_desconocida', 'booleano', 'VERDADERO si al retirarlo no se anotó la lectura'],
      ['estado', 'texto', 'activo / retirado (un solo activo por unidad y servicio)'],
    ],
  },
  {
    hoja: 'locatarios', clase: 'maestro', clave: 'locatario_id',
    columnas: [
      ['locatario_id', 'id', 'ej. LOC-0012'],
      ['rut', 'texto', 'validado con dígito verificador; único'],
      ['razon_social', 'texto', ''],
      ['nombre_contacto', 'texto', ''],
      ['correo', 'texto', 'validado; aviso si termina en .co con dominio típico'],
      ['telefono', 'texto', ''],
      ['notas', 'texto', ''],
      ['oculto', 'booleano', 'VERDADERO = no aparece para elegir en contratos ni pagos (D115); vacío = visible'],
    ],
  },
  {
    hoja: 'contratos', clase: 'maestro', clave: 'contrato_id',
    columnas: [
      ['contrato_id', 'id', 'ej. CON-0034'],
      ['unidad_id', 'id', ''],
      ['locatario_id', 'id', ''],
      ['fecha_inicio', 'fecha', 'el día de inicio se cobra (prorrateo del primer mes)'],
      ['fecha_fin', 'fecha', 'vacío = indefinido; último día pagado (D95, D113)'],
      ['estado', 'texto', 'por_iniciar / vigente / terminado / anulado (se actualiza cada madrugada)'],
      ['paga_gc', 'booleano', ''],
      ['garantia_monto', 'monto', ''],
      ['notas', 'texto', ''],
    ],
  },
  {
    hoja: 'contrato_arriendos', clase: 'transaccional', clave: 'tramo_id',
    columnas: [
      ['tramo_id', 'id', 'ej. TRA-000045'],
      ['contrato_id', 'id', ''],
      ['desde_periodo', 'periodo', 'rige hasta que empieza el tramo siguiente'],
      ['monto', 'decimal', 'arriendo mensual en la moneda del tramo (UF con decimales, ej. 16,5)'],
      ['motivo', 'texto', 'catálogo motivo_tramo'],
      ['comentario', 'texto', 'obligatorio si el monto es 0'],
      ['moneda', 'texto', 'UF / CLP; vacío = CLP (tramos anteriores a 2.1)'],
    ],
  },

  {
    hoja: 'valores_uf', clase: 'transaccional', clave: 'uf_id',
    columnas: [
      ['uf_id', 'id', 'ej. UF-000001; único vigente por fecha'],
      ['fecha', 'fecha', 'día de la UF (la boleta usa el último día del mes que cobra, D106)'],
      ['valor', 'decimal', 'pesos por UF, con dos decimales'],
      ['fuente', 'texto', 'cmf / manual'],
      ['motivo', 'texto', 'obligatorio si es manual'],
    ],
  },

  // ------------------------------------------------------- Cierre mensual
  {
    hoja: 'cierres', clase: 'maestro', clave: 'periodo',
    columnas: [
      ['periodo', 'periodo', ''],
      ['estado', 'texto', 'borrador / confirmado / reabierto'],
      ['n_locales_gc_calculado', 'entero', 'unidades marcadas con cuenta_gc (D94)'],
      ['n_locales_gc_usado', 'entero', 'editable por cualquier usuario, con motivo'],
      ['motivo_ajuste_gc', 'texto', ''],
      ['ajuste_gc_por', 'texto', ''],
      ['ajuste_gc_en', 'fechahora', ''],
      ['confirmado_por', 'texto', ''],
      ['confirmado_en', 'fechahora', ''],
      ['reabierto_por', 'texto', ''],
      ['reabierto_en', 'fechahora', ''],
      ['motivo_reapertura', 'texto', ''],
    ],
  },
  {
    hoja: 'boletas_servicio', clase: 'transaccional', clave: 'boleta_id',
    columnas: [
      ['boleta_id', 'id', 'ej. BOL-000012; única vigente por (periodo, servicio)'],
      ['periodo', 'periodo', ''],
      ['servicio', 'texto', 'luz / agua'],
      ['monto_total', 'monto', ''],
      ['consumo_total', 'decimal', 'kWh o m³'],
      ['costo_unitario_calculado', 'decimal', 'monto / consumo'],
      ['costo_unitario_usado', 'decimal', 'igual al calculado salvo ajuste'],
      ['motivo_ajuste', 'texto', ''],
      ['ajustado_por', 'texto', ''],
      ['ajustado_en', 'fechahora', ''],
    ],
  },
  {
    hoja: 'lecturas', clase: 'transaccional', clave: 'lectura_id',
    columnas: [
      ['lectura_id', 'id', 'ej. LEC-000123; única vigente por (periodo, medidor)'],
      ['periodo', 'periodo', 'mes al que se asigna (se lee los primeros días del mes siguiente)'],
      ['medidor_id', 'id', ''],
      ['unidad_id', 'id', 'copiado del medidor, para filtrar sin cruzar tablas'],
      ['servicio', 'texto', 'copiado del medidor'],
      ['lectura', 'decimal', 'valor acumulado'],
      ['fecha_lectura', 'fecha', ''],
      ['origen', 'texto', 'manual / foto'],
      ['es_cambio_medidor', 'booleano', 'primera lectura de un medidor nuevo'],
      ['alertas', 'texto', 'NEGATIVO, FUERA_RANGO, IGUAL_A_OTRO_MEDIDOR…'],
      ['comentario_alerta', 'texto', 'opcional; obligatorio solo si la lectura queda en revisión'],
      ['estado_revision', 'texto', 'vacío / en_revision / resuelta'],
      ['traspaso', 'texto', 'vacío = lectura del mes; "salida:CON-…" o "entrada:CON-…" = lectura de traspaso (D115)'],
    ],
  },
  {
    hoja: 'gastos_comunes', clase: 'transaccional', clave: 'gasto_id',
    columnas: [
      ['gasto_id', 'id', 'ej. GC-000034'],
      ['periodo', 'periodo', ''],
      ['concepto', 'texto', 'catálogo concepto_gc'],
      ['monto', 'monto', ''],
      ['glosa', 'texto', 'obligatoria si es Extraordinario'],
    ],
  },

  // ----------------------------------------------------------- Movimientos
  {
    hoja: 'movimientos', clase: 'transaccional', clave: 'mov_id',
    columnas: [
      ['mov_id', 'id', 'ej. MOV-000045'],
      ['fecha', 'fecha', 'fecha del hecho'],
      ['periodo_aplica', 'periodo', 'estado de cuenta donde se cobra o descuenta'],
      ['unidad_id', 'id', ''],
      ['contrato_id', 'id', 'se completa solo según el período'],
      ['categoria', 'texto', 'catálogo categoria_movimiento'],
      ['monto', 'monto', 'positivo = cargo, negativo = descuento'],
      ['glosa', 'texto', 'texto que aparecerá en el estado de cuenta'],
      ['grupo_cuotas', 'id', 'agrupa las cuotas de un mismo plan'],
      ['cuota_n', 'entero', ''],
      ['cuota_total', 'entero', ''],
    ],
  },
  {
    hoja: 'pagos', clase: 'transaccional', clave: 'pago_id',
    columnas: [
      ['pago_id', 'id', 'ej. PAG-000078; una fila por local'],
      ['fecha_pago', 'fecha', ''],
      ['unidad_id', 'id', ''],
      ['locatario_id', 'id', 'desde el contrato vigente; editable si pagó un tercero'],
      ['periodo_aplica', 'periodo', 'opcional'],
      ['monto', 'monto', 'positivo; total o parcial'],
      ['medio', 'texto', 'catálogo medio_pago (por defecto Transferencia)'],
      ['referencia', 'texto', 'N° de operación; une los pagos de una misma transferencia'],
      ['glosa', 'texto', ''],
    ],
  },

  // ---------------------------------------------------------------- Sistema
  {
    hoja: 'usuarios', clase: 'maestro', clave: 'usuario_id',
    columnas: [
      ['usuario_id', 'id', 'ej. USR-01'],
      ['nombre', 'texto', 'el nombre que se elige al ingresar'],
      ['rol', 'texto', 'administradora / digitadora / solo_lectura'],
      ['activo', 'booleano', ''],
      ['pin_hash', 'texto', 'SHA-256 del PIN con sal; nunca el PIN'],
      ['pin_salt', 'texto', ''],
      ['intentos_fallidos', 'entero', ''],
      ['bloqueado_hasta', 'fechahora', ''],
      ['debe_cambiar_pin', 'booleano', 'VERDADERO tras un reseteo'],
      ['pin_cambiado_en', 'fechahora', ''],
    ],
  },
  {
    hoja: 'log', clase: 'sistema', clave: 'log_id',
    columnas: [
      ['log_id', 'id', ''],
      ['timestamp', 'fechahora', ''],
      ['usuario_id', 'texto', ''],
      ['origen', 'texto', 'app / edicion_manual'],
      ['accion', 'texto', 'crear, anular, editar, ajustar_costo, confirmar_cierre, login…'],
      ['tabla', 'texto', ''],
      ['registro_id', 'texto', ''],
      ['antes', 'texto', 'JSON'],
      ['despues', 'texto', 'JSON'],
      ['motivo', 'texto', ''],
    ],
  },
  {
    hoja: 'catalogos', clase: 'sistema', clave: null,
    columnas: [
      ['tipo', 'texto', 'categoria_movimiento, concepto_gc, medio_pago, motivo_tramo'],
      ['valor', 'texto', ''],
      ['activo', 'booleano', ''],
      ['orden', 'entero', ''],
    ],
  },
  {
    hoja: 'parametros', clase: 'sistema', clave: 'clave',
    columnas: [
      ['clave', 'texto', ''],
      ['valor', 'texto', ''],
      ['descripcion', 'texto', ''],
    ],
  },
];

/** Columnas completas de una tabla, con las de auditoría según su clase. */
function columnasDe(tabla) {
  var extra = tabla.clase === 'maestro' ? AUDITORIA_MAESTRO
    : tabla.clase === 'transaccional' ? AUDITORIA_TRANSACCIONAL
    : [];
  return tabla.columnas.concat(extra);
}

var CATALOGOS_INICIALES = [
  ['categoria_movimiento', ['Deuda arrastrada', 'Cuota garantía', 'Devolución garantía', 'Multa',
    'Descuento', 'Reparación', 'Cuota reajuste', 'Otro']],
  ['concepto_gc', ['Administración', 'Aseo general', 'Jardinería', 'Personal aseo', 'Seguridad',
    'Extraordinario']],
  ['medio_pago', ['Transferencia', 'Efectivo', 'Cheque', 'Otro']],
  ['motivo_tramo', ['Inicial', 'Reajuste', 'Renegociación', 'Condonación']],
];

var PARAMETROS_INICIALES = [
  ['alerta_factor_alto', '2', 'Alerta si el consumo supera N veces el promedio histórico'],
  ['alerta_factor_bajo', '0.5', 'Alerta si el consumo es menor que N veces el promedio histórico'],
  ['alerta_meses_promedio', '6', 'Meses con lectura usados para el promedio'],
  ['alerta_min_kwh', '5', 'Diferencias menores a esto (kWh) no generan alerta de rango'],
  ['alerta_min_m3', '1', 'Diferencias menores a esto (m³) no generan alerta de rango'],
  ['alerta_costo_unitario_variacion', '0.3', 'Alerta si el costo unitario varía más de este % vs. el mes anterior'],
  ['pin_largo', '6', 'Dígitos del PIN'],
  ['pin_intentos_max', '5', 'Intentos fallidos antes del bloqueo'],
  ['pin_bloqueo_minutos', '15', 'Duración del bloqueo'],
  ['sesion_horas', '6', 'Duración máxima de la sesión antes de pedir el PIN de nuevo (máximo 6)'],
  ['sesion_inactividad_minutos', '30', 'La sesión se cierra tras estos minutos sin actividad (0 = sin límite)'],
  ['periodo_reglas_2_1', '2026-11', 'Desde este período (AAAA-MM) rigen arriendo en UF, término = último día pagado y GC proporcional (D112)'],
];
