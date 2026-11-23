from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.auth.passwords import hash_password, verify_password
from app.auth.rate_limit import SlidingWindowRateLimiter
from app.auth.tokens import generate_token, hash_token
from app.models.audit_event import SecurityAuditEvent
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User, UserRole
from app.models.user_session import UserSession


def _create_user(
    factory: sessionmaker[Session],
    *,
    email: str = "admin@example.com",
    role: UserRole = UserRole.ADMIN,
) -> User:
    user = User(
        name="Test Admin",
        email=email,
        password_hash=hash_password("correct-horse-battery"),
        role=role,
        active=True,
        email_verified=True,
    )
    with factory() as db:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


def _csrf_headers(client: TestClient) -> dict[str, str]:
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def _login(client: TestClient, email: str = "admin@example.com") -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "correct-horse-battery"},
        headers=_csrf_headers(client),
    )
    assert response.status_code == 200
    return client


def test_login_uses_hashed_server_side_session_and_logout_revokes_it(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    _create_user(session_factory)

    response = client.post(
        "/api/auth/login",
        json={"email": "ADMIN@example.com", "password": "correct-horse-battery"},
        headers=_csrf_headers(client),
    )

    assert response.status_code == 200
    session_cookie = response.cookies.get("bioprice_session")
    assert session_cookie is not None
    assert "httponly" in response.headers["set-cookie"].lower()
    assert response.json()["user"]["role"] == "ADMIN"
    with session_factory() as db:
        auth_session = db.scalar(select(UserSession))
        assert auth_session is not None
        assert auth_session.token_hash == hash_token(session_cookie)
        assert auth_session.token_hash != session_cookie

    assert client.get("/api/auth/me").status_code == 200
    logout_response = client.post(
        "/api/auth/logout",
        headers=_csrf_headers(client),
    )
    assert logout_response.status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_login_rejects_missing_csrf_token(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    _create_user(session_factory)

    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct-horse-battery"},
    )

    assert response.status_code == 403


def test_bootstrap_registration_creates_first_admin_and_closes_registration(
    client: TestClient,
) -> None:
    status_response = client.get("/api/auth/registration-status")
    assert status_response.status_code == 200
    assert status_response.json() == {"registration_available": True}

    register_response = client.post(
        "/api/auth/register",
        json={
            "name": "Primera Administradora",
            "email": "first-admin@example.com",
            "password": "a-secure-bootstrap-password",
        },
        headers=_csrf_headers(client),
    )

    assert register_response.status_code == 201
    assert register_response.json()["user"]["role"] == "ADMIN"
    assert register_response.json()["user"]["email_verified"] is True
    assert client.get("/api/auth/registration-status").json() == {
        "registration_available": False
    }

    closed_response = client.post(
        "/api/auth/register",
        json={
            "name": "Otra Persona",
            "email": "other@example.com",
            "password": "a-secure-bootstrap-password",
        },
        headers=_csrf_headers(client),
    )
    assert closed_response.status_code == 403


def test_reset_password_token_is_single_use(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    user = _create_user(session_factory)
    raw_token = generate_token()
    with session_factory() as db:
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_token(raw_token),
                expires_at=datetime.now(UTC) + timedelta(minutes=10),
            )
        )
        db.commit()

    headers = _csrf_headers(client)
    payload = {"token": raw_token, "new_password": "a-new-secure-password"}
    first_response = client.post(
        "/api/auth/reset-password",
        json=payload,
        headers=headers,
    )
    second_response = client.post(
        "/api/auth/reset-password",
        json=payload,
        headers=headers,
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 400
    with session_factory() as db:
        updated_user = db.get(User, user.id)
        events = db.scalars(select(SecurityAuditEvent)).all()
        assert updated_user is not None
        assert verify_password("a-new-secure-password", updated_user.password_hash)
        assert [event.action for event in events] == ["PASSWORD_RESET"]


def test_change_password_revokes_the_current_session(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    user = _create_user(session_factory)
    _login(client)

    response = client.post(
        "/api/auth/change-password",
        json={
            "current_password": "correct-horse-battery",
            "new_password": "another-secure-password",
        },
        headers=_csrf_headers(client),
    )

    assert response.status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    with session_factory() as db:
        updated_user = db.get(User, user.id)
        auth_session = db.scalar(select(UserSession))
        assert updated_user is not None
        assert auth_session is not None
        assert auth_session.revoked_at is not None
        assert verify_password("another-secure-password", updated_user.password_hash)


def test_forgot_password_is_not_enabled_without_email_provider(client: TestClient) -> None:
    response = client.post(
        "/api/auth/forgot-password",
        json={"email": "someone@example.com"},
        headers=_csrf_headers(client),
    )

    assert response.status_code == 503
    assert "proveedor de correo" in response.json()["detail"]


def test_admin_routes_require_admin_role(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    analyst_email = f"analyst-{uuid4()}@example.com"
    _create_user(session_factory, email=analyst_email, role=UserRole.ANALISTA)
    _login(client, email=analyst_email)

    response = client.get("/api/admin/users")

    assert response.status_code == 403


def test_admin_can_create_update_and_audit_user_access(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    _create_user(session_factory)
    _login(client)
    headers = _csrf_headers(client)

    create_response = client.post(
        "/api/admin/users",
        json={
            "name": "BioPrice Analyst",
            "email": "analyst@example.com",
            "password": "a-secure-initial-password",
            "role": "ANALISTA",
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    analyst = create_response.json()
    assert analyst["email_verified"] is True

    update_response = client.patch(
        f"/api/admin/users/{analyst['id']}",
        json={"active": False, "role": "VISUALIZADOR"},
        headers=headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["active"] is False
    assert update_response.json()["role"] == "VISUALIZADOR"

    audit_response = client.get("/api/admin/audit")
    assert audit_response.status_code == 200
    actions = [item["action"] for item in audit_response.json()["items"]]
    assert "USER_CREATED" in actions
    assert "USER_UPDATED" in actions


def test_admin_cannot_deactivate_the_only_admin(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    admin = _create_user(session_factory)
    _login(client)

    response = client.patch(
        f"/api/admin/users/{admin.id}",
        json={"active": False},
        headers=_csrf_headers(client),
    )

    assert response.status_code == 409


def test_login_rate_limiter_rejects_requests_after_the_limit() -> None:
    limiter = SlidingWindowRateLimiter()

    limiter.check("test-key", limit=1, window_seconds=60)
    with pytest.raises(HTTPException) as error:
        limiter.check("test-key", limit=1, window_seconds=60)
    assert error.value.status_code == 429
