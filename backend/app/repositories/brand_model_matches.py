import json
from datetime import date, datetime
from pathlib import Path
from typing import Literal

import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import AwareDatetime, BaseModel, Field, ValidationError

from app.schemas.dashboard import BrandModelMatch, BrandModelMatchesResponse

FILE_NAME = "marcas_modelos_coincidentes.parquet"
COLUMNS = ("CATEGORIA", "MARCA_MODELO", "COINCIDENCIAS", "REGISTROS_INVIMA")
MAX_BYTES = 4 * 1024 * 1024
MAX_ROWS = 60
MAX_MANIFEST_BYTES = 16 * 1024 * 1024


class InvalidChartExport(ValueError):
    pass


class ManifestChart(BaseModel):
    archivo: str | None
    estado: Literal["disponible", "no_disponible"]
    actualizado_en: AwareDatetime | None
    columnas: list[str]
    registros: int | None = Field(ge=0, strict=True)


def _read_manifest(path: Path) -> ManifestChart | None:
    try:
        with path.open("rb") as source:
            content = source.read(MAX_MANIFEST_BYTES + 1)
    except FileNotFoundError:
        return None
    if len(content) > MAX_MANIFEST_BYTES:
        raise InvalidChartExport("El manifiesto supera el tamaño permitido.")
    try:
        document = json.loads(content)
        if not isinstance(document, dict) or not isinstance(document.get("visualizaciones"), list):
            raise InvalidChartExport("El manifiesto no contiene visualizaciones.")
        entries = [
            item
            for item in document["visualizaciones"]
            if isinstance(item, dict) and item.get("id") == "marcas_modelos_coincidentes"
        ]
        if not entries:
            raise FileNotFoundError("La gráfica no figura en el manifiesto.")
        if len(entries) != 1:
            raise InvalidChartExport("La gráfica aparece más de una vez en el manifiesto.")
        entry = ManifestChart.model_validate(entries[0])
    except (UnicodeDecodeError, json.JSONDecodeError, ValidationError) as exc:
        raise InvalidChartExport("El manifiesto no cumple el contrato esperado.") from exc
    if entry.estado == "no_disponible":
        raise FileNotFoundError("La última exportación de la gráfica no está disponible.")
    if (
        entry.archivo != FILE_NAME
        or entry.actualizado_en is None
        or entry.registros is None
        or len(entry.columnas) != len(COLUMNS)
        or set(entry.columnas) != set(COLUMNS)
    ):
        raise InvalidChartExport("La entrada del manifiesto no cumple el contrato de la gráfica.")
    return entry


def load_brand_model_matches(path: Path) -> BrandModelMatchesResponse:
    manifest = _read_manifest(path.parent / "manifest_dashboard.json")
    if path.stat().st_size > MAX_BYTES:
        raise InvalidChartExport("El archivo agregado supera el tamaño permitido.")

    try:
        with path.open("rb") as source:
            parquet = pq.ParquetFile(source)
            metadata = parquet.metadata
            if metadata.num_rows > MAX_ROWS:
                raise InvalidChartExport("El archivo supera el máximo de filas del gráfico.")
            uncompressed_size = sum(
                metadata.row_group(i).total_byte_size for i in range(metadata.num_row_groups)
            )
            if uncompressed_size > MAX_BYTES:
                raise InvalidChartExport("El archivo descomprimido supera el tamaño permitido.")

            schema = parquet.schema_arrow
            if any(name not in schema.names for name in COLUMNS):
                raise InvalidChartExport("Faltan columnas requeridas.")
            for name in COLUMNS[:2]:
                column_type = schema.field(name).type
                if not (pa.types.is_string(column_type) or pa.types.is_large_string(column_type)):
                    raise InvalidChartExport(f"Tipo inválido para {name}.")
            for name in COLUMNS[2:]:
                if not pa.types.is_integer(schema.field(name).type):
                    raise InvalidChartExport(f"Tipo inválido para {name}.")

            records = parquet.read(columns=list(COLUMNS)).to_pylist()
            export_metadata = schema.metadata or {}
            generated = export_metadata.get(b"bioprice_generated_at")
            start = export_metadata.get(b"bioprice_period_start")
            end = export_metadata.get(b"bioprice_period_end")
            if bool(start) != bool(end):
                raise InvalidChartExport("El período del archivo está incompleto.")
            generated_at = datetime.fromisoformat(generated.decode("utf-8")) if generated else None
            if manifest is not None and (
                manifest.actualizado_en != generated_at or manifest.registros != len(records)
            ):
                raise InvalidChartExport("El archivo no coincide con el manifiesto.")
            return BrandModelMatchesResponse(
                data=[BrandModelMatch.model_validate(row) for row in records],
                generated_at=generated_at,
                period_start=date.fromisoformat(start.decode("utf-8")) if start else None,
                period_end=date.fromisoformat(end.decode("utf-8")) if end else None,
            )
    except (pa.ArrowException, ValidationError, UnicodeDecodeError, ValueError) as exc:
        if isinstance(exc, InvalidChartExport):
            raise
        raise InvalidChartExport("El archivo no cumple el contrato de la gráfica.") from exc
