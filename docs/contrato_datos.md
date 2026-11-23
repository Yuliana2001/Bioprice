# Contrato inicial de datos analíticos

Este contrato documenta únicamente salidas encontradas en `notebook/BioPrice_BI_corregido.ipynb`. Los nombres de archivos y columnas son conocidos por el código, pero no hay una copia local que permita confirmar los tipos físicos finales o la nulabilidad del Parquet.

| Archivo | Formato | Uso | Estado |
|---|---|---|---|
| `base_analitica.parquet` | Parquet | Importaciones clasificadas y campos analíticos | Salida declarada por el notebook; pendiente de sincronización/validación |
| `licitaciones_secop.csv` | CSV UTF-8 con BOM | Procesos/contratos públicos relacionados | Salida declarada; sus valores no son precios unitarios |
| `metricas_ml.json` | JSON UTF-8 | Métricas de los modelos disponibles | Salida declarada |
| `descartados.csv` | CSV UTF-8 con BOM | Auditoría de descartes y motivos | Salida declarada |

## Campos del Parquet principal

El notebook mantiene las columnas de origen y agrega los siguientes campos conocidos:

- **Fecha/periodo**: `FECHA`, `ANIO`, `PERIODO_MES`.
- **Entrada normalizada**: `_subpartida`, `_descripcion`, `_cantidad`, `_unidad`, `_peso_neto`, `_peso_bruto`, `_fob`, `_pais`, `_importador`, `_nit`.
- **Clasificación/verificación**: `EQUIPO_CLASIFICADO`, `CATEGORIA_REGISTRO`, `NIVEL_DE_CONFIANZA`, `ESTADO_IDENTIFICACION`, `COINCIDENCIA_PESO`, `COINCIDENCIA_SUBPARTIDA`, `VERIFICACION_INVIMA`, `MODELO_CANDIDATO`, `FUENTE_MODELO`, `URL_FICHA`, `OBSERVACIONES`, `DESCARTE_TIPO`, `DESCARTE_DETALLE`, `PESO_UNITARIO_KG`, `PESO_MIN_FICHA_KG`, `PESO_MAX_FICHA_KG`.
- **Precio/ML**: `PRECIO_UNIT_USD`, `ES_ANOMALIA_PRECIO`, `SCORE_ANOMALIA`, `METODO_ANOMALIA`, `PRECIO_ESPERADO_USD`, `RAZON_PRECIO_ESPERADO`.

Los valores de precio están en USD; los pesos, en kg; los porcentajes de variación se expresan como porcentaje. `PRECIO_UNIT_USD` solo se calcula para unidad comercial individual, con cantidad y FOB positivos. Los campos específicos de ficha/modelo, país e identificadores pueden ser nulos o vacíos según disponibilidad. Los tipos y valores nulos exactos de cada columna deben verificarse en Parquet; no se coercionan ni completan con datos ficticios.

## SECOP

El esquema estándar incluye `ID`, `ENTIDAD`, `NIT_ENTIDAD`, `DEPARTAMENTO`, `CIUDAD`, `MODALIDAD`, `DESCRIPCION`, `VALOR_ESTIMADO`, `VALOR_ADJUDICADO`, `PROVEEDOR`, `NIT_PROVEEDOR`, `FECHA`, `ESTADO`, `URL`, `ANIO`, `DATASET`, `FAMILIA`, `CATEGORIA_LICITACION` y `ADVERTENCIA`. Los valores contractuales pueden cubrir múltiples bienes/servicios y no se mezclarán con `PRECIO_UNIT_USD`.

## Metadatos de sincronización pendientes

El notebook no exporta un manifiesto con versión de esquema, fecha de generación, conteo de filas ni tipos/nulabilidad. La integración deberá validar el esquema real y detectar archivos faltantes; los responsables deberán acordar un manifiesto antes de depender de una fecha de actualización publicada por la API.

La sincronización inicial es manual. Los artefactos se copian a `data/analytics/`; FastAPI no descarga datos ni ejecuta notebooks al iniciar. La API debe seleccionar columnas y paginar y, cuando se implemente, consultar Parquet/CSV sin cargar el dataset completo a Pandas.
