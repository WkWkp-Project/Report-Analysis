"""Secure Facebook Login and Graph API account discovery.

This module owns connection credentials. Access tokens are encrypted at rest and
never returned by the REST API. The first implementation is intentionally a
single-workspace adapter so it can run locally or in one container; its public
contract can later be backed by a database without changing the frontend.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests
from cryptography.fernet import Fernet, InvalidToken


DEFAULT_GRAPH_VERSION = "v25.0"
DEFAULT_SCOPES = (
    "pages_show_list",
    "pages_read_engagement",
    "pages_read_user_content",
    "read_insights",
    "ads_read",
)
STATE_TTL_SECONDS = 600
GRAPH_HOST = "graph.facebook.com"
SENSITIVE_QUERY_KEYS = {"access_token", "appsecret_proof", "client_secret"}


class FacebookConnectionError(RuntimeError):
    """A safe-to-display connection error."""


@dataclass(frozen=True)
class FacebookConfig:
    app_id: str
    app_secret: str
    redirect_uri: str
    frontend_url: str
    graph_version: str
    scopes: tuple[str, ...]
    data_dir: Path
    encryption_secret: str

    @classmethod
    def from_env(cls) -> "FacebookConfig":
        app_id = os.getenv("FB_APP_ID", "").strip()
        app_secret = os.getenv("FB_APP_SECRET", "").strip()
        app_base_url = os.getenv("APP_BASE_URL", "http://localhost:8000").rstrip("/")
        redirect_uri = os.getenv(
            "FB_REDIRECT_URI", f"{app_base_url}/api/facebook/oauth/callback"
        ).strip()
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
        graph_version = os.getenv("FB_GRAPH_API_VERSION", DEFAULT_GRAPH_VERSION).strip()
        if not graph_version.startswith("v"):
            graph_version = f"v{graph_version}"
        scopes = tuple(
            scope.strip()
            for scope in os.getenv("FB_OAUTH_SCOPES", ",".join(DEFAULT_SCOPES)).split(",")
            if scope.strip()
        )
        data_dir = Path(os.getenv("APP_DATA_DIR", "./data"))
        encryption_secret = os.getenv("TOKEN_ENCRYPTION_KEY", "").strip() or app_secret
        return cls(
            app_id=app_id,
            app_secret=app_secret,
            redirect_uri=redirect_uri,
            frontend_url=frontend_url,
            graph_version=graph_version,
            scopes=scopes,
            data_dir=data_dir,
            encryption_secret=encryption_secret,
        )

    @property
    def configured(self) -> bool:
        return bool(self.app_id and self.app_secret and self.encryption_secret)

    @property
    def graph_base(self) -> str:
        return f"https://graph.facebook.com/{self.graph_version}"


class EncryptedConnectionStore:
    def __init__(self, config: FacebookConfig):
        self.config = config
        self.path = config.data_dir / "connections" / "facebook.enc"

    def _fernet(self) -> Fernet:
        if not self.config.encryption_secret:
            raise FacebookConnectionError("ยังไม่ได้ตั้งค่ากุญแจเข้ารหัส token")
        digest = hashlib.sha256(
            f"report-analysis:facebook:{self.config.encryption_secret}".encode("utf-8")
        ).digest()
        return Fernet(base64.urlsafe_b64encode(digest))

    def save(self, connection: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        encrypted = self._fernet().encrypt(
            json.dumps(connection, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        )
        temporary = self.path.with_suffix(".tmp")
        temporary.write_bytes(encrypted)
        temporary.replace(self.path)

    def load(self) -> dict[str, Any] | None:
        if not self.path.exists():
            return None
        try:
            decrypted = self._fernet().decrypt(self.path.read_bytes())
            return json.loads(decrypted.decode("utf-8"))
        except (InvalidToken, ValueError, json.JSONDecodeError) as exc:
            raise FacebookConnectionError(
                "อ่านข้อมูลเชื่อมต่อไม่ได้ กรุณาตรวจ TOKEN_ENCRYPTION_KEY หรือเชื่อมต่อใหม่"
            ) from exc

    def delete(self) -> bool:
        if not self.path.exists():
            return False
        self.path.unlink()
        return True


class FacebookOAuthService:
    def __init__(self, config: FacebookConfig | None = None):
        self.config = config or FacebookConfig.from_env()
        self.store = EncryptedConnectionStore(self.config)

    def require_configured(self) -> None:
        if not self.config.configured:
            raise FacebookConnectionError(
                "ยังไม่ได้ตั้งค่า FB_APP_ID และ FB_APP_SECRET ที่ backend"
            )

    def create_state(self) -> str:
        self.require_configured()
        payload = {
            "iat": int(time.time()),
            "nonce": secrets.token_urlsafe(18),
        }
        raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        signature = hmac.new(
            self.config.app_secret.encode("utf-8"), raw, hashlib.sha256
        ).digest()
        return f"{_b64encode(raw)}.{_b64encode(signature)}"

    def validate_state(self, state: str) -> None:
        self.require_configured()
        try:
            raw_part, signature_part = state.split(".", 1)
            raw = _b64decode(raw_part)
            signature = _b64decode(signature_part)
            expected = hmac.new(
                self.config.app_secret.encode("utf-8"), raw, hashlib.sha256
            ).digest()
            if not hmac.compare_digest(signature, expected):
                raise ValueError("signature")
            payload = json.loads(raw.decode("utf-8"))
            issued_at = int(payload["iat"])
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise FacebookConnectionError("OAuth state ไม่ถูกต้อง กรุณาเริ่มเชื่อมต่อใหม่") from exc
        age = int(time.time()) - issued_at
        if age < -60 or age > STATE_TTL_SECONDS:
            raise FacebookConnectionError("OAuth state หมดอายุ กรุณาเริ่มเชื่อมต่อใหม่")

    def authorization_url(self, state: str | None = None) -> str:
        state = state or self.create_state()
        params = {
            "client_id": self.config.app_id,
            "redirect_uri": self.config.redirect_uri,
            "state": state,
            "scope": ",".join(self.config.scopes),
            "response_type": "code",
        }
        return f"https://www.facebook.com/{self.config.graph_version}/dialog/oauth?{urlencode(params)}"

    def complete_oauth(self, code: str, state: str) -> dict[str, Any]:
        self.validate_state(state)
        short_lived = self._request_json(
            f"{self.config.graph_base}/oauth/access_token",
            params={
                "client_id": self.config.app_id,
                "client_secret": self.config.app_secret,
                "redirect_uri": self.config.redirect_uri,
                "code": code,
            },
            include_proof=False,
            method="POST",
        )
        access_token = short_lived.get("access_token")
        if not access_token:
            raise FacebookConnectionError("Meta ไม่ได้ส่ง access token กลับมา")

        token_data = self._request_json(
            f"{self.config.graph_base}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": self.config.app_id,
                "client_secret": self.config.app_secret,
                "fb_exchange_token": access_token,
            },
            include_proof=False,
            method="POST",
        )
        long_lived_token = token_data.get("access_token") or access_token
        user = self._request_json(
            f"{self.config.graph_base}/me",
            params={"fields": "id,name"},
            access_token=long_lived_token,
        )
        permission_rows = self._paginate(
            f"{self.config.graph_base}/me/permissions",
            params={},
            access_token=long_lived_token,
        )
        granted_scopes = sorted(
            row["permission"]
            for row in permission_rows
            if row.get("status") == "granted" and row.get("permission")
        )
        declined_scopes = sorted(
            row["permission"]
            for row in permission_rows
            if row.get("status") == "declined" and row.get("permission")
        )
        pages = self._paginate(
            f"{self.config.graph_base}/me/accounts",
            params={"fields": "id,name,access_token,tasks"},
            access_token=long_lived_token,
        )
        ad_accounts = self._paginate(
            f"{self.config.graph_base}/me/adaccounts",
            params={
                "fields": "id,name,account_id,account_status,currency,timezone_name",
            },
            access_token=long_lived_token,
        )
        now = int(time.time())
        expires_in = token_data.get("expires_in") or short_lived.get("expires_in")
        connection = {
            "provider": "facebook",
            "graph_version": self.config.graph_version,
            "connected_at": now,
            "updated_at": now,
            "expires_at": now + int(expires_in) if expires_in else None,
            "user": {"id": user.get("id"), "name": user.get("name")},
            "requested_scopes": list(self.config.scopes),
            "granted_scopes": granted_scopes,
            "declined_scopes": declined_scopes,
            "access_token": long_lived_token,
            "pages": pages,
            "ad_accounts": ad_accounts,
        }
        self.store.save(connection)
        return sanitize_connection(connection)

    def refresh_resources(self) -> dict[str, Any]:
        connection = self.store.load()
        if not connection:
            raise FacebookConnectionError("ยังไม่ได้เชื่อมบัญชี Facebook")
        token = connection["access_token"]
        connection["pages"] = self._paginate(
            f"{self.config.graph_base}/me/accounts",
            params={"fields": "id,name,access_token,tasks"},
            access_token=token,
        )
        connection["ad_accounts"] = self._paginate(
            f"{self.config.graph_base}/me/adaccounts",
            params={"fields": "id,name,account_id,account_status,currency,timezone_name"},
            access_token=token,
        )
        connection["updated_at"] = int(time.time())
        self.store.save(connection)
        return sanitize_connection(connection)

    def status(self) -> dict[str, Any]:
        base = {
            "configured": self.config.configured,
            "connected": False,
            "graph_version": self.config.graph_version,
            "redirect_uri": self.config.redirect_uri,
            "required_environment": ["FB_APP_ID", "FB_APP_SECRET"],
            "scopes": list(self.config.scopes),
        }
        if not self.config.configured:
            return base
        connection = self.store.load()
        if not connection:
            return base
        return {**base, "connected": True, "connection": sanitize_connection(connection)}

    def _paginate(
        self, url: str, params: dict[str, Any], access_token: str
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        next_url: str | None = url
        next_params: dict[str, Any] = {**params, "limit": 100}
        while next_url:
            next_url = _validated_graph_url(next_url)
            response = self._request_json(
                next_url, params=next_params, access_token=access_token
            )
            items.extend(response.get("data", []))
            next_url = response.get("paging", {}).get("next")
            next_params = {}
        return items

    def _request_json(
        self,
        url: str,
        params: dict[str, Any],
        access_token: str | None = None,
        include_proof: bool = True,
        method: str = "GET",
    ) -> dict[str, Any]:
        safe_url = _validated_graph_url(url)
        request_params = dict(params)
        headers: dict[str, str] = {"Accept": "application/json"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
            if include_proof:
                request_params["appsecret_proof"] = hmac.new(
                    self.config.app_secret.encode("utf-8"),
                    access_token.encode("utf-8"),
                    hashlib.sha256,
                ).hexdigest()
        try:
            if method == "POST":
                response = requests.post(
                    safe_url, data=request_params, headers=headers, timeout=30
                )
            else:
                response = requests.get(
                    safe_url, params=request_params, headers=headers, timeout=30
                )
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise FacebookConnectionError("ติดต่อ Meta ไม่สำเร็จ กรุณาลองอีกครั้ง") from exc
        if not response.ok or "error" in data:
            meta_error = data.get("error", {})
            code = meta_error.get("code")
            suffix = f" (code {code})" if code else ""
            raise FacebookConnectionError(f"Meta ปฏิเสธคำขอ{suffix}")
        return data


def sanitize_connection(connection: dict[str, Any]) -> dict[str, Any]:
    expires_at = connection.get("expires_at")
    return {
        "provider": connection.get("provider"),
        "graph_version": connection.get("graph_version"),
        "connected_at": connection.get("connected_at"),
        "updated_at": connection.get("updated_at"),
        "expires_at": expires_at,
        "expired": bool(expires_at and int(expires_at) <= int(time.time())),
        "user": connection.get("user", {}),
        "requested_scopes": connection.get("requested_scopes", []),
        "granted_scopes": connection.get("granted_scopes", []),
        "declined_scopes": connection.get("declined_scopes", []),
        "pages": [
            {"id": page.get("id"), "name": page.get("name"), "tasks": page.get("tasks", [])}
            for page in connection.get("pages", [])
        ],
        "ad_accounts": [
            {
                "id": account.get("id"),
                "account_id": account.get("account_id"),
                "name": account.get("name"),
                "account_status": account.get("account_status"),
                "currency": account.get("currency"),
                "timezone_name": account.get("timezone_name"),
            }
            for account in connection.get("ad_accounts", [])
        ],
    }


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _validated_graph_url(url: str) -> str:
    """Allow only HTTPS Graph API URLs and strip credentials from pagination links."""
    parsed = urlsplit(url)
    try:
        port = parsed.port
    except ValueError as exc:
        raise FacebookConnectionError("Meta ส่ง pagination URL ที่ไม่ปลอดภัย") from exc
    if (
        parsed.scheme != "https"
        or parsed.hostname != GRAPH_HOST
        or parsed.username
        or parsed.password
        or port not in (None, 443)
    ):
        raise FacebookConnectionError("Meta ส่ง pagination URL ที่ไม่ปลอดภัย")
    clean_query = urlencode(
        [
            (key, value)
            for key, value in parse_qsl(parsed.query, keep_blank_values=True)
            if key.lower() not in SENSITIVE_QUERY_KEYS
        ]
    )
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, clean_query, ""))
