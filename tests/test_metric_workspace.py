import tempfile
import unittest
from pathlib import Path

from metric_workspace import (
    CustomMetricCreate,
    MetricOverrideUpsert,
    MetricWorkspaceStore,
    evaluate_formula,
    MetricWorkspaceError,
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

    def test_override_blocks_impossible_relationship_and_requires_warning_ack(self):
        with tempfile.TemporaryDirectory() as directory:
            store = MetricWorkspaceStore(Path(directory))
            base = {"impressions": 1000, "reach": 800, "engagement": 100, "link_clicks": 40, "purchases": 4, "revenue": 400}
            with self.assertRaisesRegex(MetricWorkspaceError, "Reach"):
                store.upsert_override("prj_aaaaaaaaaaaaaaaa", MetricOverrideUpsert(period_id="rpd_period", campaign_id="cmp_campaign", values={"reach": 1200}, reason="source correction"), base)
            with self.assertRaisesRegex(ValueError, "cannot be negative"):
                MetricOverrideUpsert(period_id="rpd_period", campaign_id="cmp_campaign", values={"spend": -1}, reason="source correction")
            with self.assertRaisesRegex(MetricWorkspaceError, "จำนวนเต็ม"):
                store.upsert_override("prj_aaaaaaaaaaaaaaaa", MetricOverrideUpsert(period_id="rpd_period", campaign_id="cmp_campaign", values={"purchases": 4.5}, reason="source correction"), base)
            with self.assertRaisesRegex(MetricWorkspaceError, "ยืนยันคำเตือน"):
                store.upsert_override("prj_aaaaaaaaaaaaaaaa", MetricOverrideUpsert(period_id="rpd_period", campaign_id="cmp_campaign", values={"revenue": 2000}, reason="source correction"), base)
            saved = store.upsert_override("prj_aaaaaaaaaaaaaaaa", MetricOverrideUpsert(period_id="rpd_period", campaign_id="cmp_campaign", values={"revenue": 2000}, reason="verified against CRM", acknowledge_warnings=True), base)
            self.assertTrue(saved["validation_warnings"])


if __name__ == "__main__":
    unittest.main()
