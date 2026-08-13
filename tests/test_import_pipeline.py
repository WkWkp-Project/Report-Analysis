import unittest
from datetime import date

from pydantic import ValidationError

from import_pipeline import (
    BrandAssignmentRule,
    ColumnMapping,
    ImportManifest,
    ImportScope,
    ImportStage,
    SourceKind,
    validate_manifest,
    validate_transition,
)
from import_pipeline.models import AssignmentLevel
from import_pipeline.registry import Aggregation, DataType, FieldRole


class ImportPipelineTests(unittest.TestCase):
    def _manifest(self):
        return ImportManifest(
            name="May Meta report",
            source_kind=SourceKind.EXCEL,
            source_name="meta-may.xlsx",
            scope=ImportScope(
                date_from=date(2026, 5, 1),
                date_to=date(2026, 5, 31),
                account_ids=["act_1"],
                campaign_ids=["cmp_1", "cmp_2"],
            ),
            mappings=[
                ColumnMapping(source_column="Day", target_field="date", role=FieldRole.DIMENSION, data_type=DataType.DATE),
                ColumnMapping(source_column="Account", target_field="source_account_id", role=FieldRole.DIMENSION, data_type=DataType.STRING),
                ColumnMapping(source_column="Campaign ID", target_field="campaign_id", role=FieldRole.DIMENSION, data_type=DataType.STRING),
                ColumnMapping(source_column="Spend", target_field="spend", role=FieldRole.METRIC, data_type=DataType.CURRENCY, aggregation=Aggregation.SUM),
            ],
            brand_rules=[
                BrandAssignmentRule(level=AssignmentLevel.CAMPAIGN, match_value="cmp_1", brand_id="brand_a"),
                BrandAssignmentRule(level=AssignmentLevel.AD, match_value="ad_mixed_brand_b", brand_id="brand_b", priority=10),
            ],
            granularity=["date", "source_account_id", "campaign_id"],
            join_keys=["date", "campaign_id"],
        )

    def test_valid_manifest_passes_mapping_gate(self):
        manifest = self._manifest()
        result = validate_manifest(manifest, ["Day", "Account", "Campaign ID", "Spend"])
        self.assertTrue(result.passed)
        self.assertEqual(result.next_stage, ImportStage.VALIDATED)

    def test_missing_brand_assignment_blocks_validation(self):
        manifest = self._manifest().model_copy(update={"brand_rules": []})
        result = validate_manifest(manifest, ["Day", "Account", "Campaign ID", "Spend"])
        self.assertFalse(result.passed)
        self.assertIn("missing_brand_assignment", {issue.code for issue in result.errors})

    def test_unsafe_join_key_blocks_validation(self):
        manifest = self._manifest().model_copy(update={"join_keys": ["ad_id"]})
        result = validate_manifest(manifest, ["Day", "Account", "Campaign ID", "Spend"])
        self.assertFalse(result.passed)
        self.assertIn("unsafe_join_key", {issue.code for issue in result.errors})

    def test_scope_requires_campaign_choice(self):
        with self.assertRaises(ValidationError):
            ImportScope(
                date_from=date(2026, 5, 1),
                date_to=date(2026, 5, 31),
                account_ids=["act_1"],
            )

    def test_stage_cannot_skip_validation(self):
        result = validate_transition(ImportStage.MAPPED, ImportStage.ANALYSIS_READY)
        self.assertFalse(result.passed)
        self.assertEqual(result.errors[0].code, "invalid_stage_transition")


if __name__ == "__main__":
    unittest.main()
