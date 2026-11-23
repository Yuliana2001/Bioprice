# Inspección del notebook

## Inventario y exportador parcial

El [inventario de visualizaciones](inventario_visualizaciones.md) incluye las
gráficas de las celdas del notebook y las de Streamlit, sus datos y filtros.

Existe un primer módulo independiente,
[`exportar_resultados_bi.py`](../notebook/exportar_resultados_bi.py), que
exporta nueve gráficas de las celdas del notebook y la serie mensual de TRM a
Parquet Snappy, y registra
las nueve visualizaciones de Streamlit como pendientes en el manifiesto.
Es una **implementación parcial**: todavía faltan las exportaciones de
Streamlit y sus visualizaciones en el dashboard. Las gráficas de las celdas
principales usan los archivos disponibles, incluidos los estados independientes
de SECOP y de coincidencias vacías.
El endpoint de marcas y modelos comprueba el estado, la fecha y el número de
filas contra el manifiesto cuando este existe: no presenta un archivo
conservado tras una exportación fallida como resultado actualizado. Para
mantener la compatibilidad con exportaciones anteriores, todavía acepta un
archivo sin manifiesto y muestra únicamente la fecha contenida en el Parquet.

Para actualizar los resultados en Colab, reinicia primero el entorno de ejecución,
monta Drive y ejecuta las celdas pertinentes, incluida la que calcula `trm_mensual`.
Sube la versión actual de `notebook/exportar_resultados_bi.py` a `/content/`:

```python
import os
from google.colab import files

os.chdir("/content")
files.upload()  # Selecciona exportar_resultados_bi.py desde el equipo.
```

Después ejecuta:

```python
%run -i /content/exportar_resultados_bi.py
```

Cada exportación falla de forma independiente y deja constancia del error en
`manifest_dashboard.json`. Si existe un resultado previo, se conserva y su
fecha anterior aparece en `actualizado_previo`. SECOP se marca como no
disponible si no terminaron las descargas de ambos datasets. No se crean
archivos vacíos para las visualizaciones pendientes.
Reiniciar el entorno evita reutilizar variables de una ejecución anterior:
el módulo no puede demostrar por sí solo si un DataFrame que sigue en memoria
se generó en el último intento.

La TRM se exporta como `trm_mensual_2021_2026.parquet` con `PERIODO`, `ANIO`,
`MES` y `TRM_PROMEDIO_COP_USD`. La gráfica muestra los promedios mensuales en
COP/USD y permite filtrar por año. El archivo generado anteriormente mediante
la celda independiente no contiene fecha de exportación, por lo que el
dashboard la indica como desconocida. Las nuevas exportaciones con el módulo
incluyen esa fecha en el Parquet y el manifiesto.

Después de exportar, espera a que Drive para escritorio termine de sincronizar
y ejecuta en PowerShell desde la raíz del proyecto:

```powershell
.\scripts\sincronizar_resultados.ps1
```

Actualiza el dashboard en el navegador. No vuelvas a sobrescribir el Parquet
de TRM con la celda independiente después de ejecutar el módulo: quedaría
desajustado respecto al manifiesto. Si ocurre, vuelve a ejecutar el módulo y
sincroniza de nuevo.

## Cuota de valor FOB por importador

El exportador reutiliza `I.evolucion_cuotas(dd, familia)`. En el notebook,
`dd` parte de `sin_anom`: no representa todas las importaciones, sino los
registros incluidos en ese análisis sin anomalías de precio. La función
selecciona hasta diez nombres por FOB acumulado en todo el período exportado,
agrupa los restantes en `OTROS` y divide el FOB de cada grupo por el FOB
agrupado de su familia y año. Seleccionar un año no vuelve a calcular el
Top 10 ni los porcentajes.

El Parquet contiene `FAMILIA`, `ANIO`, `NOMBRE`, `_fob` y `CUOTA_PCT`.
La API valida las cuotas y muestra `_fob` cuando está disponible. Si falta
un importador en un año con datos de esa familia, se representa con cuota
cero; un año sin filas se deja sin datos. El archivo agregado no contiene el
número de registros ni permite verificar individualmente los integrantes de
`OTROS`; esas comprobaciones requieren los datos originales en Colab.

## Archivos inspeccionados

- `README.md`
- `notebook/BioPrice_BI_corregido.ipynb` (notebook de formato 4.5, 56 celdas)

No hay módulos Python independientes ni archivos de resultados analíticos en el workspace. El notebook declara celdas que escriben módulos en `/content/bioprice_bi/bioprice/` cuando se ejecuta en Colab. No se ejecutó ni se modificó.

## Funciones y resultados identificados

En las celdas que generan módulos aparecen:

- Configuración y entrada: `normalizar_nombre_archivo`; define rutas de entrada/salida, aliases de columnas, familias y subpartidas de referencia.
- Clasificación: `estandarizar`, `asignar_equipo`, `clasificar_categoria`, `peso_unitario`, `cargar_fichas`, `validar_fichas`, `buscar_ficha`, `IndiceInvima`, `procesar_fila` y `clasificar`.
- Indicadores: `preparar`, `serie_precios`, `comparacion_pais`, `perfil_importadores`, `concentracion` y `evolucion_cuotas`.
- ML: `marcar_anomalias`, `precio_esperado`, `clasificador_categoria`, `evaluar_con_muestra_manual` y `segmentar_importadores`.
- SECOP II: `columnas_dataset`, `descargar` y `normalizar`; los nombres se adaptan desde metadatos de los datasets configurados.
- El notebook contiene conversión de hojas Excel a Parquet, lectura/clasificación de importaciones, pruebas `unittest` y una interfaz Streamlit.

## Entradas y dependencias

La configuración del notebook usa `BIOPRICE_BASE` (por defecto, una carpeta de Google Drive), un subdirectorio `_EXTRAIDOS` para Excel y `_PARQUET` para sus conversiones. También contempla `fichas_tecnicas.xlsx` y un CSV de registros sanitarios INVIMA. La ficha usa `EQUIPO`, `MARCA`, `MODELO`, `PESO_MIN_KG`, `PESO_MAX_KG`, `URL_FICHA`, `CONDICION_PESO` y `FECHA_CONSULTA`. En las importaciones son obligatorias las columnas detectables de subpartida y descripción; cantidad, unidad, peso, FOB, país, importador/NIT y fecha se usan cuando están disponibles.

El notebook instala/importa Python-Calamine, PyArrow, Pandas, NumPy, scikit-learn, Plotly, Streamlit, openpyxl y requests; hay una dependencia opcional de RapidFuzz en una celda y una celda aparte instala `suds-py3`. Estas dependencias corresponden a Colab, no al backend de consulta. Una celda Streamlit lee el Parquet completo con Pandas, por lo que no se debe reutilizar como mecanismo de consulta local ni incorporarla al arranque de FastAPI.

## Familias y reglas observadas

El notebook y el README cubren cinco familias: ecógrafo, acelerador lineal, mesa de cirugía, rayos X y ventilador. El prompt maestro menciona seis, incluyendo electrocardiógrafos; esa sexta familia no aparece implementada en la configuración inspeccionada y no puede exponerse como resultado disponible.

La función `preparar` deriva `PRECIO_UNIT_USD` solo cuando la unidad comercial es individual y los valores de cantidad y FOB son positivos. Los indicadores producen medianas, percentiles, variación por periodo, comparación por país, perfiles de importadores y concentración. El ML marca anomalías y genera predicciones/razones de precio esperado; esas salidas no sustituyen las reglas de clasificación.

## Archivos de salida declarados

La celda de exportación produce bajo `_SALIDA` en la ruta configurada de Google Drive:

- `base_analitica.parquet`: conjunto clasificado y enriquecido con campos de precio/ML.
- `descartados.csv`: filas que requieren auditoría y su motivo.
- `licitaciones_secop.csv`: registros SECOP normalizados.
- `metricas_ml.json`: métricas de los modelos.
- `resultado_bioprice.xlsx`: hojas de resumen, confirmados, candidatos, precios por año, país, importadores, concentración, SECOP, descartes y archivos leídos.

El notebook también genera `dataset_equipos_biomedicos.xlsx` en otra celda. No se encontró ninguno de esos artefactos en el workspace; no se pudo comprobar su contenido, esquema Parquet efectivo, número de filas ni fecha real de generación.

## Gráfica de marcas y modelos coincidentes

En la celda de cruce DIAN–INVIMA, `df_inv` aporta `PRODUCTO`, `MARCA`,
`FECHA_VENCIMIENTO`, `ESTADO_REGISTRO` y `REGISTRO_SANITARIO`; `conservados` aporta
`FECHA_PRESENTACION`, `DESCRIPCION_MERCANCIA` y `EQUIPO_CLASIFICADO`. El código normaliza
textos, clasifica INVIMA en una única categoría, conserva registros con estado `VIGENTE` y
fecha de vencimiento presente, y filtra DIAN al período configurado (1 de enero–31 de agosto de
2026 en la versión inspeccionada). Solo compara dentro de la misma categoría y exige que el
vencimiento del registro sea igual o posterior a la fecha DIAN. Selecciona la mejor coincidencia
por `fuzz.token_set_ratio` con umbral 88 y elimina duplicados por categoría, fecha, descripción y
registro sanitario. No se añade ni modifica ningún criterio en FastAPI.

El notebook construye `top_modelos` agrupando por `CATEGORIA` y `MARCA_MODELO` (marca más
`PRODUCTO_INVIMA`, no necesariamente un campo de modelo independiente). El eje horizontal
cuenta `REGISTRO_SANITARIO` no nulos como `COINCIDENCIAS`; el eje vertical muestra
`MARCA_MODELO`. Conserva las 15 primeras filas por categoría, y el tooltip muestra el número de
registros sanitarios distintos como `REGISTROS_INVIMA`. Las cuatro categorías de esta celda son
ecógrafos, aceleradores lineales, mesas de cirugía y rayos X; no se debe inferir la presencia de
otras categorías.

La celda ya exporta el **detalle** `coincidencias_INVIMA_DIAN_2026.csv`, pero no exporta el
resumen `top_modelos` utilizado por la gráfica. El CSV no sustituye al Parquet agregado y no se
procesa localmente. Con Google Drive montado en Colab, ejecuta la siguiente celda **adicional**
inmediatamente después de ejecutar con éxito la celda que calcula y muestra el gráfico. Usa los
DataFrames que ya están en memoria: no convierte Excel ni vuelve a procesar los Parquet originales.
Esto no modifica el notebook original de este repositorio:

```python
from datetime import datetime, timezone
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq

directorio_drive = Path("/content/drive/MyDrive")
if not directorio_drive.is_dir():
    raise RuntimeError("Monta Google Drive en Colab antes de exportar los resultados.")

columnas = ["CATEGORIA", "MARCA_MODELO", "COINCIDENCIAS", "REGISTROS_INVIMA"]
esquema = pa.schema([
    pa.field("CATEGORIA", pa.string()),
    pa.field("MARCA_MODELO", pa.string()),
    pa.field("COINCIDENCIAS", pa.int64()),
    pa.field("REGISTROS_INVIMA", pa.int64()),
], metadata={
    b"bioprice_generated_at": datetime.now(timezone.utc).isoformat().encode("utf-8"),
    b"bioprice_period_start": FECHA_INICIO.date().isoformat().encode("utf-8"),
    b"bioprice_period_end": FECHA_FIN.date().isoformat().encode("utf-8"),
})

if df_coincidencias.empty:
    tabla = pa.Table.from_pylist([], schema=esquema)
else:
    tabla = pa.Table.from_pandas(
        top_modelos[columnas], schema=esquema, preserve_index=False, safe=True
    )

destino = directorio_drive / "REGISTROS_IMPORTACIONES" / "_RESULTADOS_BI" / "marcas_modelos_coincidentes.parquet"
destino.parent.mkdir(parents=True, exist_ok=True)
pq.write_table(tabla, destino, compression="snappy")
print("Archivo exportado:", destino)
```

En Windows, Drive para escritorio muestra el resultado en
`G:\Mi unidad\REGISTROS_IMPORTACIONES\_RESULTADOS_BI\marcas_modelos_coincidentes.parquet`.
Sincroniza una copia de ese archivo pequeño en `data/analytics/marcas_modelos_coincidentes.parquet`
(o en el directorio configurado con `BIOPRICE_ANALYTICS_DATA_DIR`). No copies los archivos de
`_PARQUET` al proyecto. El backend solo lee este
resumen, no los Parquet de importaciones. El límite es 60 filas (4 categorías × 15) y 4 MiB tanto
en archivo como en tamaño descomprimido, para evitar consumir memoria excesiva. El archivo debe
contener las cuatro columnas indicadas, con texto en las dos primeras y enteros no negativos en
las dos últimas. Los metadatos de fecha de exportación y período son opcionales; si no existen,
no se muestra una fecha inventada. Si no existen coincidencias, exporta la tabla vacía con el
mismo esquema. Sin archivo, la API responde `404`; si es ilegible o inválido, responde `503`.

`GET /api/dashboard/marcas-modelos-coincidentes` exige una sesión activa y responde con `data`
(las filas originales), `generated_at`, `period_start` y `period_end`. Los tres metadatos pueden
ser `null`. El dashboard conserva el orden y las cifras exportadas, y distingue falta de archivo,
resultados vacíos y errores. La fecha es la de **exportación**, no la modificación de la copia.

## Columnas identificadas

`estandarizar` conserva las columnas originales y añade campos internos:

- `_subpartida`, `_descripcion`
- `_cantidad`, `_unidad`, `_peso_neto`, `_peso_bruto`, `_fob`
- `_pais`, `_importador`, `_nit`
- `FECHA`, `ANIO`, `PERIODO_MES`

`procesar_fila` añade `EQUIPO_CLASIFICADO`, `CATEGORIA_REGISTRO`, `PESO_UNITARIO_KG`, `PESO_MIN_FICHA_KG`, `PESO_MAX_FICHA_KG`, `MODELO_CANDIDATO`, `FUENTE_MODELO`, `URL_FICHA`, `COINCIDENCIA_PESO`, `COINCIDENCIA_SUBPARTIDA`, `VERIFICACION_INVIMA`, `NIVEL_DE_CONFIANZA`, `ESTADO_IDENTIFICACION`, `OBSERVACIONES`, `DESCARTE_TIPO` y `DESCARTE_DETALLE`.

`preparar` y ML agregan `PRECIO_UNIT_USD`, `ES_ANOMALIA_PRECIO`, `SCORE_ANOMALIA`, `METODO_ANOMALIA`, `PRECIO_ESPERADO_USD` y `RAZON_PRECIO_ESPERADO` cuando corresponde.

SECOP se normaliza a `ID`, `ENTIDAD`, `NIT_ENTIDAD`, `DEPARTAMENTO`, `CIUDAD`, `MODALIDAD`, `DESCRIPCION`, `VALOR_ESTIMADO`, `VALOR_ADJUDICADO`, `PROVEEDOR`, `NIT_PROVEEDOR`, `FECHA`, `ESTADO`, `URL`, `ANIO`, `DATASET`, `FAMILIA`, `CATEGORIA_LICITACION` y `ADVERTENCIA`. Sus valores son de procesos/contratos, no precios unitarios.

Los tipos Parquet definitivos, nulabilidad y representación de fechas deben verificarse contra un archivo exportado real antes de activar validación estricta. El código inspeccionado no incorpora un manifiesto de esquema/generación y no identifica una clave estable para cada importación.

## Endpoints propuestos y dependencias

Rutas propuestas a partir del alcance acordado:

- `GET /api/health` — implementado; no depende de PostgreSQL ni de archivos analíticos.
- `GET /api/dashboard/resumen`
- `GET /api/equipos` y `GET /api/equipos/{id}`
- `GET /api/precios`, `GET /api/precios/evolucion` y `GET /api/precios/comparacion`
- `GET /api/importaciones` y `GET /api/importaciones/{id}`
- `GET /api/metodologia`
- `GET /api/datos/actualizacion`

Estos endpoints propuestos deben esperar a la copia de artefactos y a la validación del esquema. Los endpoints privados requerirán autenticación. `GET /api/importaciones/{id}` requiere acordar una clave estable; no debe inventarse.

Dependencias pendientes: sincronizar artefactos de Colab, capturar el esquema y los tipos reales, definir generación y versión de esquema en un manifiesto, decidir estrategia de identidad de filas, validar tamaño/particiones de los Parquet y confirmar si las consultas requerirán vistas de exportación adicionales. No se propone cambiar el notebook ni sus algoritmos.
