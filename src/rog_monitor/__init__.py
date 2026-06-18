"""ROG Monitor - real-time hardware monitor for ASUS ROG laptops on Linux."""

from __future__ import annotations

import os
from pathlib import Path


def _read_version() -> str:
    env_version = os.environ.get("ROG_MONITOR_VERSION")
    if env_version:
        return env_version.strip()

    version_file = Path(__file__).resolve().parents[2] / "VERSION"
    try:
        version = version_file.read_text(encoding="utf-8").strip()
        if version:
            return version
    except OSError:
        pass
    return "0.0.0-dev"


__version__ = _read_version()
