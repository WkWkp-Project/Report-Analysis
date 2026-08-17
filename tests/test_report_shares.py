import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

from report_shares import ReportShareError, ReportShareStore


class ReportShareStoreTests(unittest.TestCase):
    def test_token_is_not_stored_in_plaintext_and_snapshot_is_read_only_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = ReportShareStore(root)
            created = store.create({"read_only": True, "overview": {"reach": 10}}, 30)

            stored_text = next((root / "report_shares").glob("*.json")).read_text(encoding="utf-8")
            self.assertNotIn(created["token"], stored_text)
            record = store.get(created["token"])
            self.assertTrue(record["payload"]["read_only"])
            self.assertGreater(datetime.fromisoformat(created["expires_at"]), datetime.now(UTC))

    def test_unknown_token_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ReportShareError):
                ReportShareStore(Path(directory)).get("a" * 43)


if __name__ == "__main__":
    unittest.main()
