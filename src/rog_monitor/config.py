"""Persistent JSON configuration at ~/.config/rog-monitor/config.json."""

import json
import os
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "rog-monitor"
CONFIG_FILE = CONFIG_DIR / "config.json"
DATA_DIR = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "rog-monitor"

DEFAULTS = {
    "lang": "auto",
    "theme": "rog",
    "interval": 1.0,
    "history_seconds": 900,
    "notifications": True,
    "fan_max_rpm": {},
    "alerts": {
        "cpu_temp_warn": 92,
        "gpu_temp_warn": 85,
        "cpu_power_warn": 140,
        "fan_stopped_cpu_temp": 60,
        "cooldown_seconds": 120,
    },
}


def _merge(base: dict, extra: dict) -> dict:
    out = dict(base)
    for k, v in extra.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


class Config:
    def __init__(self):
        self.data = dict(DEFAULTS)
        try:
            with open(CONFIG_FILE) as fh:
                self.data = _merge(DEFAULTS, json.load(fh))
        except (OSError, ValueError):
            pass

    def __getitem__(self, key):
        return self.data[key]

    def get(self, key, default=None):
        return self.data.get(key, default)

    def save(self) -> None:
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            with open(CONFIG_FILE, "w") as fh:
                json.dump(self.data, fh, indent=2, sort_keys=True)
                fh.write("\n")
        except OSError:
            pass
