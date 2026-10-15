"""ROG Monitor - real-time hardware monitor for ASUS ROG laptops on Linux."""

from __future__ import annotations

from pathlib import Path


def _read_version() -> str:
    version_file = Path(__file__).resolve().parents[2] / "VERSION"
    try:
        version = version_file.read_text(encoding="utf-8").strip()
        if version:
            return version
    except OSError:
        pass
    return "0.0.0-dev"


__version__ = _read_version()
