import unittest

from serializer import _overview


class OverviewFunnelTests(unittest.TestCase):
    def test_aggregates_funnel_and_business_metrics(self):
        posts = [
            {
                "impressions": 1500,
                "reach": 1000,
                "reach_organic": 400,
                "reach_paid": 600,
                "engaged_users": 100,
                "link_clicks": 30,
                "ad_spend": 1000,
                "ad_purchases": 10,
                "ad_revenue": 4000,
                "ad_roas": 4,
            },
            {
                "impressions": 500,
                "reach": 500,
                "reach_organic": 500,
                "reach_paid": 0,
                "engaged_users": 25,
                "link_clicks": 10,
            },
        ]

        result = _overview(posts, {"ER": 4.2})

        self.assertEqual(result["impressions_total"], 2000)
        self.assertEqual(result["reach_total"], 1500)
        self.assertEqual(result["engagement_total"], 125)
        self.assertEqual(result["link_ctr"], 2.0)
        self.assertEqual(result["purchases"], 10)
        self.assertEqual(result["revenue"], 4000)
        self.assertEqual(result["conversion_spend"], 1000)
        self.assertEqual(result["roas"], 4.0)
        self.assertEqual(result["roi"], 300.0)
        self.assertEqual(result["revenue_source"], "meta_action_values")

    def test_derives_revenue_from_roas_when_conversion_value_is_absent(self):
        result = _overview(
            [{"reach": 100, "impressions": 120, "ad_spend": 500, "ad_roas": 3}],
            {},
        )

        self.assertEqual(result["revenue"], 1500)
        self.assertEqual(result["revenue_source"], "calculated_from_roas")
        self.assertEqual(result["roi"], 200.0)


if __name__ == "__main__":
    unittest.main()
