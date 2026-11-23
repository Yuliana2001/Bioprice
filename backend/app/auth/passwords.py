from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError
from pydantic import SecretStr

password_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65_536,
    parallelism=2,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)


def hash_password(password: SecretStr | str) -> str:
    value = password.get_secret_value() if isinstance(password, SecretStr) else password
    return password_hasher.hash(value)


def verify_password(password: SecretStr | str, password_hash: str) -> bool:
    value = password.get_secret_value() if isinstance(password, SecretStr) else password
    try:
        return password_hasher.verify(password_hash, value)
    except VerifyMismatchError:
        return False


def burn_password_verification(password: SecretStr | str) -> None:
    value = password.get_secret_value() if isinstance(password, SecretStr) else password
    password_hasher.hash(value)
