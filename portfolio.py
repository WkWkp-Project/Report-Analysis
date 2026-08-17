"""File-backed portfolio registry for one trusted workspace and many reporting scopes."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PortfolioError(ValueError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class WorkspaceProfile(StrictModel):
    id: str = "workspace_default"
    name: str = Field(default="Primary workspace", min_length=1, max_length=120)


class Brand(StrictModel):
    id: str
    name: str = Field(min_length=1, max_length=120)
    code: str | None = Field(default=None, min_length=1, max_length=40)
    created_at: str


class Project(StrictModel):
    id: str
    name: str = Field(min_length=1, max_length=160)
    brand_ids: list[str] = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=1000)
    reporting_mode: Literal["monthly", "campaign", "continuous"] = "monthly"
    status: Literal["active", "archived"] = "active"
    created_at: str


class CampaignBinding(StrictModel):
    id: str
    project_id: str
    source: Literal["facebook", "file"]
    source_account_id: str = Field(min_length=1, max_length=128)
    source_campaign_id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=200)
    brand_ids: list[str] = Field(min_length=1, max_length=50)
    created_at: str


class ReportPeriod(StrictModel):
    id: str
    project_id: str
    label: str = Field(min_length=1, max_length=120)
    date_from: date
    date_to: date
    cadence: Literal["monthly", "custom"] = "monthly"
    status: Literal["draft", "ready", "archived"] = "draft"
    created_at: str


class PortfolioSnapshot(StrictModel):
    schema_version: int = 2
    workspace: WorkspaceProfile = Field(default_factory=WorkspaceProfile)
    brands: list[Brand] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    periods: list[ReportPeriod] = Field(default_factory=list)
    campaigns: list[CampaignBinding] = Field(default_factory=list)
    updated_at: str | None = None


class WorkspaceUpdate(StrictModel):
    name: str = Field(min_length=1, max_length=120)


class BrandCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    code: str | None = Field(default=None, min_length=1, max_length=40)


class ProjectCreate(StrictModel):
    name: str = Field(min_length=1, max_length=160)
    brand_ids: list[str] = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=1000)
    reporting_mode: Literal["monthly", "campaign", "continuous"] = "monthly"

    @field_validator("brand_ids")
    @classmethod
    def unique_brand_ids(cls, value: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(item.strip() for item in value if item.strip()))
        if not normalized:
            raise ValueError("select at least one brand")
        return normalized


class CampaignCreate(StrictModel):
    project_id: str = Field(min_length=1, max_length=80)
    source: Literal["facebook", "file"]
    source_account_id: str = Field(min_length=1, max_length=128)
    source_campaign_id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=200)
    brand_ids: list[str] = Field(min_length=1, max_length=50)

    @field_validator("brand_ids")
    @classmethod
    def unique_brand_ids(cls, value: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(item.strip() for item in value if item.strip()))
        if not normalized:
            raise ValueError("select at least one brand")
        return normalized


class ReportPeriodCreate(StrictModel):
    project_id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=120)
    date_from: date
    date_to: date
    cadence: Literal["monthly", "custom"] = "monthly"

    @field_validator("date_to")
    @classmethod
    def valid_date_range(cls, value: date, info):
        date_from = info.data.get("date_from")
        if date_from and value < date_from:
            raise ValueError("date_to must be on or after date_from")
        return value


class PortfolioStore:
    def __init__(self, data_dir: Path | None = None):
        root = data_dir or Path(os.getenv("APP_DATA_DIR", "./data"))
        self.path = root / "portfolio" / "catalog.json"
        self._lock = threading.RLock()

    def snapshot(self) -> PortfolioSnapshot:
        with self._lock:
            return self._load()

    def update_workspace(self, payload: WorkspaceUpdate) -> PortfolioSnapshot:
        with self._lock:
            snapshot = self._load()
            snapshot.workspace.name = payload.name
            return self._save(snapshot)

    def create_brand(self, payload: BrandCreate) -> PortfolioSnapshot:
        with self._lock:
            snapshot = self._load()
            name_key = payload.name.casefold()
            code_key = payload.code.casefold() if payload.code else None
            if any(brand.name.casefold() == name_key for brand in snapshot.brands):
                raise PortfolioError("มีแบรนด์ชื่อนี้อยู่แล้ว")
            if code_key and any(
                brand.code and brand.code.casefold() == code_key for brand in snapshot.brands
            ):
                raise PortfolioError("มีรหัสแบรนด์นี้อยู่แล้ว")
            snapshot.brands.append(
                Brand(
                    id=_new_id("brd"),
                    name=payload.name,
                    code=payload.code,
                    created_at=_now(),
                )
            )
            return self._save(snapshot)

    def create_project(self, payload: ProjectCreate) -> PortfolioSnapshot:
        with self._lock:
            snapshot = self._load()
            known_brands = {brand.id for brand in snapshot.brands}
            missing = sorted(set(payload.brand_ids) - known_brands)
            if missing:
                raise PortfolioError("โปรเจกต์อ้างถึงแบรนด์ที่ไม่มีอยู่")
            if any(project.name.casefold() == payload.name.casefold() for project in snapshot.projects):
                raise PortfolioError("มีโปรเจกต์ชื่อนี้อยู่แล้ว")
            snapshot.projects.append(
                Project(
                    id=_new_id("prj"),
                    name=payload.name,
                    brand_ids=payload.brand_ids,
                    description=payload.description,
                    reporting_mode=payload.reporting_mode,
                    created_at=_now(),
                )
            )
            return self._save(snapshot)

    def create_period(self, payload: ReportPeriodCreate) -> PortfolioSnapshot:
        with self._lock:
            snapshot = self._load()
            if not any(project.id == payload.project_id for project in snapshot.projects):
                raise PortfolioError("ไม่พบโปรเจกต์ที่เลือก")
            duplicate = any(
                period.project_id == payload.project_id
                and (
                    period.label.casefold() == payload.label.casefold()
                    or (
                        period.date_from == payload.date_from
                        and period.date_to == payload.date_to
                    )
                )
                for period in snapshot.periods
            )
            if duplicate:
                raise PortfolioError("มีรอบรายงานนี้ในโปรเจกต์แล้ว")
            snapshot.periods.append(
                ReportPeriod(
                    id=_new_id("rpd"),
                    project_id=payload.project_id,
                    label=payload.label,
                    date_from=payload.date_from,
                    date_to=payload.date_to,
                    cadence=payload.cadence,
                    created_at=_now(),
                )
            )
            return self._save(snapshot)

    def create_campaign(self, payload: CampaignCreate) -> PortfolioSnapshot:
        with self._lock:
            snapshot = self._load()
            project = next(
                (item for item in snapshot.projects if item.id == payload.project_id), None
            )
            if project is None:
                raise PortfolioError("ไม่พบโปรเจกต์ที่เลือก")
            if not set(payload.brand_ids).issubset(set(project.brand_ids)):
                raise PortfolioError("แคมเปญเลือกได้เฉพาะแบรนด์ที่อยู่ในโปรเจกต์")
            duplicate = any(
                campaign.source == payload.source
                and campaign.source_account_id == payload.source_account_id
                and campaign.source_campaign_id == payload.source_campaign_id
                for campaign in snapshot.campaigns
            )
            if duplicate:
                raise PortfolioError("แคมเปญจากบัญชีนี้ถูกผูกไว้แล้ว")
            snapshot.campaigns.append(
                CampaignBinding(
                    id=_new_id("cmp"),
                    project_id=payload.project_id,
                    source=payload.source,
                    source_account_id=payload.source_account_id,
                    source_campaign_id=payload.source_campaign_id,
                    name=payload.name,
                    brand_ids=payload.brand_ids,
                    created_at=_now(),
                )
            )
            return self._save(snapshot)

    def _load(self) -> PortfolioSnapshot:
        if not self.path.exists():
            return PortfolioSnapshot()
        try:
            snapshot = PortfolioSnapshot.model_validate_json(
                self.path.read_text(encoding="utf-8")
            )
            snapshot.schema_version = 2
            return snapshot
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            raise PortfolioError("อ่าน portfolio registry ไม่สำเร็จ") from exc

    def _save(self, snapshot: PortfolioSnapshot) -> PortfolioSnapshot:
        snapshot.updated_at = _now()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix="catalog-", suffix=".tmp", dir=self.path.parent
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(snapshot.model_dump_json(indent=2))
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, self.path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()
        return snapshot.model_copy(deep=True)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def _now() -> str:
    return datetime.now(UTC).isoformat()
