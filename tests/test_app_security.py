import unittest

from app_security import (
    RateLimiter,
    SecurityConfigurationError,
    SecuritySettings,
    SessionManager,
)


class AppSecurityTests(unittest.TestCase):
    def settings(self, **overrides):
        values = {
            "environment": "production",
            "password": "correct horse battery staple",
            "session_secret": "s" * 48,
        }
        values.update(overrides)
        return SecuritySettings(**values)

    def test_production_refuses_to_start_without_authentication(self):
        with self.assertRaises(SecurityConfigurationError):
            SessionManager(self.settings(password=None, session_secret=None))

    def test_partial_auth_configuration_is_rejected(self):
        with self.assertRaises(SecurityConfigurationError):
            SessionManager(self.settings(session_secret=None))

    def test_weak_password_is_rejected(self):
        with self.assertRaises(SecurityConfigurationError):
            SessionManager(self.settings(password="too-short"))

    def test_session_is_signed_and_expires(self):
        manager = SessionManager(self.settings())
        token = manager.create_session(now=100)
        self.assertTrue(manager.verify_session(token, now=101))
        self.assertFalse(manager.verify_session(token + "tampered", now=101))
        self.assertFalse(manager.verify_session(token, now=100 + 12 * 60 * 60 + 1))

    def test_password_comparison(self):
        manager = SessionManager(self.settings())
        self.assertTrue(manager.password_matches("correct horse battery staple"))
        self.assertFalse(manager.password_matches("wrong"))

    def test_rate_limiter_reopens_after_window(self):
        limiter = RateLimiter()
        self.assertTrue(limiter.allow("login:local", limit=2, window_seconds=60, now=1))
        self.assertTrue(limiter.allow("login:local", limit=2, window_seconds=60, now=2))
        self.assertFalse(limiter.allow("login:local", limit=2, window_seconds=60, now=3))
        self.assertTrue(limiter.allow("login:local", limit=2, window_seconds=60, now=62))


if __name__ == "__main__":
    unittest.main()
