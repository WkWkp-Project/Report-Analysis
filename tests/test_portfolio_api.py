import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import server
from app_security import RateLimiter, SecuritySettings, SessionManager
from portfolio import PortfolioStore
from report_elements import ReportElementStore
from metric_workspace import MetricWorkspaceStore
from report_shares import ReportShareStore
from report_library import ReportLibraryStore


class PortfolioApiSecurityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.original_settings = server.security_settings
        self.original_manager = server.session_manager
        self.original_limiter = server.rate_limiter
        self.original_store = server.portfolio_store
        self.original_element_store = server.report_element_store
        self.original_metric_store = server.metric_workspace_store
        self.original_share_store = server.report_share_store
        self.original_library_store = server.report_library_store
        settings = SecuritySettings(
            environment="production",
            password="portfolio-test-password",
            session_secret="portfolio-test-session-secret-that-is-long-enough",
        )
        server.security_settings = settings
        server.session_manager = SessionManager(settings)
        server.rate_limiter = RateLimiter()
        server.portfolio_store = PortfolioStore(Path(self.directory.name))
        server.report_element_store = ReportElementStore(Path(self.directory.name))
        server.metric_workspace_store = MetricWorkspaceStore(Path(self.directory.name))
        server.report_share_store = ReportShareStore(Path(self.directory.name))
        server.report_library_store = ReportLibraryStore(Path(self.directory.name))
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        server.security_settings = self.original_settings
        server.session_manager = self.original_manager
        server.rate_limiter = self.original_limiter
        server.portfolio_store = self.original_store
        server.report_element_store = self.original_element_store
        server.metric_workspace_store = self.original_metric_store
        server.report_share_store = self.original_share_store
        server.report_library_store = self.original_library_store
        self.directory.cleanup()

    def login(self):
        response = self.client.post(
            "/api/auth/login", json={"password": "portfolio-test-password"}
        )
        self.assertEqual(response.status_code, 200)

    def create_project(self):
        brand_response = self.client.post(
            "/api/portfolio/brands", json={"name": "Brand A", "code": "A"}
        )
        brand_id = brand_response.json()["brands"][0]["id"]
        project_response = self.client.post(
            "/api/portfolio/projects",
            json={"name": "Q3 Launch", "brand_ids": [brand_id]},
        )
        return brand_id, project_response.json()["projects"][0]["id"]

    def test_portfolio_requires_authentication(self):
        response = self.client.get("/api/portfolio")
        self.assertEqual(response.status_code, 401)
        response = self.client.get("/api/projects/prj_ffffffffffffffff/elements")
        self.assertEqual(response.status_code, 401)

    def test_authenticated_portfolio_flow_preserves_scope(self):
        self.login()
        brand_id, project_id = self.create_project()

        period_response = self.client.post(
            "/api/portfolio/periods",
            json={
                "project_id": project_id,
                "label": "August 2026",
                "date_from": "2026-08-01",
                "date_to": "2026-08-31",
            },
        )
        self.assertEqual(period_response.status_code, 201)
        self.assertEqual(period_response.json()["periods"][0]["project_id"], project_id)
        period_id = period_response.json()["periods"][0]["id"]

        campaign_response = self.client.post(
            "/api/portfolio/campaigns",
            json={
                "project_id": project_id,
                "source": "facebook",
                "source_account_id": "act_123",
                "source_campaign_id": "cmp_456",
                "name": "Conversion launch",
                "brand_ids": [brand_id],
            },
        )
        self.assertEqual(campaign_response.status_code, 201)
        self.assertEqual(campaign_response.json()["campaigns"][0]["project_id"], project_id)
        campaign_id = campaign_response.json()["campaigns"][0]["id"]

        scoped_analysis = self.client.get(
            "/api/analyze",
            params=[
                ("since", "2026-08-01"),
                ("until", "2026-08-31"),
                ("demo", "1"),
                ("project_id", project_id),
                ("period_id", period_id),
                ("campaign_ids", campaign_id),
            ],
        )
        self.assertEqual(scoped_analysis.status_code, 200)
        self.assertEqual(scoped_analysis.json()["scope"]["project_id"], project_id)
        self.assertEqual(
            scoped_analysis.json()["scope"]["campaigns"][0]["id"], campaign_id
        )

        incomplete_scope = self.client.get(
            "/api/analyze?demo=1&project_id=" + project_id
        )
        self.assertEqual(incomplete_scope.status_code, 422)

    def test_report_elements_are_authenticated_and_project_scoped(self):
        self.login()
        _, project_id = self.create_project()
        create_response = self.client.post(
            f"/api/projects/{project_id}/elements",
            json={
                "kind": "next_step",
                "title": "Next action",
                "content": "Review the campaign split with the client.",
            },
        )
        self.assertEqual(create_response.status_code, 201)
        element = create_response.json()
        update_response = self.client.patch(
            f"/api/projects/{project_id}/elements/{element['id']}",
            json={"expected_version": 1, "status": "done"},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["version"], 2)

        other_project = "prj_ffffffffffffffff"
        response = self.client.get(f"/api/projects/{other_project}/elements")
        self.assertEqual(response.status_code, 404)

        blocked_response = self.client.post(
            f"/api/projects/{project_id}/elements",
            json={"kind": "comment", "content": "Blocked cross-origin write"},
            headers={"Origin": "https://attacker.example"},
        )
        self.assertEqual(blocked_response.status_code, 403)

    def test_hostile_origin_is_rejected_before_mutation(self):
        self.login()
        response = self.client.post(
            "/api/portfolio/brands",
            json={"name": "Blocked brand"},
            headers={"Origin": "https://attacker.example"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(server.portfolio_store.snapshot().brands, [])

    def test_analysis_period_is_validated_and_returned(self):
        self.login()
        invalid = self.client.get(
            "/api/analyze?since=2026-08-10&until=2026-08-01&demo=1"
        )
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(invalid.json()["detail"], "วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด")

        response = self.client.get(
            "/api/analyze?since=2026-08-01&until=2026-08-07&demo=1"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["range"],
            {"since": "2026-08-01", "until": "2026-08-07"},
        )

    def test_campaign_override_custom_metric_and_read_only_share(self):
        self.login()
        brand_id, project_id = self.create_project()
        period = self.client.post(
            "/api/portfolio/periods",
            json={"project_id": project_id, "label": "August", "date_from": "2026-08-01", "date_to": "2026-08-31"},
        ).json()["periods"][0]
        campaign = self.client.post(
            "/api/portfolio/campaigns",
            json={"project_id": project_id, "source": "facebook", "source_account_id": "act_1", "source_campaign_id": "external_1", "name": "Sales", "brand_ids": [brand_id]},
        ).json()["campaigns"][0]

        override = self.client.patch(
            f"/api/projects/{project_id}/campaign-metrics",
            json={"period_id": period["id"], "campaign_id": campaign["id"], "values": {"revenue": 9999}, "reason": "Matched CRM total"},
        )
        self.assertEqual(override.status_code, 200)
        custom = self.client.post(
            f"/api/projects/{project_id}/custom-metrics",
            json={"key": "cost_per_purchase", "label": "Cost per purchase", "formula": "spend / purchases", "unit": "currency"},
        )
        self.assertEqual(custom.status_code, 201)

        shared = self.client.post(
            "/api/report-shares",
            json={"since": "2026-08-01", "until": "2026-08-31", "project_id": project_id, "period_id": period["id"], "campaign_ids": [campaign["id"]], "demo": True},
        )
        self.assertEqual(shared.status_code, 201)
        token = shared.json()["token"]
        self.client.post("/api/auth/logout")
        public = self.client.get(f"/api/public/reports/{token}")
        self.assertEqual(public.status_code, 200)
        report = public.json()["report"]
        self.assertTrue(report["read_only"])
        self.assertEqual(report["campaign_results"][0]["revenue"], 9999)
        self.assertEqual(report["campaign_overview"]["revenue"], 9999)
        self.assertNotIn("source_account_id", report["campaign_results"][0])
        blocked = self.client.patch(
            f"/api/projects/{project_id}/campaign-metrics",
            json={"period_id": period["id"], "campaign_id": campaign["id"], "values": {"revenue": 1}, "reason": "blocked"},
        )
        self.assertEqual(blocked.status_code, 401)

    def test_brand_first_report_publish_keeps_revision(self):
        self.login()
        brand_id, _ = self.create_project()
        created = self.client.post("/api/reports", json={"brand_id": brand_id, "name": "August client report", "date_from": "2026-08-01", "date_to": "2026-08-31"})
        self.assertEqual(created.status_code, 201)
        report_id = created.json()["id"]
        analysis = self.client.get(f"/api/analyze?demo=1&report_id={report_id}")
        self.assertEqual(analysis.status_code, 200)
        self.assertEqual(analysis.json()["report"]["brand_id"], brand_id)
        self.assertEqual(analysis.json()["campaign_results"][0]["campaign_id"], "report_total")
        override = self.client.patch(
            f"/api/projects/{report_id}/campaign-metrics",
            json={"period_id": report_id, "campaign_id": "report_total", "values": {"revenue": 54321}, "reason": "Matched sales file"},
        )
        self.assertEqual(override.status_code, 200)
        refreshed = self.client.get(f"/api/analyze?demo=1&report_id={report_id}").json()
        self.assertEqual(refreshed["campaign_overview"]["revenue"], 54321)
        published = self.client.post(f"/api/reports/{report_id}/publish", json={"demo": True, "note": "approved"})
        self.assertEqual(published.status_code, 200)
        self.assertEqual(published.json()["revision"]["version"], 1)
        detail = self.client.get(f"/api/reports/{report_id}").json()
        self.assertEqual(detail["report"]["status"], "published")
        self.assertTrue(detail["revisions"][0]["snapshot"]["read_only"])
        archived = self.client.delete(f"/api/reports/{report_id}")
        self.assertEqual(archived.status_code, 200)
        self.assertEqual(archived.json()["status"], "archived")


if __name__ == "__main__":
    unittest.main()
