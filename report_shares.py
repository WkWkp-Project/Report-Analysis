"""Read-only, expiring report snapshots addressed by hashed capability tokens."""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import tempfile
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4


TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,120}$")


class ReportShareError(ValueError):
    pass


class ReportShareStore:
    def __init__(self, data_dir: Path | None = None):
        root = data_dir or Path(os.getenv("APP_DATA_DIR", "./data"))
        self.root = root / "report_shares"
        self._lock = threading.RLock()

    def create(self, payload: dict, expires_days: int) -> dict:
        token = secrets.token_urlsafe(32)
        token_hash = _hash(token)
        now = datetime.now(UTC)
        record = {
            "schema_version": 1,
            "id": f"shr_{uuid4().hex[:16]}",
            "token_hash": token_hash,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=expires_days)).isoformat(),
            "revoked_at": None,
            "payload": payload,
        }
        with self._lock:
            self._write(token_hash, record)
        return {"id": record["id"], "token": token, "expires_at": record["expires_at"]}

    def get(self, token: str) -> dict:
        if not TOKEN_PATTERN.fullmatch(token):
            raise ReportShareError("ลิงก์รายงานไม่ถูกต้อง")
        token_hash = _hash(token)
        with self._lock:
            record = self._read(token_hash)
        if record.get("token_hash") != token_hash or record.get("revoked_at"):
            raise ReportShareError("ลิงก์รายงานถูกยกเลิกแล้ว")
        try:
            expires_at = datetime.fromisoformat(record["expires_at"])
        except (KeyError, ValueError) as exc:
            raise ReportShareError("ข้อมูลลิงก์รายงานไม่ถูกต้อง") from exc
        if expires_at < datetime.now(UTC):
            raise ReportShareError("ลิงก์รายงานหมดอายุแล้ว")
        return record

    def _path(self, token_hash: str) -> Path:
        return self.root / f"{token_hash}.json"

    def _read(self, token_hash: str) -> dict:
        path = self._path(token_hash)
        if not path.exists():
            raise ReportShareError("ไม่พบลิงก์รายงาน")
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ReportShareError("อ่าน snapshot รายงานไม่สำเร็จ") from exc

    def _write(self, token_hash: str, record: dict) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(prefix="share-", suffix=".tmp", dir=self.root)
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(record, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, self._path(token_hash))
        finally:
            if temporary_path.exists():
                temporary_path.unlink()


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
