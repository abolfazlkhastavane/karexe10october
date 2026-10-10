import unittest
import sys
import os
from unittest.mock import patch
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../app')))

from core import license_client, config

class TestLicenseSanitization(unittest.TestCase):
    @patch("requests.post")
    def test_activate_exception_hides_url(self, mock_post):
        mock_post.side_effect = requests.exceptions.HTTPError(
            f"404 Client Error for url: {config.LICENSE_API_URL}"
        )

        result = license_client.activate("SOME-CODE")

        self.assertFalse(result["success"])
        self.assertFalse(result["valid"])
        # Ensure the secret URL is NOT leaked in the message
        self.assertNotIn(config.LICENSE_API_URL, result["message"])
        self.assertNotIn("http", result["message"])

if __name__ == "__main__":
    unittest.main()
