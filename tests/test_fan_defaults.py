"""Las curvas por defecto del servicio root y las de la app son las mismas,
arrancan en 50 °C y son monótonas (el EC rechaza curvas que bajan)."""

import json
import subprocess
import unittest
from pathlib import Path

from rog_monitor.fans import DEFAULT_FAN_CURVES

SYNC = Path(__file__).resolve().parents[1] / "scripts" / "rog-profile-sync.sh"


class FanDefaults(unittest.TestCase):
    def test_service_and_app_agree(self):
        for prof in ("performance", "balanced", "quiet"):
            out = subprocess.run(["bash", str(SYNC), "--defaults", prof], capture_output=True,
                                 text=True, check=True, stdin=subprocess.DEVNULL).stdout
            svc = json.loads(out)
            app = DEFAULT_FAN_CURVES["profiles"][prof]
            for key in ("cpu", "gpu", "mid"):
                self.assertEqual(svc[key], {"temps": app[key]["temps"], "pwms": app[key]["pwms"]},
                                 f"{prof}/{key}")

    def test_shape(self):
        for prof, curves in DEFAULT_FAN_CURVES["profiles"].items():
            for key in ("cpu", "gpu", "mid"):
                t, p = curves[key]["temps"], curves[key]["pwms"]
                self.assertEqual(t[0], 50, f"{prof}/{key}")
                self.assertTrue(all(a < b for a, b in zip(t, t[1:])))
                self.assertTrue(all(a <= b for a, b in zip(p, p[1:])))
                self.assertTrue(all(0 <= v <= 255 for v in p))

    def test_profiles_are_ordered(self):
        P = DEFAULT_FAN_CURVES["profiles"]
        for i in range(8):
            self.assertLess(P["quiet"]["cpu"]["pwms"][i], P["balanced"]["cpu"]["pwms"][i])
            self.assertLess(P["balanced"]["cpu"]["pwms"][i], P["performance"]["cpu"]["pwms"][i])


if __name__ == "__main__":
    unittest.main()
