import tempfile
import unittest
from pathlib import Path

from portfolio import PortfolioStore
from scripts.seed_demo_portfolio import seed


class SeedDemoPortfolioTests(unittest.TestCase):
    def test_seed_is_complete_and_does_not_overwrite_existing_data(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            self.assertTrue(seed(data_dir))
            snapshot = PortfolioStore(data_dir).snapshot()
            self.assertEqual(len(snapshot.brands), 3)
            self.assertEqual(len(snapshot.projects), 3)
            self.assertEqual(len(snapshot.periods), 5)
            self.assertEqual(len(snapshot.campaigns), 6)
            self.assertGreaterEqual(
                len({campaign.source_account_id for campaign in snapshot.campaigns}),
                4,
            )
            self.assertFalse(seed(data_dir))


if __name__ == "__main__":
    unittest.main()
