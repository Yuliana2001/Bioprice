from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import EmailStr, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_prefix="BIOPRICE_",
        extra="ignore",
        env_ignore_empty=True,
    )

    environment: Literal["development", "test", "production"] = "development"
    database_url: str | None = None
    auth_secret_key: SecretStr | None = None
    session_ttl_minutes: int = Field(default=480, ge=15, le=1440)
    password_reset_ttl_minutes: int = Field(default=30, ge=5, le=120)
    cors_origins: list[str] = [
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ]
    frontend_base_url: str = "http://127.0.0.1:4200"
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_sender: EmailStr | None = None
    smtp_starttls: bool = True
    smtp_timeout_seconds: int = Field(default=10, ge=1, le=60)
    analytics_data_dir: Path = ROOT_DIR / "data" / "analytics"
    duckdb_memory_limit: str = "1GB"
    duckdb_threads: int = Field(default=2, ge=1)

    @field_validator("analytics_data_dir")
    @classmethod
    def resolve_analytics_data_dir(cls, value: Path) -> Path:
        return value if value.is_absolute() else ROOT_DIR / value


@lru_cache
def get_settings() -> Settings:
    return Settings()
