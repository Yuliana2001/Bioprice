from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


class DatabaseConfigurationError(RuntimeError):
    """Raised when a database-dependent operation lacks a configured URL."""


@lru_cache
def get_engine() -> Engine:
    database_url = get_settings().database_url
    if not database_url:
        raise DatabaseConfigurationError(
            "Configure BIOPRICE_DATABASE_URL before accessing PostgreSQL."
        )

    return create_engine(
        database_url,
        pool_size=3,
        max_overflow=1,
        pool_timeout=20,
        pool_pre_ping=True,
    )


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(
        bind=get_engine(),
        autoflush=False,
        expire_on_commit=False,
    )


def get_db_session() -> Iterator[Session]:
    with get_session_factory()() as session:
        yield session
