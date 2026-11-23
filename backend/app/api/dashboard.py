import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.models.user import User
from app.repositories.analytics_charts import (
    AnalyticsChartResponse,
    ChartId,
    load_analytics_chart,
)
from app.repositories.brand_model_matches import (
    FILE_NAME,
    InvalidChartExport,
    load_brand_model_matches,
)
from app.schemas.dashboard import BrandModelMatchesResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard")


@router.get("/graficas/{chart_id}", response_model=AnalyticsChartResponse)
def analytics_chart(
    chart_id: ChartId,
    _: User = Depends(get_current_user),
) -> AnalyticsChartResponse:
    try:
        return load_analytics_chart(get_settings().analytics_data_dir, chart_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El resultado todavía no está disponible.",
        ) from exc
    except (OSError, InvalidChartExport) as exc:
        logger.error("No se pudo leer la exportación de %s (%s).", chart_id, type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El resultado no se puede leer o no cumple el contrato esperado.",
        ) from exc


@router.get(
    "/marcas-modelos-coincidentes",
    response_model=BrandModelMatchesResponse,
)
def brand_model_matches(
    _: User = Depends(get_current_user),
) -> BrandModelMatchesResponse:
    path = get_settings().analytics_data_dir / FILE_NAME
    try:
        return load_brand_model_matches(path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El archivo de resultados todavía no está disponible.",
        ) from exc
    except (OSError, InvalidChartExport) as exc:
        logger.error("No se pudo leer el archivo de la gráfica (%s).", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El archivo de resultados no se puede leer o no cumple el contrato esperado.",
        ) from exc
