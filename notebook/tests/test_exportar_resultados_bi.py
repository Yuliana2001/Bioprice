import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pyarrow.parquet as pq

MODULE_PATH = Path(__file__).resolve().parents[1] / "exportar_resultados_bi.py"
SPEC = importlib.util.spec_from_file_location("exportar_resultados_bi", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
exportador = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exportador)


class ExportarResultadosTest(unittest.TestCase):
    def test_exportaciones_independientes_y_manifiesto(self):
        variables = {
            "conservados": pd.DataFrame({"EQUIPO_CLASIFICADO": ["A", "A", "B"]}),
            "invima_equipos": pd.DataFrame(
                {
                    "EQUIPOS_RELACIONADOS": ["A", "A", "A"],
                    "ESTADO_REGISTRO": ["VIGENTE", "VIGENTE", "VIGENTE"],
                    "REGISTRO_SANITARIO": ["uno", "uno", "dos"],
                }
            ),
        }
        with tempfile.TemporaryDirectory() as carpeta:
            destino = Path(carpeta) / "resultados"
            manifest = exportador.exportar_dashboard(variables, destino)
            entradas = {e["id"]: e for e in manifest["visualizaciones"]}
            self.assertEqual(entradas["distribucion_equipos"]["estado"], "disponible")
            self.assertEqual(entradas["registros_invima"]["estado"], "disponible")
            self.assertEqual(entradas["contratos_secop"]["estado"], "no_disponible")
            self.assertEqual(entradas["streamlit_distribucion_precio"]["estado"], "no_disponible")
            self.assertFalse((destino / "contratos_secop.parquet").exists())
            tabla = pq.read_table(destino / "registros_invima.parquet")
            self.assertEqual(tabla.to_pylist()[0]["CANTIDAD"], 2)
            self.assertIn(b"bioprice_generated_at", tabla.schema.metadata)
            self.assertTrue((destino / "manifest_dashboard.json").is_file())

    def test_coincidencias_y_conservacion_de_resultado_anterior(self):
        variables = {
            "df_coincidencias": pd.DataFrame(
                {
                    "CATEGORIA": ["A", "A", "A"],
                    "MARCA_INVIMA": ["Marca", "Marca", "Marca"],
                    "PRODUCTO_INVIMA": ["Producto", "Producto", "Producto"],
                    "REGISTRO_SANITARIO": ["uno", "uno", "dos"],
                }
            ),
            "FECHA_INICIO": pd.Timestamp("2026-01-01"),
            "FECHA_FIN": pd.Timestamp("2026-08-31"),
        }
        with tempfile.TemporaryDirectory() as carpeta:
            destino = Path(carpeta) / "resultados"
            primero = exportador.exportar_dashboard(variables, destino)
            entrada = next(
                e for e in primero["visualizaciones"] if e["id"] == "marcas_modelos_coincidentes"
            )
            archivo = destino / entrada["archivo"]
            original = archivo.read_bytes()
            tabla = pq.read_table(archivo)
            self.assertEqual(tabla.to_pylist()[0]["COINCIDENCIAS"], 3)
            self.assertEqual(tabla.to_pylist()[0]["REGISTROS_INVIMA"], 2)
            self.assertEqual(tabla.schema.metadata[b"bioprice_period_end"], b"2026-08-31")
            segundo = exportador.exportar_dashboard({}, destino)
            tercero = exportador.exportar_dashboard({}, destino)
            for manifiesto in (segundo, tercero):
                fallo = next(e for e in manifiesto["visualizaciones"] if e["id"] == entrada["id"])
                self.assertEqual(fallo["estado"], "no_disponible")
                self.assertEqual(fallo["actualizado_previo"], entrada["actualizado_en"])
                self.assertIn("df_coincidencias", fallo["motivo"])
            self.assertEqual(archivo.read_bytes(), original)

    def test_secop_parcial_no_publica_resultados_y_completo_usa_valor_estimado(self):
        variables = {
            "partes": [object()],
            "C": SimpleNamespace(SECOP_CONTRATOS="contratos"),
            "lic": pd.DataFrame(
                {
                    "CATEGORIA_LICITACION": ["Equipo principal completo", "Accesorio"],
                    "DATASET": ["contratos", "contratos"],
                    "ANIO": [2025, 2025],
                    "FAMILIA_NOMBRE": ["A", "A"],
                    "VALOR_ESTIMADO": [100, 999],
                    "VALOR_ADJUDICADO": [50, 999],
                }
            ),
        }
        with tempfile.TemporaryDirectory() as carpeta:
            destino = Path(carpeta) / "resultados"
            parcial = exportador.exportar_dashboard(variables, destino)
            entrada = next(e for e in parcial["visualizaciones"] if e["id"] == "contratos_secop")
            self.assertEqual(entrada["estado"], "no_disponible")
            self.assertFalse((destino / entrada["archivo"]).exists())
            variables["partes"].append(object())
            completo = exportador.exportar_dashboard(variables, destino)
            entrada = next(e for e in completo["visualizaciones"] if e["id"] == "contratos_secop")
            self.assertEqual(entrada["estado"], "disponible")
            self.assertEqual(pq.read_table(destino / entrada["archivo"]).to_pylist()[0]["sum"], 100)

    def test_trm_reutiliza_los_promedios_existentes(self):
        variables = {
            "trm_mensual": pd.DataFrame(
                {
                    "PERIODO": ["2025-02-01", "2025-03-01"],
                    "ANIO": [2025, 2025],
                    "MES": [2, 3],
                    "TRM_PROMEDIO_COP_USD": ["4200.75", "sin dato"],
                }
            )
        }
        with tempfile.TemporaryDirectory() as carpeta:
            destino = Path(carpeta) / "resultados"
            manifiesto = exportador.exportar_dashboard(variables, destino)
            entrada = next(
                e for e in manifiesto["visualizaciones"] if e["id"] == "trm_mensual_2021_2026"
            )
            self.assertEqual(entrada["estado"], "disponible")
            self.assertEqual(entrada["registros"], 1)
            tabla = pq.read_table(destino / entrada["archivo"])
            self.assertEqual(tabla.to_pylist()[0]["TRM_PROMEDIO_COP_USD"], 4200.75)
            self.assertEqual(
                tabla.schema.metadata[b"bioprice_generated_at"].decode(), entrada["actualizado_en"]
            )


if __name__ == "__main__":
    unittest.main()
