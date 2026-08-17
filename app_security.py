"""Small, dependency-free security primitives for a single-workspace deployment."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass


SESSION_COOKIE = "report_session"
SESSION_TTL_SECONDS = 12 * 60 * 60


class SecurityConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SecuritySettings:
    environment: str
    password: str | None
    session_secret: str | None

    @classmethod
    def from_environment(cls) -> "SecuritySettings":
        return cls(
            environment=os.getenv("APP_ENV", "development").strip().lower(),
            password=os.getenv("APP_AUTH_PASSWORD") or None,
            session_secret=os.getenv("APP_SESSION_SECRET") or None,
        )

    @property
    def configured(self) -> bool:
        return bool(self.password and self.session_secret)

    @property
    def production(self) -> bool:
        return self.environment == "production"

    def validate(self) -> None:
        if bool(self.password) != bool(self.session_secret):
            raise SecurityConfigurationError(
                "APP_AUTH_PASSWORD และ APP_SESSION_SECRET ต้องกำหนดพร้อมกัน"
            )
        if self.production and not self.configured:
            raise SecurityConfigurationError(
                "production ต้องกำหนด APP_AUTH_PASSWORD และ APP_SESSION_SECRET"
            )
        if self.configured and len(self.session_secret or "") < 32:
            raise SecurityConfigurationError("APP_SESSION_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร")
        if self.configured and len(self.password or "") < 12:
            raise SecurityConfigurationError("APP_AUTH_PASSWORD ต้องยาวอย่างน้อย 12 ตัวอักษร")


class SessionManager:
    def __init__(self, settings: SecuritySettings):
        settings.validate()
        self.settings = settings

    def password_matches(self, candidate: str) -> bool:
        expected = self.settings.password or ""
        return self.settings.configured and hmac.compare_digest(
            candidate.encode("utf-8"), expected.encode("utf-8")
        )

    def create_session(self, now: int | None = None) -> str:
        if not self.settings.configured:
            raise SecurityConfigurationError("ยังไม่ได้ตั้งค่าระบบล็อกอิน")
        issued_at = int(time.time() if now is None else now)
        payload = {
            "iat": issued_at,
            "exp": issued_at + SESSION_TTL_SECONDS,
            "nonce": secrets.token_urlsafe(12),
        }
        encoded = _b64encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signature = self._sign(encoded)
        return f"{encoded}.{signature}"

    def verify_session(self, token: str | None, now: int | None = None) -> bool:
        if not self.settings.configured or not token:
            return False
        try:
            encoded, supplied_signature = token.split(".", 1)
            if not hmac.compare_digest(self._sign(encoded), supplied_signature):
                return False
            payload = json.loads(_b64decode(encoded))
            current_time = int(time.time() if now is None else now)
            return (
                isinstance(payload.get("iat"), int)
                and isinstance(payload.get("exp"), int)
                and payload["iat"] <= current_time
                and payload["exp"] >= current_time
            )
        except (ValueError, TypeError, json.JSONDecodeError):
            return False

    def _sign(self, encoded_payload: str) -> str:
        digest = hmac.new(
            (self.settings.session_secret or "").encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        return _b64encode(digest)


class RateLimiter:
    """In-memory fixed-window limiter suitable for this single-process service."""

    def __init__(self):
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_seconds: int, now: float | None = None) -> bool:
        current_time = time.monotonic() if now is None else now
        cutoff = current_time - window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                return False
            events.append(current_time)
            return True


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
