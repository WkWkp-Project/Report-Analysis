import unittest
from datetime import date, datetime

from sample_data import sample_posts


class SampleDataPeriodTests(unittest.TestCase):
    def test_demo_posts_stay_inside_requested_period(self):
        since = date(2026, 8, 1)
        until = date(2026, 8, 7)
        posts = sample_posts(start_date=since, span_days=7)

        self.assertEqual(len(posts), 32)
        for post in posts:
            created = datetime.strptime(
                post["created_time"], "%Y-%m-%dT%H:%M:%S%z"
            ).date()
            self.assertGreaterEqual(created, since)
            self.assertLessEqual(created, until)


if __name__ == "__main__":
    unittest.main()
