import argparse
import getpass
import sys

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select, text

from app.auth.audit import record_security_event
from app.auth.passwords import hash_password
from app.core.database import get_session_factory
from app.models.user import User, UserRole


def create_initial_admin() -> int:
    name = input("Nombre del administrador: ").strip()
    email_input = input("Correo del administrador: ").strip()
    try:
        email = str(TypeAdapter(EmailStr).validate_python(email_input)).lower()
    except ValidationError:
        print("El correo electrónico no es válido.", file=sys.stderr)
        return 2
    if not name or len(name) > 120:
        print("El nombre debe tener entre 1 y 120 caracteres.", file=sys.stderr)
        return 2

    password = getpass.getpass("Contraseña (mínimo 12 caracteres): ")
    confirmation = getpass.getpass("Confirma la contraseña: ")
    if len(password) < 12 or len(password) > 128:
        print("La contraseña debe tener entre 12 y 128 caracteres.", file=sys.stderr)
        return 2
    if password != confirmation:
        print("Las contraseñas no coinciden.", file=sys.stderr)
        return 2

    with get_session_factory()() as db:
        db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": 4847774147920853829})
        existing_admin = db.scalar(
            select(User.id).where(User.role == UserRole.ADMIN)
        )
        if existing_admin is not None:
            print("Ya existe un administrador; no se creó otra cuenta inicial.", file=sys.stderr)
            return 1
        existing_user = db.scalar(select(User.id).where(User.email == email))
        if existing_user is not None:
            print("Ya existe una cuenta con ese correo electrónico.", file=sys.stderr)
            return 1

        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
            active=True,
            email_verified=True,
        )
        db.add(user)
        db.flush()
        record_security_event(
            db,
            "INITIAL_ADMIN_CREATED",
            target_user_id=user.id,
        )
        db.commit()

    print("Cuenta inicial de administración creada.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="bioprice")
    parser.add_argument("command", choices=["create-admin"])
    args = parser.parse_args()
    if args.command == "create-admin":
        return create_initial_admin()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
