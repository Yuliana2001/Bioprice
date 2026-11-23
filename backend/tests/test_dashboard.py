import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.auth.tokens import hash_token
from app.core.config import ROOT_DIR, Settings
from app.models.user import User, UserRole
from app.models.user_session import UserSession
from app.repositories.brand_model_matches import FILE_NAME

ENDPOINT = "/api/dashboard/marcas-modelos-coincidentes"


@pytest.fixture
def chart_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    settings = Settings(_env_file=None, analytics_data_dir=tmp_path)
    monkeypatch.setattr("app.api.dashboard.get_settings", lambda: settings)
    return tmp_path


def authenticate(client: TestClient, factory: sessionmaker[Session]) -> None:
    with factory() as db:
        user = User(
            name="Usuario de prueba",
            email="dashboard@example.com",
            password_hash="not-used",
            role=UserRole.VISUALIZADOR,
            active=True,
            email_verified=True,
        )
        db.add(user)
        db.flush()
        db.add(
            UserSession(
                user_id=user.id,
                token_hash=hash_token("test-session-token"),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.commit()
    client.cookies.set("bioprice_session", "test-session-token")


def chart_table(rows: int = 1) -> pa.Table:
    return pa.table(
        {
            "CATEGORIA": pa.array(["ECOGRAFO"] * rows, type=pa.string()),
            "MARCA_MODELO": pa.array(
                ["Marca de prueba | Modelo de prueba"] * rows, type=pa.string()
            ),
            "COINCIDENCIAS": pa.array([4] * rows, type=pa.int64()),
            "REGISTROS_INVIMA": pa.array([2] * rows, type=pa.int64()),
        }
    ).replace_schema_metadata(
        {
            b"bioprice_generated_at": b"2026-01-02T03:04:05+00:00",
            b"bioprice_period_start": b"2026-01-01",
            b"bioprice_period_end": b"2026-08-31",
        }
    )


def test_chart_requires_authentication(client: TestClient, chart_dir: Path) -> None:
    pq.write_table(chart_table(), chart_dir / FILE_NAME)
    assert client.get(ENDPOINT).status_code == 401


def test_chart_reads_exact_export_and_generation_time(
    client: TestClient,
    session_factory: sessionmaker[Session],
    chart_dir: Path,
) -> None:
    authenticate(client, session_factory)
    pq.write_table(chart_table(), chart_dir / FILE_NAME)

    response = client.get(ENDPOINT)

    assert response.status_code == 200
    assert response.json() == {
        "data": [
            {
                "CATEGORIA": "ECOGRAFO",
                "MARCA_MODELO": "Marca de prueba | Modelo de prueba",
                "COINCIDENCIAS": 4,
                "REGISTROS_INVIMA": 2,
            }
        ],
        "generated_at": "2026-01-02T03:04:05Z",
        "period_start": "2026-01-01",
        "period_end": "2026-08-31",
    }


def test_chart_distinguishes_missing_empty_and_invalid_exports(
    client: TestClient,
    session_factory: sessionmaker[Session],
    chart_dir: Path,
) -> None:
    authenticate(client, session_factory)
    assert client.get(ENDPOINT).status_code == 404

    pq.write_table(chart_table(0), chart_dir / FILE_NAME)
    response = client.get(ENDPOINT)
    assert response.status_code == 200
    assert response.json()["data"] == []

    pq.write_table(chart_table(61), chart_dir / FILE_NAME)
    assert client.get(ENDPOINT).status_code == 503


def test_chart_rejects_bad_schema_values_and_metadata(
    client: TestClient,
    session_factory: sessionmaker[Session],
    chart_dir: Path,
) -> None:
    authenticate(client, session_factory)
    invalid_tables = [
        chart_table().drop(["REGISTROS_INVIMA"]),
        chart_table().set_column(2, "COINCIDENCIAS", pa.array([-1], type=pa.int64())),
        chart_table().replace_schema_metadata(
            {b"bioprice_period_start": b"not-a-date", b"bioprice_period_end": b"2026-08-31"}
        ),
    ]
    for table in invalid_tables:
        pq.write_table(table, chart_dir / FILE_NAME)
        assert client.get(ENDPOINT).status_code == 503


def test_relative_analytics_path_is_resolved_from_repository_root() -> None:
    settings = Settings(_env_file=None, analytics_data_dir=Path("data") / "analytics")
    assert settings.analytics_data_dir == ROOT_DIR / "data" / "analytics"


def test_manifest_prevents_showing_stale_or_mismatched_results(
    client: TestClient,
    session_factory: sessionmaker[Session],
    chart_dir: Path,
) -> None:
    authenticate(client, session_factory)
    pq.write_table(chart_table(), chart_dir / FILE_NAME)
    entry = {
        "id": "marcas_modelos_coincidentes",
        "archivo": FILE_NAME,
        "estado": "no_disponible",
        "actualizado_en": None,
        "columnas": [],
        "registros": None,
        "motivo": "La exportación falló",
    }
    manifest_path = chart_dir / "manifest_dashboard.json"

    def write_manifest() -> None:
        manifest_path.write_text(
            json.dumps({"visualizaciones": [entry]}),
            encoding="utf-8",
        )

    write_manifest()
    assert client.get(ENDPOINT).status_code == 404

    entry.update(
        estado="disponible",
        actualizado_en="2026-01-02T03:04:05+00:00",
        columnas=["CATEGORIA", "MARCA_MODELO", "COINCIDENCIAS", "REGISTROS_INVIMA"],
        registros=1,
        motivo=None,
    )
    write_manifest()
    assert client.get(ENDPOINT).status_code == 200
    entry["actualizado_en"] = "2026-02-02T03:04:05+00:00"
    write_manifest()
    assert client.get(ENDPOINT).status_code == 503
    entry["actualizado_en"] = "2026-01-02T03:04:05+00:00"
    entry["registros"] = 2
    write_manifest()
    assert client.get(ENDPOINT).status_code == 503


def test_manifest_errors_are_not_reported_as_missing(
    client: TestClient,
    session_factory: sessionmaker[Session],
    chart_dir: Path,
) -> None:
    authenticate(client, session_factory)
    pq.write_table(chart_table(), chart_dir / FILE_NAME)
    (chart_dir / "manifest_dashboard.json").write_text("{", encoding="utf-8")
    assert client.get(ENDPOINT).status_code == 503


def test_analytics_charts_require_authentication(client: TestClient, chart_dir: Path) -> None:
    assert client.get("/api/dashboard/graficas/distribucion_equipos").status_code == 401


def test_analytics_chart_reads_manifest_and_isolates_unavailable_exports(
    client: TestClient,
    session_factory: sessionmaker[Session],
    chart_dir: Path,
) -> None:
    authenticate(client, session_factory)
    endpoint = "/api/dashboard/graficas/distribucion_equipos"
    assert client.get(endpoint).status_code == 404
    table = pa.table(
        {
            "EQUIPO_CLASIFICADO": pa.array(["A"], type=pa.string()),
            "CANTIDAD": pa.array([3], type=pa.int64()),
        }
    ).replace_schema_metadata({b"bioprice_generated_at": b"2026-01-02T03:04:05+00:00"})
    pq.write_table(table, chart_dir / "distribucion_equipos.parquet")
    entry = {
        "id": "distribucion_equipos",
        "archivo": "distribucion_equipos.parquet",
        "estado": "disponible",
        "actualizado_en": "2026-01-02T03:04:05+00:00",
        "columnas": table.column_names,
        "registros": 1,
    }
    secop = {
        "id": "contratos_secop",
        "archivo": "contratos_secop.parquet",
        "estado": "no_disponible",
        "actualizado_en": None,
        "columnas": [],
        "registros": None,
    }
    manifest_path = chart_dir / "manifest_dashboard.json"

    def write_manifest() -> None:
        manifest_path.write_text(
            json.dumps({"visualizaciones": [entry, secop]}), encoding="utf-8"
        )

    write_manifest()
    response = client.get(endpoint)
    assert response.status_code == 200
    assert response.json()["data"] == [{"EQUIPO_CLASIFICADO": "A", "CANTIDAD": 3}]
    assert client.get("/api/dashboard/graficas/contratos_secop").status_code == 404

    entry["registros"] = 2
    write_manifest()
    assert client.get(endpoint).status_code == 503
    entry["registros"] = 1
    entry["archivo"] = "../datos.parquet"
    write_manifest()
    assert client.get(endpoint).status_code == 503


def test_analytics_chart_preserves_empty_export(
    client: TestClient,
    session_factory: sessionmaker[Session],
    chart_dir: Path,
) -> None:
    authenticate(client, session_factory)
    table = pa.table(
        {
            "EQUIPO_CLASIFICADO": pa.array([], type=pa.string()),
            "CANTIDAD": pa.array([], type=pa.int64()),
        }
    ).replace_schema_metadata({b"bioprice_generated_at": b"2026-01-02T03:04:05+00:00"})
    pq.write_table(table, chart_dir / "distribucion_equipos.parquet")
    (chart_dir / "manifest_dashboard.json").write_text(
        json.dumps(
            {
                "visualizaciones": [
                    {
                        "id": "distribucion_equipos",
                        "archivo": "distribucion_equipos.parquet",
                        "estado": "disponible",
                        "actualizado_en": "2026-01-02T03:04:05+00:00",
                        "columnas": table.column_names,
                        "registros": 0,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    response = client.get("/api/dashboard/graficas/distribucion_equipos")
    assert response.status_code == 200
    assert response.json()["data"] == []


def test_importer_shares_expose_optional_fob_and_reject_inconsistent_exports(
    client: TestClient,
    session_factory: sessionmaker[Session],
    chart_dir: Path,
) -> None:
    authenticate(client, session_factory)
    endpoint = "/api/dashboard/graficas/cuotas_importadores"
    table = pa.table(
        {
            "FAMILIA": ["A", "A"],
            "ANIO": [2024, 2024],
            "NOMBRE": ["UNO", "OTROS"],
            "_fob": [25.0, 75.0],
            "CUOTA_PCT": [25.0, 75.0],
        }
    ).replace_schema_metadata({b"bioprice_generated_at": b"2026-01-02T03:04:05+00:00"})
    manifest_path = chart_dir / "manifest_dashboard.json"

    def publish(data: pa.Table) -> None:
        pq.write_table(data, chart_dir / "cuotas_importadores.parquet")
        manifest_path.write_text(
            json.dumps({"visualizaciones": [{
                "id": "cuotas_importadores",
                "archivo": "cuotas_importadores.parquet",
                "estado": "disponible",
                "actualizado_en": "2026-01-02T03:04:05+00:00",
                "columnas": data.column_names,
                "registros": len(data),
            }]}),
            encoding="utf-8",
        )

    publish(table)
    response = client.get(endpoint)
    assert response.status_code == 200
    assert response.json()["data"][0]["_fob"] == 25.0
    publish(table.drop(["_fob"]))
    assert client.get(endpoint).status_code == 200
    publish(table.set_column(4, "CUOTA_PCT", pa.array([30.0, 70.0])))
    assert client.get(endpoint).status_code == 503
    publish(table.set_column(2, "NOMBRE", pa.array(["UNO", "UNO"])))
    assert client.get(endpoint).status_code == 503
    publish(table.set_column(4, "CUOTA_PCT", pa.array([25.0, 74.0])))
    assert client.get(endpoint).status_code == 503


def test_trm_reads_existing_monthly_parquet_without_inventing_export_date(
    client: TestClient,
    session_factory: sessionmaker[Session],
    chart_dir: Path,
) -> None:
    authenticate(client, session_factory)
    table = pa.table(
        {
            "PERIODO": pa.array([datetime(2025, 2, 1)], type=pa.timestamp("ns")),
            "ANIO": pa.array([2025], type=pa.int32()),
            "MES": pa.array([2], type=pa.int32()),
            "TRM_PROMEDIO_COP_USD": pa.array([4200.75], type=pa.float64()),
        }
    )
    pq.write_table(table, chart_dir / "trm_mensual_2021_2026.parquet")
    entry = {
        "id": "trm_mensual_2021_2026",
        "archivo": "trm_mensual_2021_2026.parquet",
        "estado": "disponible",
        "actualizado_en": None,
        "columnas": table.column_names,
        "registros": 1,
    }
    manifest_path = chart_dir / "manifest_dashboard.json"
    manifest_path.write_text(json.dumps({"visualizaciones": [entry]}), encoding="utf-8")
    endpoint = "/api/dashboard/graficas/trm_mensual_2021_2026"
    result = client.get(endpoint)
    assert result.status_code == 200
    assert result.json() == {
        "data": [
            {
                "PERIODO": "2025-02-01T00:00:00",
                "ANIO": 2025,
                "MES": 2,
                "TRM_PROMEDIO_COP_USD": 4200.75,
            }
        ],
        "generated_at": None,
    }
    entry["actualizado_en"] = "2026-01-02T03:04:05+00:00"
    manifest_path.write_text(json.dumps({"visualizaciones": [entry]}), encoding="utf-8")
    assert client.get(endpoint).status_code == 503
