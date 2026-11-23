import logging
import smtplib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import AuthenticatedUser, get_authenticated_user
from app.auth.audit import record_security_event
from app.auth.csrf import (
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    set_csrf_cookie,
    verify_csrf,
)
from app.auth.mailer import email_provider_configured, send_password_reset_email
from app.auth.passwords import (
    burn_password_verification,
    hash_password,
    verify_password,
)
from app.auth.rate_limit import (
    enforce_login_limits,
    enforce_recovery_limits,
    keyed_value,
    rate_limiter,
)
from app.auth.tokens import generate_token, hash_token
from app.core.config import get_settings
from app.core.database import get_db_session
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User, UserRole
from app.models.user_session import UserSession
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    CsrfResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegistrationRequest,
    RegistrationStatusResponse,
    ResetPasswordRequest,
    UserResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth")


def _set_session_cookie(response: Response, raw_token: str, max_age: int) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=max_age,
        httponly=True,
        secure=get_settings().environment == "production",
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=get_settings().environment == "production",
        samesite="lax",
        path="/",
    )


def _invalid_login() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Correo electrónico o contraseña incorrectos.",
    )


@router.get("/csrf", response_model=CsrfResponse)
def csrf_token(response: Response) -> CsrfResponse:
    return CsrfResponse(csrf_token=set_csrf_cookie(response))


@router.get("/registration-status", response_model=RegistrationStatusResponse)
def registration_status(db: Session = Depends(get_db_session)) -> RegistrationStatusResponse:
    user_count = db.scalar(select(func.count()).select_from(User)) or 0
    return RegistrationStatusResponse(registration_available=user_count == 0)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register_bootstrap_admin(
    payload: RegistrationRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
    _: None = Depends(verify_csrf),
) -> AuthResponse:
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(
        f"bootstrap-register-ip:{keyed_value(client_ip)}",
        limit=10,
        window_seconds=3600,
    )
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(4872931842617501923)"))
    user_count = db.scalar(select(func.count()).select_from(User)) or 0
    if user_count != 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "El registro público está cerrado. "
                "Solicita una cuenta a una persona administradora."
            ),
        )

    email = str(payload.email).strip().lower()
    user = User(
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
        role=UserRole.ADMIN,
        active=True,
        email_verified=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta con ese correo electrónico.",
        ) from exc

    now = datetime.now(UTC)
    user.last_login_at = now
    session_ttl = get_settings().session_ttl_minutes
    raw_token = generate_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=now + timedelta(minutes=session_ttl),
        )
    )
    record_security_event(
        db,
        "INITIAL_ADMIN_REGISTERED",
        actor_user_id=user.id,
        target_user_id=user.id,
    )
    db.commit()
    db.refresh(user)
    _set_session_cookie(response, raw_token, max_age=session_ttl * 60)
    return AuthResponse(user=UserResponse.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
    _: None = Depends(verify_csrf),
) -> AuthResponse:
    email = str(payload.email).strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    _, email_rate_key = enforce_login_limits(client_ip, email)
    user = db.scalar(select(User).where(User.email == email))
    password = payload.password.get_secret_value()

    if user is None:
        burn_password_verification(password)
        record_security_event(db, "LOGIN_FAILED", details={"reason": "invalid_credentials"})
        db.commit()
        raise _invalid_login()

    now = datetime.now(UTC)
    locked_until = user.locked_until
    if locked_until is not None and locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=UTC)
    password_matches = verify_password(password, user.password_hash)
    if (
        not password_matches
        or not user.active
        or (locked_until is not None and locked_until > now)
    ):
        if not password_matches and user.active:
            db.execute(
                update(User)
                .where(User.id == user.id)
                .values(failed_login_attempts=User.failed_login_attempts + 1)
            )
            db.refresh(user, attribute_names=["failed_login_attempts"])
            if user.failed_login_attempts >= 5:
                user.locked_until = now + timedelta(minutes=15)
        record_security_event(
            db,
            "LOGIN_FAILED",
            target_user_id=user.id,
            details={"reason": "invalid_credentials"},
        )
        db.commit()
        raise _invalid_login()

    if not user.email_verified:
        record_security_event(
            db,
            "LOGIN_FAILED",
            target_user_id=user.id,
            details={"reason": "account_not_verified"},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La cuenta no está habilitada para iniciar sesión.",
        )

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    raw_token = generate_token()
    session_ttl = get_settings().session_ttl_minutes
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=now + timedelta(minutes=session_ttl),
        )
    )
    record_security_event(
        db,
        "LOGIN_SUCCESS",
        actor_user_id=user.id,
        target_user_id=user.id,
    )
    db.commit()
    rate_limiter.clear(email_rate_key)
    _set_session_cookie(response, raw_token, max_age=session_ttl * 60)
    return AuthResponse(user=UserResponse.model_validate(user))


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response,
    authentication: AuthenticatedUser = Depends(get_authenticated_user),
    db: Session = Depends(get_db_session),
    _: None = Depends(verify_csrf),
) -> MessageResponse:
    now = datetime.now(UTC)
    authentication.session.revoked_at = now
    record_security_event(
        db,
        "LOGOUT",
        actor_user_id=authentication.user.id,
        target_user_id=authentication.user.id,
    )
    db.commit()
    _clear_session_cookie(response)
    response.delete_cookie(
        key=CSRF_COOKIE_NAME,
        secure=get_settings().environment == "production",
        samesite="lax",
        path="/api",
    )
    return MessageResponse(message="Sesión cerrada.")


@router.get("/me", response_model=UserResponse)
def me(authentication: AuthenticatedUser = Depends(get_authenticated_user)) -> UserResponse:
    return UserResponse.model_validate(authentication.user)


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    authentication: AuthenticatedUser = Depends(get_authenticated_user),
    db: Session = Depends(get_db_session),
    _: None = Depends(verify_csrf),
) -> MessageResponse:
    user = authentication.user
    if not verify_password(payload.current_password, user.password_hash):
        record_security_event(
            db,
            "PASSWORD_CHANGE_FAILED",
            actor_user_id=user.id,
            target_user_id=user.id,
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es válida.",
        )

    now = datetime.now(UTC)
    user.password_hash = hash_password(payload.new_password)
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    record_security_event(
        db,
        "PASSWORD_CHANGED",
        actor_user_id=user.id,
        target_user_id=user.id,
    )
    db.commit()
    _clear_session_cookie(response)
    return MessageResponse(message="Contraseña actualizada. Inicia sesión de nuevo.")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db_session),
    _: None = Depends(verify_csrf),
) -> MessageResponse:
    settings = get_settings()
    if not email_provider_configured(settings):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "La recuperación no está habilitada porque falta configurar "
                "el proveedor de correo."
            ),
        )

    email = str(payload.email).strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    enforce_recovery_limits(client_ip, email)
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not user.active or not user.email_verified:
        return MessageResponse(
            message="Si la cuenta está habilitada, recibirás instrucciones para continuar."
        )

    now = datetime.now(UTC)
    db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    raw_token = generate_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=now + timedelta(minutes=settings.password_reset_ttl_minutes),
        )
    )
    record_security_event(
        db,
        "PASSWORD_RESET_REQUESTED",
        target_user_id=user.id,
    )
    db.commit()

    try:
        send_password_reset_email(settings, email, raw_token)
    except (OSError, smtplib.SMTPException) as exc:
        logger.error("Password-reset email delivery failed (%s).", type(exc).__name__)

    return MessageResponse(
        message="Si la cuenta está habilitada, recibirás instrucciones para continuar."
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db_session),
    _: None = Depends(verify_csrf),
) -> MessageResponse:
    token_row = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_token(payload.token),
            PasswordResetToken.used_at.is_(None),
        ).with_for_update()
    )
    now = datetime.now(UTC)
    if token_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El enlace no es válido o ha vencido.",
        )
    expires_at = token_row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    user = db.get(User, token_row.user_id)
    if expires_at <= now or user is None or not user.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El enlace no es válido o ha vencido.",
        )

    user.password_hash = hash_password(payload.new_password)
    token_row.used_at = now
    db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.id != token_row.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    record_security_event(
        db,
        "PASSWORD_RESET",
        target_user_id=user.id,
    )
    db.commit()
    return MessageResponse(message="Contraseña actualizada. Ya puedes iniciar sesión.")
