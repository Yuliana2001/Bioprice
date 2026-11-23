from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.csrf import SESSION_COOKIE_NAME
from app.core.database import get_db_session
from app.models.user import User, UserRole
from app.models.user_session import UserSession


@dataclass(frozen=True)
class AuthenticatedUser:
    user: User
    session: UserSession


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def get_authenticated_user(
    request: Request,
    db: Session = Depends(get_db_session),
) -> AuthenticatedUser:
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida.",
        )

    token_hash = sha256(raw_token.encode("utf-8")).hexdigest()
    auth_session = db.scalar(
        select(UserSession).where(
            UserSession.token_hash == token_hash,
            UserSession.revoked_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    if auth_session is None or _as_utc(auth_session.expires_at) <= now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión no es válida o ha expirado.",
        )

    user = db.get(User, auth_session.user_id)
    if user is None or not user.active or not user.email_verified:
        auth_session.revoked_at = now
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión no es válida o ha expirado.",
        )

    return AuthenticatedUser(user=user, session=auth_session)


def get_current_user(
    authentication: AuthenticatedUser = Depends(get_authenticated_user),
) -> User:
    return authentication.user


def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    if user.role is not UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere el rol ADMIN.",
        )
    return user
