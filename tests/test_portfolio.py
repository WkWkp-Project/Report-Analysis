import tempfile
import unittest
from pathlib import Path

from portfolio import (
    BrandCreate,
    CampaignCreate,
    PortfolioError,
    PortfolioStore,
    ProjectCreate,
    WorkspaceUpdate,
)


class PortfolioStoreTests(unittest.TestCase):
    def test_workspace_brand_project_campaign_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            store = PortfolioStore(Path(directory))
            snapshot = store.update_workspace(WorkspaceUpdate(name="Agency workspace"))
            self.assertEqual(snapshot.workspace.name, "Agency workspace")

            snapshot = store.create_brand(BrandCreate(name="Brand A", code="A"))
            brand_id = snapshot.brands[0].id
            snapshot = store.create_project(
                ProjectCreate(name="Q3 Launch", brand_ids=[brand_id])
            )
            project_id = snapshot.projects[0].id
            snapshot = store.create_campaign(
                CampaignCreate(
                    project_id=project_id,
                    source="facebook",
                    source_account_id="act_123",
                    source_campaign_id="cmp_456",
                    name="Conversion launch",
                    brand_ids=[brand_id],
                )
            )

            restored = PortfolioStore(Path(directory)).snapshot()
            self.assertEqual(restored.workspace.name, "Agency workspace")
            self.assertEqual(restored.campaigns[0].name, "Conversion launch")
            self.assertEqual(restored.campaigns[0].project_id, project_id)

    def test_project_rejects_unknown_brand(self):
        with tempfile.TemporaryDirectory() as directory:
            store = PortfolioStore(Path(directory))
            with self.assertRaises(PortfolioError):
                store.create_project(ProjectCreate(name="Invalid", brand_ids=["brd_missing"]))

    def test_campaign_brand_must_belong_to_project(self):
        with tempfile.TemporaryDirectory() as directory:
            store = PortfolioStore(Path(directory))
            snapshot = store.create_brand(BrandCreate(name="Brand A"))
            brand_a = snapshot.brands[0].id
            snapshot = store.create_brand(BrandCreate(name="Brand B"))
            brand_b = snapshot.brands[1].id
            snapshot = store.create_project(
                ProjectCreate(name="Single brand project", brand_ids=[brand_a])
            )
            with self.assertRaises(PortfolioError):
                store.create_campaign(
                    CampaignCreate(
                        project_id=snapshot.projects[0].id,
                        source="file",
                        source_account_id="sheet-account",
                        source_campaign_id="campaign-1",
                        name="Wrong brand",
                        brand_ids=[brand_b],
                    )
                )

    def test_duplicate_external_campaign_binding_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            store = PortfolioStore(Path(directory))
            snapshot = store.create_brand(BrandCreate(name="Brand A"))
            brand_id = snapshot.brands[0].id
            snapshot = store.create_project(
                ProjectCreate(name="Project A", brand_ids=[brand_id])
            )
            payload = CampaignCreate(
                project_id=snapshot.projects[0].id,
                source="facebook",
                source_account_id="act_1",
                source_campaign_id="cmp_1",
                name="Campaign A",
                brand_ids=[brand_id],
            )
            store.create_campaign(payload)
            with self.assertRaises(PortfolioError):
                store.create_campaign(payload)


if __name__ == "__main__":
    unittest.main()
