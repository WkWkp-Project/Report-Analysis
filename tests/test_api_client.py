import os
import unittest
from unittest.mock import Mock, patch

from api_client import FBClient
from facebook_connection import FacebookConnectionError


class LegacyApiClientSecurityTests(unittest.TestCase):
    def client(self) -> FBClient:
        with patch.dict(
            os.environ,
            {"FB_PAGE_ACCESS_TOKEN": "page-token", "FB_PAGE_ID": "123"},
            clear=False,
        ):
            return FBClient()

    def test_access_token_uses_authorization_header(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"data": []}
        with patch("api_client.requests.get", return_value=response) as request:
            self.client()._get("/123/posts", {"limit": 10, "access_token": "leak"})

        kwargs = request.call_args.kwargs
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer page-token")
        self.assertNotIn("access_token", kwargs["params"])

    def test_external_pagination_host_is_rejected(self):
        with self.assertRaises(FacebookConnectionError):
            self.client()._get("https://attacker.example/collect")


if __name__ == "__main__":
    unittest.main()
