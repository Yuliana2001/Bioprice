# Inventario de visualizaciones del notebook

Fuente: `notebook/BioPrice_BI_corregido (1).ipynb`, 56 celdas, numeradas
desde 1 en las tablas siguientes. Este inventario describe el código y no
sustituye los resultados calculados por cada ejecución del notebook.

## Filtros y ámbito de los datos

- La distribución inicial usa `conservados` completo. INVIMA usa
  `invima_equipos`, que se obtiene al expandir `EQUIPOS_RELACIONADOS`.
- El cruce DIAN–INVIMA utiliza las fechas `FECHA_INICIO` y `FECHA_FIN`
  configuradas en la celda, categorías compatibles, registros INVIMA vigentes
  y una similitud mínima de 88. La versión inspeccionada fija el período
  del 1 de enero al 31 de agosto de 2026.
- Los indicadores del notebook parten de `base`, calculada con
  `I.preparar(conservados, solo_principal=True)` y ML, y de `sin_anom`,
  que excluye las anomalías. `FAMILIA` es el nombre obtenido de `C.EQUIPOS`.
- Streamlit carga `base` y crea `d` aplicando familia, intervalo de años,
  país, texto de importador, confianza mínima y exclusión opcional de
  anomalías. También permite elegir año, trimestre o mes para las series.
  Los indicadores se calculan **después** de aplicar estos filtros.
- SECOP en el notebook se descarga en Colab; Streamlit tiene otra consulta
  explícita con selección de familias, límite por dataset y categoría.
  Sus valores son de procesos o contratos en COP, no precios unitarios.

## Gráficas fuera de Streamlit

| Celda | Visualización | Datos y transformación exactos | Columnas utilizadas |
|---|---|---|---|
| 26 | Distribución de equipos biomédicos | `conservados`; `countplot`, ordenado por `value_counts()` | `EQUIPO_CLASIFICADO`; conteo de registros |
| 31 | Registros sanitarios INVIMA por equipo biomédico | `invima_equipos.groupby(["EQUIPOS_RELACIONADOS", "ESTADO_REGISTRO"])["REGISTRO_SANITARIO"].nunique()` | `EQUIPOS_RELACIONADOS`, `ESTADO_REGISTRO`, `CANTIDAD` |
| 34 | Marcas y modelos con coincidencia entre INVIMA y DIAN | `df_grafico` agrupa por categoría y marca más producto INVIMA; cuenta registros sanitarios no nulos, calcula registros distintos y conserva los 15 primeros por categoría en `top_modelos` | `CATEGORIA`, `MARCA_MODELO`, `COINCIDENCIAS`, `REGISTROS_INVIMA` |
| 38 | Precio unitario mediano (USD, sin anomalías) | `serie = I.serie_precios(sin_anom, "Y", por=("FAMILIA",))`; línea con eje logarítmico | `PERIODO`, `FAMILIA`, `mediana`, `n`, `p25`, `p75`, `VAR_PCT_MEDIANA` |
| 38 | Variación % anual de la mediana | La misma `serie`; barras agrupadas | `PERIODO`, `FAMILIA`, `VAR_PCT_MEDIANA` |
| 38 | Precio mediano por país; una gráfica por familia | `pais = I.comparacion_pais(sin_anom.assign(EQUIPO_CLASIFICADO=sin_anom["FAMILIA"]))`; color según prima | `EQUIPO_CLASIFICADO`, `PAIS_ORIGEN`, `mediana`, `PRIMA_PCT_VS_FAMILIA`, `n`, `CUOTA_UNIDADES_PCT` |
| 40 | Concentración del mercado | `conc = I.concentracion(dd)`, donde `dd` es `sin_anom` con nombre de familia en `EQUIPO_CLASIFICADO` | `ANIO`, `EQUIPO_CLASIFICADO`, `HHI`; HHI de 0 a 10.000 |
| 40 | Evolución de cuota de valor FOB; una gráfica por familia | `I.evolucion_cuotas(dd, fam)`; selecciona los diez mayores importadores por FOB total y agrupa el resto como `OTROS` | `ANIO`, `NOMBRE`, `CUOTA_PCT`; conservar además la familia usada en cada llamada |
| 47 | Valor de contratos de equipos principales (COP) | De `lic`, filtra `CATEGORIA_LICITACION == "Equipo principal completo"` y el dataset de contratos; `VALOR_ESTIMADO` agrupado por año y familia con `count`, `sum`, `median` | `ANIO`, `FAMILIA_NOMBRE`, `sum`; la tabla también incluye `count`, `median` |

La variable `resumen` se reutiliza más adelante en el notebook para las
coincidencias: al exportar INVIMA al final no debe suponerse que aún contiene
el resumen de la celda 31. Asimismo, `top_modelos` solo se asigna si existen
coincidencias; una ejecución repetida puede dejar variables anteriores en
memoria.

## Gráficas dentro de Streamlit

Todas están en la celda 54. Algunas representan el mismo indicador que las
gráficas anteriores, pero con los filtros de Streamlit y, en su caso, una
frecuencia seleccionable. No son equivalentes a filtrar visualmente un
resultado calculado antes de esos filtros.

| Pestaña | Visualización | Datos y transformación exactos | Columnas utilizadas |
|---|---|---|---|
| Precios | Precio unitario mediano (USD) | `I.serie_precios(d, freq, por=("FAMILIA",))`; escala logarítmica opcional | `PERIODO`, `FAMILIA`, `mediana`, `n`, `p25`, `p75`, `VAR_PCT_MEDIANA` |
| Precios | Variación % de la mediana vs periodo anterior | La misma serie, con la frecuencia elegida | `PERIODO`, `FAMILIA`, `VAR_PCT_MEDIANA` |
| Precios | Distribución del precio unitario | `d.dropna(subset=["PRECIO_UNIT_USD"])`; caja y valores atípicos de Plotly, eje logarítmico | `FAMILIA`, `PRECIO_UNIT_USD` |
| Países | Precio mediano por país de origen | `I.comparacion_pais(d.assign(EQUIPO_CLASIFICADO=d["FAMILIA"]))`, filtrado por la familia elegida | `EQUIPO_CLASIFICADO`, `PAIS_ORIGEN`, `mediana`, `PRIMA_PCT_VS_FAMILIA`, `n`, `CUOTA_UNIDADES_PCT` |
| Importadores | Principales importadores por valor FOB (USD) | `ml.segmentar_importadores(I.perfil_importadores(dd))`; primeras 25 filas de la familia seleccionada | `EQUIPO_CLASIFICADO`, `IMPORTADOR`, `valor_fob`, `SEGMENTO` |
| Importadores | Evolución de la cuota de valor | `I.evolucion_cuotas(dd, fam_i)` | `ANIO`, `NOMBRE`, `CUOTA_PCT` |
| Importadores | Concentración del mercado (HHI y cuota del top-5) | `I.concentracion(dd)`, filtrado por familia | `EQUIPO_CLASIFICADO`, `ANIO`, `HHI`, `TOP5_PCT` |
| Licitaciones | Valor adjudicado por año (COP) | Consulta explícita de SECOP, filtro por categoría y suma por año y familia | `ANIO`, `FAMILIA`, `VALOR_ADJUDICADO`; también se agrupa `VALOR_ESTIMADO` |
| Calidad y ML | Nivel de confianza por familia | Histograma agrupado sobre `d` | `NIVEL_DE_CONFIANZA`, `FAMILIA`; conteo de registros |

En Streamlit, `dd` se construye a partir de `d`, no del `dd` de la celda 40.
La visualización de SECOP solo aparece tras consultar y obtener registros.

## Indicadores y tablas complementarios

- Streamlit muestra conteo de registros, suma `_fob` en USD, mediana
  `PRECIO_UNIT_USD` y conteo de `ESTADO_IDENTIFICACION == "Confirmado"`,
  todos sobre `d`.
- La tabla de series incluye también `unidades`, `valor_fob`,
  `precio_ponderado` y `MUESTRA_PEQUENA`; la de país incluye
  `unidades`, `valor_fob`, `mediana_familia` y `MUESTRA_PEQUENA`.
- El perfil de importadores incluye `ACTOR`, `registros`, `unidades`,
  `primer_anio`, `ultimo_anio`, `anios_activos`, `precio_mediano`,
  `CUOTA_VALOR_PCT` y `TENDENCIA_VALOR_FOB_USD_ANIO`, además de las
  columnas de la gráfica. Concentración incluye `n_importadores`.
- SECOP muestra el cruce de familia, dataset y categoría; tablas de contratos
  por año, proveedores y entidades; y una comparación indicativa con
  importaciones que conserva por separado COP y USD. Streamlit muestra
  además la tabla de registros filtrados por categoría.
- Calidad y ML muestra las métricas disponibles y hasta 500 anomalías;
  Datos muestra hasta 5.000 registros seleccionados y ofrece descarga.
  Las celdas anteriores también muestran auditorías de clasificación,
  INVIMA y coincidencias.

## Consecuencias para la exportación

Las medianas, percentiles, variaciones, primas, segmentación, HHI, top-5 y
cuotas no se pueden reconstruir correctamente filtrando agregados globales
por país o importador. Por ejemplo, la mediana de una familia filtrada por
importador no se obtiene filtrando la mediana ya agrupada por familia y año.
El gráfico de caja de Streamlit también necesita los valores de precio o una
exportación de sus estadísticas y valores atípicos para los filtros elegidos.

La API verifica el manifiesto, los tipos y los límites de los archivos
sincronizados. Una visualización cuya exportación falló se muestra como no
disponible, aunque exista una copia anterior.
