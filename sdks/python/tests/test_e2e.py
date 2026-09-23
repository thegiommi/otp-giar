"""End-to-end test against a running instance.

    OTP_BASE_URL=http://localhost:5173 python -m unittest discover -s sdks/python/tests
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from otp_giar import OtpClient, OtpError, decrypt_secret, encrypt_secret  # noqa: E402

BASE_URL = os.environ.get("OTP_BASE_URL", "http://localhost:5173")


class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.client = OtpClient(BASE_URL)

    def test_round_trip(self):
        text = "DB_PASSWORD=s3cr3t ✓ ümlaut\nline 2"
        created = self.client.create(text, expires_in=600)
        self.assertRegex(created.link, r"/s/[A-Za-z0-9_-]{32}#[A-Za-z0-9_-]{43}$")
        self.assertEqual(self.client.info(created.link)["viewsRemaining"], 1)
        revealed = self.client.reveal(created.link)
        self.assertEqual(revealed.secret, text)
        self.assertEqual(revealed.views_remaining, 0)
        with self.assertRaises(OtpError) as ctx:
            self.client.reveal(created.link)
        self.assertEqual(ctx.exception.status, 404)

    def test_password(self):
        created = self.client.create("pw", password="correct horse")
        with self.assertRaises(OtpError) as ctx:
            self.client.reveal(created.link, password="wrong")
        self.assertEqual(ctx.exception.status, 401)
        self.assertEqual(ctx.exception.details["attemptsRemaining"], 9)
        self.assertEqual(self.client.reveal(created.link, password="correct horse").secret, "pw")

    def test_burn(self):
        created = self.client.create("burn me")
        self.client.burn(created.id, created.delete_token)
        with self.assertRaises(OtpError):
            self.client.info(created.id)

    def test_local_crypto_is_compatible_with_itself(self):
        key, payload = encrypt_secret("x", password="p", iterations=100_000)
        self.assertEqual(decrypt_secret(payload, key, "p"), "x")


if __name__ == "__main__":
    unittest.main()
