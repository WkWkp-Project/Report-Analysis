import tempfile
import unittest
from pathlib import Path

from report_elements import (
    ReportElementCreate,
    ReportElementError,
    ReportElementStore,
    ReportElementUpdate,
)


PROJECT_ID = "prj_1234567890abcdef"


class ReportElementStoreTests(unittest.TestCase):
    def test_create_update_and_list_project_scoped_elements(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ReportElementStore(Path(directory))
            created = store.create(
                PROJECT_ID,
                ReportElementCreate(
                    kind="key_takeaway",
                    title="Key signal",
                    content="Creative A produced the strongest qualified reach.",
                    position=2,
                ),
            )
            updated = store.update(
                PROJECT_ID,
                created.id,
                ReportElementUpdate(
                    expected_version=1,
                    content="Creative A produced the strongest qualified reach this month.",
                ),
            )
            self.assertEqual(updated.version, 2)
            self.assertEqual(store.list(PROJECT_ID)[0].content, updated.content)

    def test_stale_update_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ReportElementStore(Path(directory))
            created = store.create(
                PROJECT_ID,
                ReportElementCreate(kind="comment", content="First draft"),
            )
            store.update(
                PROJECT_ID,
                created.id,
                ReportElementUpdate(expected_version=1, content="Second draft"),
            )
            with self.assertRaises(ReportElementError):
                store.update(
                    PROJECT_ID,
                    created.id,
                    ReportElementUpdate(expected_version=1, content="Stale draft"),
                )

    def test_project_id_cannot_escape_storage_root(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ReportElementStore(Path(directory))
            with self.assertRaises(ReportElementError):
                store.list("../../outside")

    def test_report_key_filters_elements(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ReportElementStore(Path(directory))
            store.create(
                PROJECT_ID,
                ReportElementCreate(report_key="jan-2026", kind="text", content="January"),
            )
            store.create(
                PROJECT_ID,
                ReportElementCreate(report_key="feb-2026", kind="text", content="February"),
            )
            self.assertEqual(len(store.list(PROJECT_ID, "jan-2026")), 1)


if __name__ == "__main__":
    unittest.main()
