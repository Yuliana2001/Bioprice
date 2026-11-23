"""Exporta resultados ya calculados en el notebook, sin leer las fuentes originales.

En Colab, después de ejecutar las celdas correspondientes:
    %run -i /ruta/a/exportar_resultados_bi.py
"""

import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

DESTINO = Path("/content/drive/MyDrive/REGISTROS_IMPORTACIONES/_RESULTADOS_BI")


def exportar_dashboard(variables, destino=DESTINO):
    """Publica las visualizaciones implementadas; las demás quedan explícitamente pendientes."""
    destino = Path(destino)
    if not destino.parent.is_dir():
        raise FileNotFoundError("Monte Google Drive y verifique REGISTROS_IMPORTACIONES.")
    destino.mkdir(exist_ok=True)
    generado = datetime.now(UTC).isoformat()
    manifiesto_anterior = destino / "manifest_dashboard.json"
    anteriores = {}
    if manifiesto_anterior.exists():
        with manifiesto_anterior.open(encoding="utf-8") as archivo:
            anterior = json.load(archivo)
        anteriores = {entrada["id"]: entrada for entrada in anterior["visualizaciones"]}

    def variable(nombre):
        if nombre not in variables:
            raise NameError(f"No se calculó la variable {nombre}.")
        return variables[nombre]

    def distribucion():
        return (
            variable("conservados")["EQUIPO_CLASIFICADO"]
            .value_counts()
            .rename_axis("EQUIPO_CLASIFICADO")
            .reset_index(name="CANTIDAD")
        )

    def invima():
        return (
            variable("invima_equipos")
            .groupby(["EQUIPOS_RELACIONADOS", "ESTADO_REGISTRO"])["REGISTRO_SANITARIO"]
            .nunique()
            .reset_index(name="CANTIDAD")
        )

    def coincidencias():
        coincidencias_dian = variable("df_coincidencias")
        if coincidencias_dian.empty:
            return pd.DataFrame(
                {
                    "CATEGORIA": pd.Series(dtype="string"),
                    "MARCA_MODELO": pd.Series(dtype="string"),
                    "COINCIDENCIAS": pd.Series(dtype="int64"),
                    "REGISTROS_INVIMA": pd.Series(dtype="int64"),
                }
            )
        grafico = coincidencias_dian.copy()
        marca = (
            grafico["MARCA_INVIMA"]
            .fillna("Marca no especificada")
            .replace("", "Marca no especificada")
        )
        modelo = grafico["PRODUCTO_INVIMA"].fillna("Modelo no especificado")
        grafico["MARCA_MODELO"] = marca.astype(str) + " | " + modelo.astype(str)
        resumen = (
            grafico.groupby(["CATEGORIA", "MARCA_MODELO"], as_index=False)
            .agg(
                COINCIDENCIAS=("REGISTRO_SANITARIO", "count"),
                REGISTROS_INVIMA=("REGISTRO_SANITARIO", "nunique"),
            )
            .sort_values("COINCIDENCIAS", ascending=False)
        )
        return resumen.sort_values("COINCIDENCIAS", ascending=False).groupby("CATEGORIA").head(15)

    def cuotas():
        indicadores = variable("I")
        datos = variable("dd")
        familias = datos["EQUIPO_CLASIFICADO"].unique()
        if not len(familias):
            raise ValueError("No hay familias para calcular la evolución de cuotas.")
        return pd.concat(
            [
                indicadores.evolucion_cuotas(datos, familia).assign(FAMILIA=familia)
                for familia in familias
            ],
            ignore_index=True,
        )

    def secop():
        if len(variable("partes")) != 2:
            raise ValueError("La descarga SECOP no completó ambos datasets.")
        licitaciones = variable("lic")
        configuracion = variable("C")
        principales = licitaciones[
            licitaciones["CATEGORIA_LICITACION"] == "Equipo principal completo"
        ]
        contratos = principales[principales["DATASET"] == configuracion.SECOP_CONTRATOS]
        return (
            contratos.groupby(["ANIO", "FAMILIA_NOMBRE"])["VALOR_ESTIMADO"]
            .agg(["count", "sum", "median"])
            .reset_index()
        )

    def trm():
        datos = variable("trm_mensual")[
            ["PERIODO", "ANIO", "MES", "TRM_PROMEDIO_COP_USD"]
        ].copy()
        datos["PERIODO"] = pd.to_datetime(datos["PERIODO"])
        datos["ANIO"] = datos["ANIO"].astype("int32")
        datos["MES"] = datos["MES"].astype("int32")
        datos["TRM_PROMEDIO_COP_USD"] = pd.to_numeric(
            datos["TRM_PROMEDIO_COP_USD"], errors="coerce"
        )
        return datos.dropna(subset=["PERIODO", "TRM_PROMEDIO_COP_USD"])

    def fecha_previa(identificador, nombre_archivo):
        anterior = anteriores.get(identificador, {})
        if not (destino / nombre_archivo).is_file():
            return None
        return anterior.get("actualizado_en") or anterior.get("actualizado_previo")

    especificaciones = [
        ("distribucion_equipos", "Distribución de equipos biomédicos", distribucion),
        ("registros_invima", "Registros sanitarios INVIMA por equipo biomédico", invima),
        (
            "marcas_modelos_coincidentes",
            "Marcas y modelos con coincidencia entre INVIMA y DIAN",
            coincidencias,
        ),
        (
            "precio_mediano_anual",
            "Precio unitario mediano (USD, sin anomalías)",
            lambda: variable("serie"),
        ),
        ("variacion_mediana_anual", "Variación % anual de la mediana", lambda: variable("serie")),
        ("precio_pais", "Precio mediano por país", lambda: variable("pais")),
        ("concentracion_mercado", "Concentración del mercado", lambda: variable("conc")),
        ("cuotas_importadores", "Evolución de cuota de valor FOB", cuotas),
        ("contratos_secop", "Valor de contratos de equipos principales (COP)", secop),
        ("trm_mensual_2021_2026", "Tendencia mensual de la TRM (COP/USD)", trm),
    ]
    pendientes = [
        ("streamlit_precio_mediano", "Precio unitario mediano (USD)"),
        ("streamlit_variacion_mediana", "Variación % de la mediana vs periodo anterior"),
        ("streamlit_distribucion_precio", "Distribución del precio unitario"),
        ("streamlit_precio_pais", "Precio mediano por país de origen"),
        ("streamlit_importadores", "Principales importadores por valor FOB (USD)"),
        ("streamlit_cuotas", "Evolución de la cuota de valor"),
        ("streamlit_concentracion", "Concentración del mercado (HHI y cuota del top-5)"),
        ("streamlit_secop", "Valor adjudicado por año (COP)"),
        ("streamlit_confianza", "Nivel de confianza por familia"),
    ]

    entradas = []
    for identificador, nombre, calcular in especificaciones:
        nombre_archivo = identificador + ".parquet"
        entrada = {
            "id": identificador,
            "nombre": nombre,
            "archivo": nombre_archivo,
            "columnas": [],
            "registros": None,
            "actualizado_en": None,
            "estado": "no_disponible",
            "motivo": None,
            "actualizado_previo": fecha_previa(identificador, nombre_archivo),
        }
        temporal = None
        try:
            datos = calcular()
            if not isinstance(datos, pd.DataFrame):
                raise TypeError("El resultado no es un DataFrame.")
            tabla = pa.Table.from_pandas(datos, preserve_index=False)
            metadatos = dict(tabla.schema.metadata or {})
            metadatos[b"bioprice_generated_at"] = generado.encode("utf-8")
            if identificador == "marcas_modelos_coincidentes":
                metadatos[b"bioprice_period_start"] = (
                    variable("FECHA_INICIO").date().isoformat().encode()
                )
                metadatos[b"bioprice_period_end"] = (
                    variable("FECHA_FIN").date().isoformat().encode()
                )
            tabla = tabla.replace_schema_metadata(metadatos)
            with tempfile.NamedTemporaryFile(dir=destino, suffix=".tmp", delete=False) as archivo:
                temporal = Path(archivo.name)
            pq.write_table(tabla, temporal, compression="snappy")
            os.replace(temporal, destino / nombre_archivo)
            temporal = None
            entrada.update(
                columnas=tabla.column_names,
                registros=tabla.num_rows,
                actualizado_en=generado,
                estado="disponible",
                actualizado_previo=None,
            )
        except Exception as error:
            entrada["motivo"] = f"{type(error).__name__}: {error}"
            print(f"NO DISPONIBLE {identificador}: {entrada['motivo']}")
        finally:
            if temporal is not None:
                temporal.unlink(missing_ok=True)
        entradas.append(entrada)

    for identificador, nombre in pendientes:
        entradas.append(
            {
                "id": identificador,
                "nombre": nombre,
                "archivo": identificador + ".parquet",
                "columnas": [],
                "registros": None,
                "actualizado_en": None,
                "estado": "no_disponible",
                "motivo": (
                    "La exportación de esta visualización de Streamlit aún no está implementada."
                ),
                "actualizado_previo": fecha_previa(identificador, identificador + ".parquet"),
            }
        )

    manifiesto = {"generado_en": generado, "visualizaciones": entradas}
    temporal = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=destino, suffix=".tmp", delete=False
        ) as archivo:
            temporal = Path(archivo.name)
            json.dump(manifiesto, archivo, ensure_ascii=False, indent=2)
        os.replace(temporal, manifiesto_anterior)
    finally:
        if temporal is not None:
            temporal.unlink(missing_ok=True)
    return manifiesto


if __name__ == "__main__":
    exportar_dashboard(globals())
