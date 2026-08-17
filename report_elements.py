"""Project-scoped, plain-text report elements with optimistic concurrency."""

from __future__ import annotations

import os
import re
import tempfile
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


PROJECT_ID_PATTERN = re.compile(r"^prj_[a-f0-9]{16}$")
REPORT_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


class ReportElementError(ValueError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


ElementKind = Literal["text", "comment", "key_takeaway", "next_step"]
ElementStatus = Literal["open", "done"]


class ReportElement(StrictModel):
    id: str
    project_id: str
    report_key: str
    kind: ElementKind
    title: str | None = Field(default=None, max_length=160)
    content: str = Field(min_length=1, max_length=12000)
    status: ElementStatus = "open"
    position: int = Field(default=0, ge=0, le=10000)
    version: int = Field(default=1, ge=1)
    created_at: str
    updated_at: str


class ReportElementFile(StrictModel):
    schema_version: int = 1
    project_id: str
    elements: list[ReportElement] = Field(default_factory=list)


class ReportElementCreate(StrictModel):
    report_key: str = Field(default="working", min_length=1, max_length=80)
    kind: ElementKind
    title: str | None = Field(default=None, max_length=160)
    content: str = Field(min_length=1, max_length=12000)
    status: ElementStatus = "open"
    position: int = Field(default=0, ge=0, le=10000)

    @model_validator(mode="after")
    def validate_report_key(self):
        if not REPORT_KEY_PATTERN.fullmatch(self.report_key):
            raise ValueError("report_key accepts letters, numbers, underscore, and hyphen")
        return self


class ReportElementUpdate(StrictModel):
    expected_version: int = Field(ge=1)
    title: str | None = Field(default=None, max_length=160)
    content: str | None = Field(default=None, min_length=1, max_length=12000)
    status: ElementStatus | None = None
    position: int | None = Field(default=None, ge=0, le=10000)

    @model_validator(mode="after")
    def require_change(self):
        if all(
            value is None
            for value in (self.title, self.content, self.status, self.position)
        ):
            raise ValueError("provide at least one field to update")
        return self


class ReportElementStore:
    def __init__(self, data_dir: Path | None = None):
        root = data_dir or Path(os.getenv("APP_DATA_DIR", "./data"))
        self.root = root / "report_elements"
        self._lock = threading.RLock()

    def list(self, project_id: str, report_key: str = "working") -> list[ReportElement]:
        _validate_scope(project_id, report_key)
        with self._lock:
            snapshot = self._load(project_id)
            return sorted(
                [item.model_copy(deep=True) for item in snapshot.elements if item.report_key == report_key],
                key=lambda item: (item.position, item.created_at),
            )

    def create(self, project_id: str, payload: ReportElementCreate) -> ReportElement:
        _validate_scope(project_id, payload.report_key)
        with self._lock:
            snapshot = self._load(project_id)
            timestamp = _now()
            element = ReportElement(
                id=f"elm_{uuid4().hex[:16]}",
                project_id=project_id,
                report_key=payload.report_key,
                kind=payload.kind,
                title=payload.title,
                content=payload.content,
                status=payload.status,
                position=payload.position,
                created_at=timestamp,
                updated_at=timestamp,
            )
            snapshot.elements.append(element)
            self._save(snapshot)
            return element.model_copy(deep=True)

    def update(
        self, project_id: str, element_id: str, payload: ReportElementUpdate
    ) -> ReportElement:
        _validate_scope(project_id, "working")
        with self._lock:
            snapshot = self._load(project_id)
            element = next((item for item in snapshot.elements if item.id == element_id), None)
            if element is None:
                raise ReportElementError("ไม่พบ report element")
            if element.version != payload.expected_version:
                raise ReportElementError("ข้อมูลถูกแก้จากอีกหน้าจอ กรุณาโหลดใหม่")
            changes = payload.model_dump(exclude={"expected_version"}, exclude_none=True)
            for field, value in changes.items():
                setattr(element, field, value)
            element.version += 1
            element.updated_at = _now()
            self._save(snapshot)
            return element.model_copy(deep=True)

    def delete(self, project_id: str, element_id: str) -> bool:
        _validate_scope(project_id, "working")
        with self._lock:
            snapshot = self._load(project_id)
            remaining = [item for item in snapshot.elements if item.id != element_id]
            if len(remaining) == len(snapshot.elements):
                return False
            snapshot.elements = remaining
            self._save(snapshot)
            return True

    def _path(self, project_id: str) -> Path:
        return self.root / f"{project_id}.json"

    def _load(self, project_id: str) -> ReportElementFile:
        path = self._path(project_id)
        if not path.exists():
            return ReportElementFile(project_id=project_id)
        try:
            snapshot = ReportElementFile.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise ReportElementError("อ่าน report elements ไม่สำเร็จ") from exc
        if snapshot.project_id != project_id:
            raise ReportElementError("report element scope ไม่ถูกต้อง")
        return snapshot

    def _save(self, snapshot: ReportElementFile) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f"{snapshot.project_id}-", suffix=".tmp", dir=self.root
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(snapshot.model_dump_json(indent=2))
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, self._path(snapshot.project_id))
        finally:
            if temporary_path.exists():
                temporary_path.unlink()


def _validate_scope(project_id: str, report_key: str) -> None:
    if not PROJECT_ID_PATTERN.fullmatch(project_id):
        raise ReportElementError("project scope ไม่ถูกต้อง")
    if not REPORT_KEY_PATTERN.fullmatch(report_key):
        raise ReportElementError("report scope ไม่ถูกต้อง")


def _now() -> str:
    return datetime.now(UTC).isoformat()
