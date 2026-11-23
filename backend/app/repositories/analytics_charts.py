import json
import math
from datetime import datetime
from pathlib import Path
from typing import Literal

import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import AwareDatetime, BaseModel, Field, ValidationError

from app.repositories.brand_model_matches import InvalidChartExport

ChartValue = str | int | float | bool | None
ChartId = Literal[
    "distribucion_equipos",
    "registros_invima",
    "precio_mediano_anual",
    "variacion_mediana_anual",
    "precio_pais",
    "concentracion_mercado",
    "cuotas_importadores",
    "contratos_secop",
    "trm_mensual_2021_2026",
]

CHART_COLUMNS: dict[str, dict[str, str]] = {
    "distribucion_equipos": {"EQUIPO_CLASIFICADO": "text", "CANTIDAD": "number"},
    "registros_invima": {
        "EQUIPOS_RELACIONADOS": "text",
        "ESTADO_REGISTRO": "text",
        "CANTIDAD": "number",
    },
    "precio_mediano_anual": {
        "FAMILIA": "text",
        "PERIODO": "text",
        "n": "number",
        "mediana": "number",
        "p25": "number",
        "p75": "number",
        "VAR_PCT_MEDIANA": "number",
        "MUESTRA_PEQUENA": "boolean",
    },
    "variacion_mediana_anual": {
        "FAMILIA": "text",
        "PERIODO": "text",
        "n": "number",
        "VAR_PCT_MEDIANA": "number",
        "MUESTRA_PEQUENA": "boolean",
    },
    "precio_pais": {
        "EQUIPO_CLASIFICADO": "text",
        "PAIS_ORIGEN": "text",
        "n": "number",
        "mediana": "number",
        "PRIMA_PCT_VS_FAMILIA": "number",
        "CUOTA_UNIDADES_PCT": "number",
        "MUESTRA_PEQUENA": "boolean",
    },
    "concentracion_mercado": {
        "EQUIPO_CLASIFICADO": "text",
        "ANIO": "number",
        "HHI": "number",
        "TOP5_PCT": "number",
        "n_importadores": "number",
    },
    "cuotas_importadores": {
        "FAMILIA": "text",
        "ANIO": "number",
        "NOMBRE": "text",
        "CUOTA_PCT": "number",
    },
    "contratos_secop": {
        "ANIO": "number",
        "FAMILIA_NOMBRE": "text",
        "count": "number",
        "sum": "number",
        "median": "number",
    },
    "trm_mensual_2021_2026": {
        "PERIODO": "timestamp",
        "ANIO": "number",
        "MES": "number",
        "TRM_PROMEDIO_COP_USD": "number",
    },
}

OPTIONAL_CHART_COLUMNS: dict[str, dict[str, str]] = {
    "cuotas_importadores": {"_fob": "number"},
}

MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_ROWS = 20000


class ChartManifestEntry(BaseModel):
    archivo: str | None
    estado: Literal["disponible", "no_disponible"]
    actualizado_en: AwareDatetime | None
    columnas: list[str]
    registros: int | None = Field(ge=0, strict=True)


class AnalyticsChartResponse(BaseModel):
    data: list[dict[str, ChartValue]]
    generated_at: AwareDatetime | None


def load_analytics_chart(directory: Path, chart_id: ChartId) -> AnalyticsChartResponse:
    required = CHART_COLUMNS[chart_id]
    try:
        with (directory / "manifest_dashboard.json").open("rb") as source:
            content = source.read(MAX_FILE_BYTES + 1)
        if len(content) > MAX_FILE_BYTES:
            raise InvalidChartExport("El manifiesto supera el tamaño permitido.")
        document = json.loads(content)
        if not isinstance(document, dict) or not isinstance(document.get("visualizaciones"), list):
            raise InvalidChartExport("El manifiesto no contiene visualizaciones.")
        entries = [
            item
            for item in document["visualizaciones"]
            if isinstance(item, dict) and item.get("id") == chart_id
        ]
        if not entries:
            raise FileNotFoundError("La gráfica no figura en el manifiesto.")
        if len(entries) != 1:
            raise InvalidChartExport("La gráfica aparece más de una vez en el manifiesto.")
        entry = ChartManifestEntry.model_validate(entries[0])
        if entry.estado == "no_disponible":
            raise FileNotFoundError("La última exportación no está disponible.")
        if (
            entry.archivo != f"{chart_id}.parquet"
            or entry.registros is None
            or not set(required).issubset(entry.columnas)
        ):
            raise InvalidChartExport("La entrada del manifiesto es inválida.")
        if entry.actualizado_en is None and chart_id != "trm_mensual_2021_2026":
            raise InvalidChartExport("Falta la fecha de generación en el manifiesto.")
        path = directory / entry.archivo
        if path.stat().st_size > MAX_FILE_BYTES:
            raise InvalidChartExport("El archivo supera el tamaño permitido.")
        with path.open("rb") as source:
            parquet = pq.ParquetFile(source)
            metadata = parquet.metadata
            if metadata.num_rows > MAX_ROWS:
                raise InvalidChartExport("El archivo supera el máximo de filas.")
            if (
                sum(metadata.row_group(i).total_byte_size for i in range(metadata.num_row_groups))
                > MAX_UNCOMPRESSED_BYTES
            ):
                raise InvalidChartExport("El archivo descomprimido supera el tamaño permitido.")
            schema = parquet.schema_arrow
            if schema.names != entry.columnas:
                raise InvalidChartExport("Las columnas no coinciden con el manifiesto.")
            columns = {
                **required,
                **{
                    name: kind
                    for name, kind in OPTIONAL_CHART_COLUMNS.get(chart_id, {}).items()
                    if name in schema.names
                },
            }
            for name, kind in columns.items():
                column_type = schema.field(name).type
                valid = (
                    (
                        kind == "text"
                        and (
                            pa.types.is_string(column_type) or pa.types.is_large_string(column_type)
                        )
                    )
                    or (
                        kind == "number"
                        and (pa.types.is_integer(column_type) or pa.types.is_floating(column_type))
                    )
                    or (kind == "boolean" and pa.types.is_boolean(column_type))
                    or (kind == "timestamp" and pa.types.is_timestamp(column_type))
                )
                if not valid:
                    raise InvalidChartExport(f"Tipo inválido para {name}.")
            generated = (schema.metadata or {}).get(b"bioprice_generated_at")
            if not generated and chart_id != "trm_mensual_2021_2026":
                raise InvalidChartExport("Falta la fecha de generación.")
            generated_at = datetime.fromisoformat(generated.decode("utf-8")) if generated else None
            if generated_at != entry.actualizado_en or metadata.num_rows != entry.registros:
                raise InvalidChartExport("El archivo no coincide con el manifiesto.")
            rows = parquet.read(columns=list(columns)).to_pylist()
            if any(
                isinstance(value, float) and not math.isfinite(value)
                for row in rows
                for value in row.values()
            ):
                raise InvalidChartExport("El archivo contiene valores numéricos no finitos.")
            if chart_id == "cuotas_importadores":
                totals: dict[tuple[str, int | float], float] = {}
                fob_totals: dict[tuple[str, int | float], float] = {}
                keys: set[tuple[str, int | float, str]] = set()
                for row in rows:
                    family, year, name, share = (
                        row["FAMILIA"], row["ANIO"], row["NOMBRE"], row["CUOTA_PCT"]
                    )
                    if (
                        not isinstance(family, str)
                        or not isinstance(year, (int, float))
                        or not 1 <= year <= 9999
                        or int(year) != year
                        or not isinstance(name, str)
                        or not isinstance(share, (int, float))
                        or not 0 <= share <= 100
                    ):
                        raise InvalidChartExport(
                            "La cuota de importadores contiene valores inválidos."
                        )
                    key = (family, year, name)
                    if key in keys:
                        raise InvalidChartExport(
                            "La cuota de importadores contiene filas duplicadas."
                        )
                    keys.add(key)
                    group = (family, year)
                    totals[group] = totals.get(group, 0) + share
                    if "_fob" in columns:
                        fob = row["_fob"]
                        if not isinstance(fob, (int, float)) or fob < 0:
                            raise InvalidChartExport("El valor FOB de importadores es inválido.")
                        fob_totals[group] = fob_totals.get(group, 0) + fob
                if any(not math.isclose(total, 100, abs_tol=1e-6) for total in totals.values()):
                    raise InvalidChartExport("Las cuotas por familia y año no suman 100%.")
                if "_fob" in columns:
                    for row in rows:
                        group = (row["FAMILIA"], row["ANIO"])
                        total = fob_totals[group]
                        if total <= 0 or not math.isclose(
                            row["CUOTA_PCT"], 100 * row["_fob"] / total, abs_tol=1e-6
                        ):
                            raise InvalidChartExport("La cuota no coincide con los valores FOB.")
            for row in rows:
                for name, kind in required.items():
                    if kind == "timestamp" and row[name] is not None:
                        row[name] = row[name].isoformat()
            return AnalyticsChartResponse(data=rows, generated_at=generated_at)
    except (
        pa.ArrowException,
        json.JSONDecodeError,
        UnicodeDecodeError,
        ValidationError,
        ValueError,
    ) as exc:
        if isinstance(exc, InvalidChartExport):
            raise
        raise InvalidChartExport("La exportación no cumple el contrato esperado.") from exc
