import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from vaultessa import VaultessaClient

FIXTURE = json.loads((Path(__file__).parents[1] / "test-vectors.json").read_text())


class SdkTests(unittest.TestCase):
    def test_decrypts_and_sends_derived_credential(self):
        client = VaultessaClient("https://vault.example", FIXTURE["token"])
        self.assertEqual(client._credential, FIXTURE["credential"])
        with patch("vaultessa.build_opener") as opener:
            opener.return_value.open.return_value = io.BytesIO(
                json.dumps(
                    {
                        "status": "success",
                        "message": "Success",
                        "data": [FIXTURE["row"]],
                    }
                ).encode()
            )
            self.assertEqual(
                client.get(FIXTURE["row"]["id"])["data"], FIXTURE["payload"]
            )
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(
                request.get_header("Authorization"), "Bearer " + FIXTURE["credential"]
            )

    def test_rejects_remote_plaintext(self):
        with self.assertRaises(ValueError):
            VaultessaClient("http://vault.example", FIXTURE["token"])

    def test_tampered_ciphertext(self):
        row = {
            **FIXTURE["row"],
            "encryptedData": FIXTURE["row"]["encryptedData"][:-5] + "AAAA=",
        }
        with patch("vaultessa.build_opener") as opener:
            opener.return_value.open.return_value = io.BytesIO(
                json.dumps(
                    {"status": "success", "message": "Success", "data": [row]}
                ).encode()
            )
            with self.assertRaises(Exception):
                VaultessaClient("https://vault.example", FIXTURE["token"]).list()


if __name__ == "__main__":
    unittest.main()
