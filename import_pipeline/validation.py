"""Quality gates that prevent untrusted data from reaching analysis or AI."""

from dataclasses import dataclass, field

from .models import ImportManifest, ImportStage
from .registry import DIMENSIONS, FIELDS, METRICS, FieldRole


STAGE_TRANSITIONS = {
    ImportStage.DRAFT: {ImportStage.SCOPED},
    ImportStage.SCOPED: {ImportStage.MAPPED},
    ImportStage.MAPPED: {ImportStage.VALIDATED},
    ImportStage.VALIDATED: {ImportStage.MEDIA_ENRICHED, ImportStage.CONFIRMED},
    ImportStage.MEDIA_ENRICHED: {ImportStage.CONFIRMED},
    ImportStage.CONFIRMED: {ImportStage.ANALYSIS_READY},
    ImportStage.ANALYSIS_READY: {ImportStage.ANALYZED},
    ImportStage.ANALYZED: set(),
}


@dataclass
class GateIssue:
    code: str
    message: str
    field: str | None = None


@dataclass
class GateResult:
    passed: bool
    errors: list[GateIssue] = field(default_factory=list)
    warnings: list[GateIssue] = field(default_factory=list)
    next_stage: ImportStage | None = None


def validate_transition(current: ImportStage, requested: ImportStage) -> GateResult:
    allowed = STAGE_TRANSITIONS[current]
    if requested not in allowed:
        return GateResult(
            passed=False,
            errors=[GateIssue("invalid_stage_transition", f"cannot move from {current.value} to {requested.value}", "stage")],
        )
    return GateResult(passed=True, next_stage=requested)


def validate_manifest(manifest: ImportManifest, source_headers: list[str]) -> GateResult:
    errors: list[GateIssue] = []
    warnings: list[GateIssue] = []
    header_set = set(source_headers)
    target_fields = {mapping.target_field for mapping in manifest.mappings}

    for mapping in manifest.mappings:
        if mapping.source_column not in header_set:
            errors.append(GateIssue("missing_source_column", f"source column '{mapping.source_column}' was not found", mapping.source_column))
            continue
        spec = FIELDS.get(mapping.target_field)
        if spec is None:
            errors.append(GateIssue("unknown_target_field", f"'{mapping.target_field}' is not in the canonical registry", mapping.target_field))
            continue
        if mapping.role != spec.role:
            errors.append(GateIssue("role_mismatch", f"'{mapping.target_field}' must be a {spec.role.value}", mapping.target_field))
        if mapping.data_type != spec.data_type:
            errors.append(GateIssue("type_mismatch", f"'{mapping.target_field}' must use {spec.data_type.value}", mapping.target_field))
        if spec.role == FieldRole.METRIC and mapping.aggregation != spec.aggregation:
            errors.append(GateIssue("aggregation_mismatch", f"'{mapping.target_field}' must aggregate as {spec.aggregation.value}", mapping.target_field))

    required_dimensions = {key for key, spec in DIMENSIONS.items() if spec.required_for_import}
    for missing in sorted(required_dimensions - target_fields):
        errors.append(GateIssue("missing_required_dimension", f"map the required dimension '{missing}'", missing))

    mapped_metrics = target_fields.intersection(METRICS)
    if not mapped_metrics:
        errors.append(GateIssue("missing_metric", "map at least one numeric metric", "mappings"))

    if not manifest.brand_rules and "brand_id" not in target_fields:
        errors.append(GateIssue("missing_brand_assignment", "map brand_id or define brand assignment rules", "brand_rules"))

    if not manifest.granularity:
        errors.append(GateIssue("missing_granularity", "declare the row granularity before validation", "granularity"))
    else:
        unknown_granularity = set(manifest.granularity) - target_fields
        for field_name in sorted(unknown_granularity):
            errors.append(GateIssue("unmapped_granularity", f"granularity field '{field_name}' is not mapped", "granularity"))

    if not manifest.join_keys:
        warnings.append(GateIssue("missing_join_keys", "this source cannot be blended until explicit join keys are chosen", "join_keys"))
    else:
        for key in manifest.join_keys:
            if key not in manifest.granularity:
                errors.append(GateIssue("unsafe_join_key", f"join key '{key}' must be part of the declared granularity", "join_keys"))

    non_aggregatable = {
        key for key in mapped_metrics if METRICS[key].aggregation and METRICS[key].aggregation.value == "non_aggregatable"
    }
    if non_aggregatable:
        warnings.append(GateIssue(
            "derived_metric_recalculation",
            "non-aggregatable metrics will be recalculated from base metrics when possible: " + ", ".join(sorted(non_aggregatable)),
            "mappings",
        ))

    return GateResult(
        passed=not errors,
        errors=errors,
        warnings=warnings,
        next_stage=ImportStage.VALIDATED if not errors else None,
    )
