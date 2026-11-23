from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_event import SecurityAuditEvent


def record_security_event(
    db: Session,
    action: str,
    *,
    actor_user_id: UUID | None = None,
    target_user_id: UUID | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    db.add(
        SecurityAuditEvent(
            action=action,
            actor_user_id=actor_user_id,
            target_user_id=target_user_id,
            details=details or {},
        )
    )
