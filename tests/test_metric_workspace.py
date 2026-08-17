import tempfile
import unittest
from pathlib import Path

from metric_workspace import (
    CustomMetricCreate,
    MetricOverrideUpsert,
    MetricWorkspaceStore,
    evaluate_formula,
)


class MetricWorkspaceTests(unittest.TestCase):
    def test_manual_values_recalculate_derived_and_custom_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            store = MetricWorkspaceStore(Path(directory))
            store.create_custom_metric(
                "prj_aaaaaaaaaaaaaaaa",
                CustomMetricCreate(
                    key="cost_per_purchase",
                    label="Cost per purchase",
                    formula="spend / purchases",
                    unit="currency",
                ),
            )
            store.upsert_override(
                "prj_aaaaaaaaaaaaaaaa",
                MetricOverrideUpsert(
                    period_id="rpd_period",
                    campaign_id="cmp_campaign",
                    values={"spend": 600, "purchases": 12, "revenue": 2400},
                    reason="Checked against CRM",
                ),
            )
            rows, definitions = store.apply(
                "prj_aaaaaaaaaaaaaaaa",
                "rpd_period",
                [{"campaign_id": "cmp_campaign", "spend": 500, "purchases": 10, "revenue": 1500}],
            )

            self.assertEqual(rows[0]["roas"], 4.0)
            self.assertEqual(rows[0]["roi"], 300.0)
            self.assertEqual(rows[0]["custom_metrics"]["cost_per_purchase"], 50.0)
            self.assertEqual(rows[0]["manual_fields"], ["purchases", "revenue", "spend"])
            self.assertEqual(definitions[0]["unit"], "currency")

    def test_formula_rejects_code_and_handles_division_by_zero(self):
        with self.assertRaises(ValueError):
            evaluate_formula("__import__('os')", {})
        self.assertIsNone(evaluate_formula("revenue / spend", {"revenue": 10, "spend": 0}))


if __name__ == "__main__":
    unittest.main()
