from datetime import date

from pydantic import AwareDatetime, BaseModel, Field


class BrandModelMatch(BaseModel):
    CATEGORIA: str
    MARCA_MODELO: str
    COINCIDENCIAS: int = Field(ge=0, strict=True)
    REGISTROS_INVIMA: int = Field(ge=0, strict=True)


class BrandModelMatchesResponse(BaseModel):
    data: list[BrandModelMatch]
    generated_at: AwareDatetime | None = None
    period_start: date | None = None
    period_end: date | None = None
