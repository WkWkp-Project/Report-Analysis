"""Persistent campaign metric overrides and safe arithmetic custom metrics."""

from __future__ import annotations

import ast
import json
import math
import os
import re
import tempfile
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


EDITABLE_METRICS = {
    "impressions", "reach", "engagement", "link_clicks",
    "spend", "purchases", "revenue",
}
FORMULA_FIELDS = EDITABLE_METRICS | {
    "frequency", "er", "ctr", "cpm", "cpe", "roas", "roi",
}
KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,39}$")


class MetricWorkspaceError(ValueError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MetricOverrideUpsert(StrictModel):
    period_id: str = Field(min_length=1, max_length=80)
    campaign_id: str = Field(min_length=1, max_length=80)
    values: dict[str, float | None] = Field(min_length=1, max_length=len(EDITABLE_METRICS))
    reason: str = Field(min_length=3, max_length=500)
    acknowledge_warnings: bool = False

    @field_validator("values")
    @classmethod
    def validate_values(cls, value):
        unknown = set(value) - EDITABLE_METRICS
        if unknown:
            raise ValueError(f"metrics are not editable: {', '.join(sorted(unknown))}")
        for metric, number in value.items():
            if number is not None and (not math.isfinite(number) or abs(number) > 1_000_000_000_000_000):
                raise ValueError(f"invalid value for {metric}")
            if number is not None and number < 0:
                raise ValueError(f"{metric} cannot be negative")
        return value


class CustomMetricCreate(StrictModel):
    key: str = Field(min_length=2, max_length=40)
    label: str = Field(min_length=1, max_length=80)
    formula: str = Field(min_length=1, max_length=200)
    unit: Literal["number", "currency", "percent", "ratio"] = "number"
    decimals: int = Field(default=2, ge=0, le=4)

    @field_validator("key")
    @classmethod
    def valid_key(cls, value):
        if not KEY_PATTERN.fullmatch(value):
            raise ValueError("key must use lowercase letters, numbers, and underscore")
        if value in FORMULA_FIELDS:
            raise ValueError("key conflicts with a built-in metric")
        return value

    @field_validator("formula")
    @classmethod
    def valid_formula(cls, value):
        validate_formula(value)
        return value


class MetricWorkspaceStore:
    def __init__(self, data_dir: Path | None = None):
        root = data_dir or Path(os.getenv("APP_DATA_DIR", "./data"))
        self.path = root / "metrics" / "workspace.json"
        self._lock = threading.RLock()

    def upsert_override(self, project_id: str, payload: MetricOverrideUpsert, base_values: dict | None = None) -> dict:
        with self._lock:
            data = self._load()
            key = f"{project_id}:{payload.period_id}:{payload.campaign_id}"
            current = data["overrides"].get(key, {})
            current_values = {**current.get("values", {}), **payload.values}
            candidate = {**(base_values or {}), **current_values}
            errors, warnings = validate_metric_consistency(candidate, base_values or {}, set(payload.values))
            if errors:
                raise MetricWorkspaceError("; ".join(errors))
            if warnings and not payload.acknowledge_warnings:
                raise MetricWorkspaceError("ต้องยืนยันคำเตือนก่อนบันทึก: " + "; ".join(warnings))
            data["overrides"][key] = {
                "project_id": project_id,
                "period_id": payload.period_id,
                "campaign_id": payload.campaign_id,
                "values": current_values,
                "reason": payload.reason,
                "validation_warnings": warnings,
                "updated_at": _now(),
            }
            self._save(data)
            return data["overrides"][key]

    def create_custom_metric(self, project_id: str, payload: CustomMetricCreate) -> dict:
        with self._lock:
            data = self._load()
            definitions = data["custom_metrics"].setdefault(project_id, [])
            if any(item["key"] == payload.key for item in definitions):
                raise MetricWorkspaceError("มี metric key นี้แล้ว")
            definition = {
                "id": f"met_{uuid4().hex[:16]}",
                **payload.model_dump(),
                "created_at": _now(),
            }
            definitions.append(definition)
            self._save(data)
            return definition

    def apply(self, project_id: str, period_id: str, rows: list[dict]) -> tuple[list[dict], list[dict]]:
        with self._lock:
            data = self._load()
        definitions = data["custom_metrics"].get(project_id, [])
        output = []
        for original in rows:
            row = dict(original)
            override = data["overrides"].get(f"{project_id}:{period_id}:{row['campaign_id']}")
            manual_fields = []
            if override:
                row.update(override["values"])
                manual_fields = sorted(override["values"])
                row["override_reason"] = override["reason"]
                row["override_updated_at"] = override["updated_at"]
            row.update(calculate_derived(row))
            row["manual_fields"] = manual_fields
            row["custom_metrics"] = {
                item["key"]: evaluate_formula(item["formula"], row, item["decimals"])
                for item in definitions
            }
            output.append(row)
        return output, definitions

    def _load(self) -> dict:
        if not self.path.exists():
            return {"schema_version": 1, "overrides": {}, "custom_metrics": {}}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if data.get("schema_version") != 1:
                raise ValueError("unsupported schema")
            return data
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            raise MetricWorkspaceError("อ่าน metric workspace ไม่สำเร็จ") from exc

    def _save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(prefix="metrics-", suffix=".tmp", dir=self.path.parent)
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, self.path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()


def calculate_derived(row: dict) -> dict:
    impressions = _number(row.get("impressions"))
    reach = _number(row.get("reach"))
    engagement = _number(row.get("engagement"))
    clicks = _number(row.get("link_clicks"))
    spend = _number(row.get("spend"))
    revenue = _number(row.get("revenue"))
    return {
        "frequency": _ratio(impressions, reach),
        "er": _percent(engagement, reach),
        "ctr": _percent(clicks, impressions),
        "cpm": round(spend / impressions * 1000, 2) if spend is not None and impressions else None,
        "cpe": _ratio(spend, engagement),
        "roas": _ratio(revenue, spend),
        "roi": round((revenue - spend) / spend * 100, 2) if revenue is not None and spend else None,
    }


def validate_metric_consistency(candidate: dict, previous: dict | None = None, changed: set[str] | None = None) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    changed = changed or set(EDITABLE_METRICS)
    count_metrics = {"reach", "impressions", "engagement", "link_clicks", "purchases"}
    for key in changed:
        value = _number(candidate.get(key))
        if value is not None and value < 0:
            errors.append(f"{key} ต้องไม่ติดลบ")
        if key in count_metrics and value is not None and not value.is_integer():
            errors.append(f"{key} ต้องเป็นจำนวนเต็ม")
    impressions, reach = _number(candidate.get("impressions")), _number(candidate.get("reach"))
    engagement, clicks = _number(candidate.get("engagement")), _number(candidate.get("link_clicks"))
    purchases, revenue = _number(candidate.get("purchases")), _number(candidate.get("revenue"))
    if impressions is not None and reach is not None and reach > impressions:
        errors.append("Reach ต้องไม่มากกว่า Impressions")
    if impressions is not None and clicks is not None and clicks > impressions:
        errors.append("Link clicks ต้องไม่มากกว่า Impressions")
    if engagement is not None and reach is not None and engagement > reach:
        warnings.append("Engagement สูงกว่า Reach")
    if purchases and not revenue:
        warnings.append("มี Purchases แต่ Revenue เป็นศูนย์หรือไม่มีข้อมูล")
    if revenue and not purchases:
        warnings.append("มี Revenue แต่ Purchases เป็นศูนย์หรือไม่มีข้อมูล")
    for key in changed:
        before = _number((previous or {}).get(key)); after = _number(candidate.get(key))
        if before and after is not None and (after >= before * 1.5 or after <= before * 0.5):
            warnings.append(f"{key} เปลี่ยนตั้งแต่ 50%")
    return list(dict.fromkeys(errors)), list(dict.fromkeys(warnings))


def validate_formula(formula: str) -> None:
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError as exc:
        raise ValueError("formula syntax is invalid") from exc
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id not in FORMULA_FIELDS:
            raise ValueError(f"unknown metric: {node.id}")
        if not isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Name, ast.Load, ast.Constant, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.USub, ast.UAdd)):
            raise ValueError("formula supports only metric names and + - * / %")
        if isinstance(node, ast.Constant) and (not isinstance(node.value, (int, float)) or abs(node.value) > 1_000_000_000):
            raise ValueError("formula constant is invalid")


def evaluate_formula(formula: str, row: dict, decimals: int = 2) -> float | None:
    validate_formula(formula)
    values = {key: _number(row.get(key)) for key in FORMULA_FIELDS}
    if any(values.get(node.id) is None for node in ast.walk(ast.parse(formula, mode="eval")) if isinstance(node, ast.Name)):
        return None
    try:
        result = _eval_node(ast.parse(formula, mode="eval").body, values)
        return round(result, decimals) if math.isfinite(result) else None
    except (ZeroDivisionError, OverflowError):
        return None


def _eval_node(node, values):
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        return values[node.id]
    if isinstance(node, ast.UnaryOp):
        value = _eval_node(node.operand, values)
        return -value if isinstance(node.op, ast.USub) else value
    left, right = _eval_node(node.left, values), _eval_node(node.right, values)
    operations = {ast.Add: lambda: left + right, ast.Sub: lambda: left - right, ast.Mult: lambda: left * right, ast.Div: lambda: left / right, ast.Mod: lambda: left % right}
    return operations[type(node.op)]()


def _number(value):
    return float(value) if value is not None else None


def _ratio(numerator, denominator):
    return round(numerator / denominator, 2) if numerator is not None and denominator else None


def _percent(numerator, denominator):
    return round(numerator / denominator * 100, 2) if numerator is not None and denominator else None


def _now():
    return datetime.now(UTC).isoformat()
