import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse

from facebook_connection import (
    EncryptedConnectionStore,
    FacebookConfig,
    FacebookConnectionError,
    FacebookOAuthService,
    _validated_graph_url,
    sanitize_connection,
)


class FacebookConnectionTests(unittest.TestCase):
    def config(self, data_dir: Path, *, configured: bool = True) -> FacebookConfig:
        return FacebookConfig(
            app_id="123456" if configured else "",
            app_secret="test-app-secret" if configured else "",
            redirect_uri="http://localhost:8000/api/facebook/oauth/callback",
            frontend_url="http://localhost:5173",
            graph_version="v25.0",
            scopes=("pages_show_list", "ads_read"),
            data_dir=data_dir,
            encryption_secret="test-encryption-secret" if configured else "",
        )

    def test_authorization_url_has_signed_state_and_read_scopes(self):
        with tempfile.TemporaryDirectory() as directory:
            service = FacebookOAuthService(self.config(Path(directory)))
            url = service.authorization_url()
            params = parse_qs(urlparse(url).query)

            self.assertEqual(params["client_id"], ["123456"])
            self.assertEqual(params["scope"], ["pages_show_list,ads_read"])
            service.validate_state(params["state"][0])

    def test_state_rejects_tampering_and_expiry(self):
        with tempfile.TemporaryDirectory() as directory:
            service = FacebookOAuthService(self.config(Path(directory)))
            with patch("facebook_connection.time.time", return_value=1_000):
                state = service.create_state()

            with self.assertRaises(FacebookConnectionError):
                service.validate_state(f"{state[:-1]}x")

            with patch("facebook_connection.time.time", return_value=2_000):
                with self.assertRaisesRegex(FacebookConnectionError, "หมดอายุ"):
                    service.validate_state(state)

    def test_store_encrypts_tokens_at_rest_and_round_trips(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EncryptedConnectionStore(self.config(Path(directory)))
            connection = {"access_token": "top-secret-token", "pages": []}
            store.save(connection)

            self.assertNotIn(b"top-secret-token", store.path.read_bytes())
            self.assertEqual(store.load(), connection)

    def test_oauth_completion_discovers_resources_and_returns_safe_shape(self):
        with tempfile.TemporaryDirectory() as directory:
            service = FacebookOAuthService(self.config(Path(directory)))
            state = service.create_state()
            service._request_json = Mock(
                side_effect=[
                    {"access_token": "short", "expires_in": 3600},
                    {"access_token": "long", "expires_in": 5_184_000},
                    {"id": "user-1", "name": "Analyst"},
                ]
            )
            service._paginate = Mock(
                side_effect=[
                    [
                        {"permission": "pages_show_list", "status": "granted"},
                        {"permission": "ads_read", "status": "declined"},
                    ],
                    [{"id": "page-1", "name": "Brand", "access_token": "page-token"}],
                    [{"id": "act_1", "account_id": "1", "name": "Brand Ads"}],
                ]
            )

            result = service.complete_oauth("code", state)

            self.assertEqual(result["user"]["name"], "Analyst")
            self.assertEqual(result["pages"][0]["id"], "page-1")
            self.assertEqual(result["granted_scopes"], ["pages_show_list"])
            self.assertEqual(result["declined_scopes"], ["ads_read"])
            self.assertNotIn("access_token", result)
            self.assertNotIn("access_token", result["pages"][0])
            self.assertEqual(service.store.load()["access_token"], "long")

    def test_sanitized_connection_never_exposes_tokens(self):
        safe = sanitize_connection(
            {
                "provider": "facebook",
                "access_token": "user-token",
                "pages": [{"id": "1", "name": "Page", "access_token": "page-token"}],
                "ad_accounts": [{"id": "act_1", "name": "Ads"}],
            }
        )

        self.assertNotIn("access_token", safe)
        self.assertNotIn("access_token", safe["pages"][0])

    def test_unconfigured_status_explains_required_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            status = FacebookOAuthService(
                self.config(Path(directory), configured=False)
            ).status()

            self.assertFalse(status["configured"])
            self.assertFalse(status["connected"])
            self.assertEqual(status["required_environment"], ["FB_APP_ID", "FB_APP_SECRET"])

    def test_graph_request_uses_bearer_header_not_query_token(self):
        with tempfile.TemporaryDirectory() as directory:
            service = FacebookOAuthService(self.config(Path(directory)))
            response = Mock(ok=True)
            response.json.return_value = {"data": []}
            with patch("facebook_connection.requests.get", return_value=response) as request:
                service._request_json(
                    "https://graph.facebook.com/v25.0/me",
                    params={"fields": "id"},
                    access_token="secret-token",
                )

            kwargs = request.call_args.kwargs
            self.assertEqual(kwargs["headers"]["Authorization"], "Bearer secret-token")
            self.assertNotIn("access_token", kwargs["params"])
            self.assertIn("appsecret_proof", kwargs["params"])

    def test_oauth_exchange_posts_secrets_in_body(self):
        with tempfile.TemporaryDirectory() as directory:
            service = FacebookOAuthService(self.config(Path(directory)))
            response = Mock(ok=True)
            response.json.return_value = {"access_token": "token"}
            with patch("facebook_connection.requests.post", return_value=response) as request:
                service._request_json(
                    "https://graph.facebook.com/v25.0/oauth/access_token",
                    params={"client_secret": "secret"},
                    include_proof=False,
                    method="POST",
                )

            self.assertEqual(request.call_args.kwargs["data"]["client_secret"], "secret")
            self.assertNotIn("params", request.call_args.kwargs)

    def test_pagination_url_is_host_allowlisted_and_credentials_are_stripped(self):
        clean = _validated_graph_url(
            "https://graph.facebook.com/v25.0/me/accounts?after=cursor&access_token=secret"
        )
        self.assertEqual(
            clean,
            "https://graph.facebook.com/v25.0/me/accounts?after=cursor",
        )
        with self.assertRaises(FacebookConnectionError):
            _validated_graph_url("https://attacker.example/collect?access_token=secret")
        with self.assertRaises(FacebookConnectionError):
            _validated_graph_url("https://graph.facebook.com:invalid/page")


if __name__ == "__main__":
    unittest.main()
