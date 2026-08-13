"""Pydantic contracts for a staged, auditable import session."""

from datetime import date, datetime, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator

from .registry import Aggregation, DataType, FieldRole


class SourceKind(str, Enum):
    FACEBOOK_API = "facebook_api"
    EXCEL = "excel"
    CSV = "csv"
    GOOGLE_SHEETS = "google_sheets"
    MANUAL = "manual"


class ImportStage(str, Enum):
    DRAFT = "draft"
    SCOPED = "scoped"
    MAPPED = "mapped"
    VALIDATED = "validated"
    MEDIA_ENRICHED = "media_enriched"
    CONFIRMED = "confirmed"
    ANALYSIS_READY = "analysis_ready"
    ANALYZED = "analyzed"


class AssignmentLevel(str, Enum):
    ACCOUNT = "account"
    CAMPAIGN = "campaign"
    ADSET = "adset"
    AD = "ad"
    CONTENT = "content"


class ImportScope(BaseModel):
    date_from: date
    date_to: date
    timezone: str = "Asia/Bangkok"
    account_ids: list[str] = Field(min_length=1)
    campaign_ids: list[str] = Field(default_factory=list)
    select_all_campaigns: bool = False

    @model_validator(mode="after")
    def validate_scope(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        if not self.select_all_campaigns and not self.campaign_ids:
            raise ValueError("select at least one campaign or enable select_all_campaigns")
        if self.select_all_campaigns and self.campaign_ids:
            raise ValueError("campaign_ids must be empty when select_all_campaigns is enabled")
        return self


class ColumnMapping(BaseModel):
    source_column: str = Field(min_length=1)
    target_field: str = Field(min_length=1)
    role: FieldRole
    data_type: DataType
    aggregation: Aggregation | None = None
    source_format: str | None = None


class BrandAssignmentRule(BaseModel):
    level: AssignmentLevel
    match_value: str = Field(min_length=1)
    brand_id: str = Field(min_length=1)
    priority: int = Field(default=100, ge=0)


class ImportManifest(BaseModel):
    import_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(min_length=1)
    source_kind: SourceKind
    source_name: str = Field(min_length=1)
    stage: ImportStage = ImportStage.DRAFT
    scope: ImportScope
    mappings: list[ColumnMapping] = Field(default_factory=list)
    brand_rules: list[BrandAssignmentRule] = Field(default_factory=list)
    granularity: list[str] = Field(default_factory=list)
    join_keys: list[str] = Field(default_factory=list)
    currency: str = "THB"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    schema_version: Literal[1] = 1

    @model_validator(mode="after")
    def validate_uniqueness(self):
        source_columns = [mapping.source_column for mapping in self.mappings]
        if len(source_columns) != len(set(source_columns)):
            raise ValueError("each source column may be mapped only once")
        target_fields = [mapping.target_field for mapping in self.mappings]
        if len(target_fields) != len(set(target_fields)):
            raise ValueError("each canonical target field may be mapped only once")
        return self
