from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import require_admin
from app.auth.audit import record_security_event
from app.auth.csrf import verify_csrf
from app.auth.passwords import hash_password
from app.core.database import get_db_session
from app.models.audit_event import SecurityAuditEvent
from app.models.user import User, UserRole
from app.models.user_session import UserSession
from app.schemas.admin import (
    AdminUserResponse,
    AuditEventPage,
    AuditEventResponse,
    CreateUserRequest,
    UpdateUserRequest,
    UserPage,
)

router = APIRouter(prefix="/admin")


@router.get("/users", response_model=UserPage)
def list_users(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db_session),
) -> UserPage:
    total = db.scalar(select(func.count()).select_from(User)) or 0
    users = db.scalars(
        select(User).order_by(User.created_at.desc(), User.id).offset(offset).limit(limit)
    ).all()
    return UserPage(
        items=[AdminUserResponse.model_validate(user) for user in users],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/users",
    response_model=AdminUserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    payload: CreateUserRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db_session),
    _: None = Depends(verify_csrf),
) -> AdminUserResponse:
    email = str(payload.email).strip().lower()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta con ese correo electrónico.",
        )

    user = User(
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        active=True,
        email_verified=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if db.scalar(select(User.id).where(User.email == email)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una cuenta con ese correo electrónico.",
            ) from exc
        raise

    record_security_event(
        db,
        "USER_CREATED",
        actor_user_id=admin.id,
        target_user_id=user.id,
        details={"role": user.role.value},
    )
    db.commit()
    db.refresh(user)
    return AdminUserResponse.model_validate(user)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: UUID,
    payload: UpdateUserRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db_session),
    _: None = Depends(verify_csrf),
) -> AdminUserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta no encontrada.")

    becomes_non_admin = (
        user.role is UserRole.ADMIN
        and user.active
        and (
            payload.active is False
            or (payload.role is not None and payload.role is not UserRole.ADMIN)
        )
    )
    if user.id == admin.id and becomes_non_admin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No puedes desactivar ni quitar el rol ADMIN de tu propia cuenta.",
        )

    if becomes_non_admin:
        active_admin_ids = db.scalars(
            select(User.id)
            .where(User.role == UserRole.ADMIN, User.active.is_(True))
            .with_for_update()
        ).all()
        if len(active_admin_ids) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No se puede desactivar ni degradar al último administrador activo.",
            )

    previous_role = user.role
    previous_active = user.active
    if payload.role is not None:
        user.role = payload.role
    if payload.active is not None:
        user.active = payload.active

    if user.role is not previous_role or (previous_active and not user.active):
        db.execute(
            update(UserSession)
            .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )

    record_security_event(
        db,
        "USER_UPDATED",
        actor_user_id=admin.id,
        target_user_id=user.id,
        details={
            "role": user.role.value,
            "active": user.active,
        },
    )
    db.commit()
    db.refresh(user)
    return AdminUserResponse.model_validate(user)


@router.post("/users/{user_id}/revoke-sessions", response_model=dict[str, int])
def revoke_user_sessions(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db_session),
    _: None = Depends(verify_csrf),
) -> dict[str, int]:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta no encontrada.")

    result = db.execute(
        update(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    revoked_count = result.rowcount or 0
    record_security_event(
        db,
        "USER_SESSIONS_REVOKED",
        actor_user_id=admin.id,
        target_user_id=user.id,
        details={"revoked_count": revoked_count},
    )
    db.commit()
    return {"revoked_count": revoked_count}


@router.get("/audit", response_model=AuditEventPage)
def list_audit_events(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db_session),
) -> AuditEventPage:
    total = db.scalar(select(func.count()).select_from(SecurityAuditEvent)) or 0
    events = db.scalars(
        select(SecurityAuditEvent)
        .order_by(SecurityAuditEvent.occurred_at.desc(), SecurityAuditEvent.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return AuditEventPage(
        items=[AuditEventResponse.model_validate(event) for event in events],
        total=total,
        limit=limit,
        offset=offset,
    )
