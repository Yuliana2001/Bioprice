from collections import deque
from hashlib import sha256
from threading import Lock
from time import monotonic

from fastapi import HTTPException, status


class SlidingWindowRateLimiter:
    def __init__(self, maximum_keys: int = 4096) -> None:
        self._attempts: dict[str, deque[tuple[float, int]]] = {}
        self._maximum_keys = maximum_keys
        self._lock = Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = monotonic()
        with self._lock:
            attempts = self._attempts.get(key)
            if attempts is None:
                self._make_room(now)
                attempts = deque()
                self._attempts[key] = attempts

            while attempts and now - attempts[0][0] >= attempts[0][1]:
                attempts.popleft()

            if len(attempts) >= limit:
                retry_after = max(1, int(attempts[0][1] - (now - attempts[0][0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Demasiados intentos. Inténtalo más tarde.",
                    headers={"Retry-After": str(retry_after)},
                )

            attempts.append((now, window_seconds))

    def clear(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)

    def _make_room(self, now: float) -> None:
        if len(self._attempts) < self._maximum_keys:
            return

        for key, attempts in tuple(self._attempts.items()):
            while attempts and now - attempts[0][0] >= attempts[0][1]:
                attempts.popleft()
            if not attempts:
                del self._attempts[key]

        while len(self._attempts) >= self._maximum_keys:
            self._attempts.pop(next(iter(self._attempts)))


rate_limiter = SlidingWindowRateLimiter()


def keyed_value(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def enforce_login_limits(client_ip: str, email: str) -> tuple[str, str]:
    ip_key = f"login-ip:{keyed_value(client_ip)}"
    email_key = f"login-email:{keyed_value(email)}"
    rate_limiter.check(ip_key, limit=30, window_seconds=60)
    rate_limiter.check(email_key, limit=8, window_seconds=900)
    return ip_key, email_key


def enforce_recovery_limits(client_ip: str, email: str) -> None:
    rate_limiter.check(
        f"recovery-ip:{keyed_value(client_ip)}",
        limit=10,
        window_seconds=3600,
    )
    rate_limiter.check(
        f"recovery-email:{keyed_value(email)}",
        limit=3,
        window_seconds=3600,
    )
