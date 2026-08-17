import tempfile
import unittest
from pathlib import Path

from report_library import ReportCreate, ReportLibraryStore, ReportUpdate


class ReportLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = ReportLibraryStore(Path(self.temp.name))

    def tearDown(self):
        self.temp.cleanup()

    def test_brand_period_report_does_not_require_project(self):
        report = self.store.create(ReportCreate(brand_id="brd_1", name="August", date_from="2026-08-01", date_to="2026-08-31"))
        self.assertEqual(report["status"], "draft")
        self.assertIsNone(report["project_id"])
        self.assertEqual(self.store.list({"brd_1"})["reports"][0]["id"], report["id"])

    def test_publish_keeps_immutable_revision_history(self):
        report = self.store.create(ReportCreate(brand_id="brd_1", name="Monthly", date_from="2026-07-01", date_to="2026-07-31"))
        first = self.store.publish(report["id"], {"overview": {"reach_total": 100}}, "approved")
        self.store.update(report["id"], ReportUpdate(name="Monthly revised"))
        second = self.store.publish(report["id"], {"overview": {"reach_total": 120}}, "correction")
        detail = self.store.get(report["id"])
        self.assertEqual(first["revision"]["version"], 1)
        self.assertEqual(second["revision"]["version"], 2)
        self.assertEqual(detail["revisions"][1]["snapshot"]["overview"]["reach_total"], 100)
        self.assertEqual(detail["report"]["current_revision"], 2)

    def test_archive_is_soft_delete(self):
        report = self.store.create(ReportCreate(brand_id="brd_1", name="Old", date_from="2026-01-01", date_to="2026-01-31"))
        self.store.archive(report["id"])
        self.assertEqual(self.store.list({"brd_1"})["reports"], [])
        self.assertEqual(self.store.list({"brd_1"}, include_archived=True)["reports"][0]["status"], "archived")


if __name__ == "__main__":
    unittest.main()
