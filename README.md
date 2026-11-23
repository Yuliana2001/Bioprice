# BioPrice BI

Plataforma para consultar análisis de precios históricos de importación de equipos biomédicos en Colombia.

## Arquitectura

- `frontend/`: Angular 20, Tailwind CSS, Apache ECharts y Lucide.
- `backend/`: FastAPI, SQLAlchemy 2, Alembic y PostgreSQL.
- `data/analytics/`: destino local de copias manuales de resultados producidos en Google Colab.
- `notebook/`: notebook científico existente; no se ejecuta ni modifica desde esta aplicación.

PostgreSQL se reserva para usuarios, roles, sesiones y auditoría. Los registros aduaneros y los resultados analíticos se consultan desde archivos exportados; Angular se comunica únicamente con FastAPI. No se requiere Docker ni una sesión activa de Colab para iniciar la base técnica.

## Requisitos locales

- Windows 10/11.
- Node.js compatible con Angular 20 (20.19+, 22.12+ o 24+) y npm.
- Python 3.12 y `uv`.
- PostgreSQL local instalado como servicio.

## Configuración local

1. Crea el archivo de configuración real en la raíz del repositorio: copia `.env.example` a `.env`.
   Pydantic Settings lo carga mediante `ROOT_DIR / ".env"` desde [backend/app/core/config.py](backend/app/core/config.py).
   Configura en ese `.env` una base PostgreSQL local y genera
   `BIOPRICE_AUTH_SECRET_KEY` con `uv run python -c "import secrets; print(secrets.token_urlsafe(48))"`.
   No guardes `.env` en Git.
2. Desde `backend/`, ejecuta `uv sync` y `uv run alembic upgrade head`.
3. Crea el primer administrador de forma interactiva con
   `uv run python -m app.cli create-admin`. La contraseña se solicita sin mostrarla y no se acepta
   como argumento de terminal.
4. Inicia FastAPI con `uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
5. Desde `frontend/`, ejecuta `npm ci` y luego `npm start`. El servidor Angular reenvía `/api` a FastAPI.
6. Comprueba `http://127.0.0.1:8000/api/health` y accede a `http://localhost:4200/ingresar`.

El endpoint de salud no requiere que PostgreSQL ni los archivos analíticos estén disponibles. La conexión a PostgreSQL se crea de forma diferida al utilizar una sesión de base de datos. La migración actual crea únicamente tablas de identidad y seguridad.

## Validación

- Frontend: `npm run build` y `npm test -- --watch=false`, desde `frontend/`.
- Backend: `uv run pytest` y `uv run ruff check app tests`, desde `backend/`.

## Estado de desarrollo

La aplicación incorpora autenticación con sesiones de servidor, protección CSRF, roles, recuperación por correo configurable y administración de usuarios. La recuperación de contraseña responde como no disponible mientras no se configure SMTP. La ruta de administración exige rol `ADMIN` tanto en Angular como en FastAPI. El dashboard protegido muestra las coincidencias de marcas y modelos cuando está disponible el resumen exportado desde Colab; no incluye métricas ficticias. Consulta [docs/autenticacion.md](docs/autenticacion.md), [docs/arquitectura.md](docs/arquitectura.md), [docs/integracion_notebook.md](docs/integracion_notebook.md) y [docs/contrato_datos.md](docs/contrato_datos.md).
