"""Brand-first report catalog with immutable published revisions."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ReportLibraryError(ValueError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ReportCreate(StrictModel):
    brand_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    date_from: date
    date_to: date
    project_id: str | None = Field(default=None, max_length=80)
    campaign_ids: list[str] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def valid_scope(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        if self.campaign_ids and not self.project_id:
            raise ValueError("campaign scope requires project_id")
        self.campaign_ids = list(dict.fromkeys(self.campaign_ids))
        return self


class ReportUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    date_from: date | None = None
    date_to: date | None = None
    project_id: str | None = Field(default=None, max_length=80)
    campaign_ids: list[str] | None = Field(default=None, max_length=200)

    @field_validator("campaign_ids")
    @classmethod
    def unique_campaigns(cls, value):
        return None if value is None else list(dict.fromkeys(value))


class ReportPublish(StrictModel):
    note: str | None = Field(default=None, max_length=500)
    demo: bool = True


class ReportLibraryStore:
    def __init__(self, data_dir: Path | None = None):
        root = data_dir or Path(os.getenv("APP_DATA_DIR", "./data"))
        self.path = root / "reports" / "library.json"
        self._lock = threading.RLock()

    def list(self, brand_ids: set[str] | None = None, include_archived: bool = False) -> dict:
        with self._lock:
            data = self._load()
        reports = data["reports"]
        if brand_ids is not None:
            reports = [item for item in reports if item["brand_id"] in brand_ids]
        if not include_archived:
            reports = [item for item in reports if item["status"] != "archived"]
        return {"reports": sorted(reports, key=lambda item: item["updated_at"], reverse=True)}

    def get(self, report_id: str) -> dict:
        data = self._load()
        report = next((item for item in data["reports"] if item["id"] == report_id), None)
        if report is None:
            raise ReportLibraryError("ไม่พบรายงาน")
        revisions = [item for item in data["revisions"] if item["report_id"] == report_id]
        return {"report": report, "revisions": sorted(revisions, key=lambda item: item["version"], reverse=True)}

    def create(self, payload: ReportCreate) -> dict:
        with self._lock:
            data = self._load()
            now = _now()
            report = {
                "id": _id("rpt"), **payload.model_dump(mode="json"),
                "status": "draft", "current_revision": 0,
                "created_at": now, "updated_at": now, "published_at": None,
            }
            data["reports"].append(report)
            self._save(data)
            return report

    def update(self, report_id: str, payload: ReportUpdate) -> dict:
        with self._lock:
            data = self._load()
            report = _find(data, report_id)
            changes = payload.model_dump(exclude_unset=True, mode="json")
            candidate = {**report, **changes}
            if candidate["date_to"] < candidate["date_from"]:
                raise ReportLibraryError("ช่วงวันที่ไม่ถูกต้อง")
            if candidate.get("campaign_ids") and not candidate.get("project_id"):
                raise ReportLibraryError("Campaign ต้องอยู่ภายใต้ Project")
            report.update(changes)
            report["updated_at"] = _now()
            self._save(data)
            return report

    def publish(self, report_id: str, snapshot: dict, note: str | None = None) -> dict:
        with self._lock:
            data = self._load()
            report = _find(data, report_id)
            version = int(report["current_revision"]) + 1
            revision = {
                "id": _id("rev"), "report_id": report_id, "version": version,
                "note": note, "created_at": _now(), "snapshot": snapshot,
            }
            data["revisions"].append(revision)
            report.update(status="published", current_revision=version, published_at=revision["created_at"], updated_at=revision["created_at"])
            self._save(data)
            return {"report": report, "revision": revision}

    def archive(self, report_id: str) -> dict:
        with self._lock:
            data = self._load()
            report = _find(data, report_id)
            report.update(status="archived", updated_at=_now())
            self._save(data)
            return report

    def _load(self) -> dict:
        if not self.path.exists():
            return {"schema_version": 1, "reports": [], "revisions": []}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if data.get("schema_version") != 1:
                raise ValueError("unsupported schema")
            return data
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            raise ReportLibraryError("อ่านกล่องรายงานไม่สำเร็จ") from exc

    def _save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(prefix="reports-", suffix=".tmp", dir=self.path.parent)
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.flush(); os.fsync(handle.fileno())
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, self.path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()


def _find(data: dict, report_id: str) -> dict:
    report = next((item for item in data["reports"] if item["id"] == report_id), None)
    if report is None:
        raise ReportLibraryError("ไม่พบรายงาน")
    return report


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def _now() -> str:
    return datetime.now(UTC).isoformat()
