"""Contracts and validation gates for trusted marketing-data imports."""

from .models import (
    BrandAssignmentRule,
    ColumnMapping,
    ImportManifest,
    ImportScope,
    ImportStage,
    SourceKind,
)
from .validation import GateResult, validate_manifest, validate_transition

__all__ = [
    "BrandAssignmentRule",
    "ColumnMapping",
    "GateResult",
    "ImportManifest",
    "ImportScope",
    "ImportStage",
    "SourceKind",
    "validate_manifest",
    "validate_transition",
]
