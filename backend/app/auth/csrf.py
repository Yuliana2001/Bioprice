import hashlib
import hmac
import secrets
from typing import Annotated

from fastapi import Header, HTTPException, Request, Response, status

from app.core.config import get_settings

CSRF_COOKIE_NAME = "bioprice_csrf"
SESSION_COOKIE_NAME = "bioprice_session"
CSRF_COOKIE_MAX_AGE_SECONDS = 3600


def _secret_key() -> bytes:
    configured_key = get_settings().auth_secret_key
    if configured_key is None or len(configured_key.get_secret_value()) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La clave de autenticación no está configurada.",
        )
    return configured_key.get_secret_value().encode("utf-8")


def create_csrf_token() -> str:
    nonce = secrets.token_urlsafe(32)
    signature = hmac.new(_secret_key(), nonce.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{nonce}.{signature}"


def set_csrf_cookie(response: Response) -> str:
    token = create_csrf_token()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        max_age=CSRF_COOKIE_MAX_AGE_SECONDS,
        httponly=False,
        secure=get_settings().environment == "production",
        samesite="lax",
        path="/api",
    )
    return token


def verify_csrf(
    request: Request,
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    if (
        not cookie_token
        or not x_csrf_token
        or not secrets.compare_digest(cookie_token, x_csrf_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La validación de seguridad de la solicitud falló.",
        )

    try:
        nonce, supplied_signature = cookie_token.rsplit(".", maxsplit=1)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La validación de seguridad de la solicitud falló.",
        ) from exc

    expected_signature = hmac.new(
        _secret_key(),
        nonce.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not secrets.compare_digest(supplied_signature, expected_signature):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La validación de seguridad de la solicitud falló.",
        )
