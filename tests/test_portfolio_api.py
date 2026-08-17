import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import server
from app_security import RateLimiter, SecuritySettings, SessionManager
from portfolio import PortfolioStore


class PortfolioApiSecurityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.original_settings = server.security_settings
        self.original_manager = server.session_manager
        self.original_limiter = server.rate_limiter
        self.original_store = server.portfolio_store
        settings = SecuritySettings(
            environment="production",
            password="portfolio-test-password",
            session_secret="portfolio-test-session-secret-that-is-long-enough",
        )
        server.security_settings = settings
        server.session_manager = SessionManager(settings)
        server.rate_limiter = RateLimiter()
        server.portfolio_store = PortfolioStore(Path(self.directory.name))
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        server.security_settings = self.original_settings
        server.session_manager = self.original_manager
        server.rate_limiter = self.original_limiter
        server.portfolio_store = self.original_store
        self.directory.cleanup()

    def login(self):
        response = self.client.post(
            "/api/auth/login", json={"password": "portfolio-test-password"}
        )
        self.assertEqual(response.status_code, 200)

    def test_portfolio_requires_authentication(self):
        response = self.client.get("/api/portfolio")
        self.assertEqual(response.status_code, 401)

    def test_authenticated_portfolio_flow_preserves_scope(self):
        self.login()
        brand_response = self.client.post(
            "/api/portfolio/brands", json={"name": "Brand A", "code": "A"}
        )
        self.assertEqual(brand_response.status_code, 201)
        brand_id = brand_response.json()["brands"][0]["id"]

        project_response = self.client.post(
            "/api/portfolio/projects",
            json={"name": "Q3 Launch", "brand_ids": [brand_id]},
        )
        self.assertEqual(project_response.status_code, 201)
        project_id = project_response.json()["projects"][0]["id"]

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

    def test_hostile_origin_is_rejected_before_mutation(self):
        self.login()
        response = self.client.post(
            "/api/portfolio/brands",
            json={"name": "Blocked brand"},
            headers={"Origin": "https://attacker.example"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(server.portfolio_store.snapshot().brands, [])


if __name__ == "__main__":
    unittest.main()
