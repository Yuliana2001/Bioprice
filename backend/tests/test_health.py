from fastapi.testclient import TestClient

from app.main import app


def test_health_does_not_require_database_or_analytics_files() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
