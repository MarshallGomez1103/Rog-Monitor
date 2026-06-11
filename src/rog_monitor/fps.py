"""Game FPS via MangoHud CSV logs (best effort, no injection of our own).

Only something running inside the game (MangoHud) can know its real FPS.
When MangoHud logging is enabled with an `output_folder`, it appends one CSV
row per `log_interval` while the game runs. We tail the freshest CSV and
report its last fps value; if no log was touched recently, fps is None and
the overlay hides the row.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

MANGOHUD_CONF = Path.home() / ".config" / "MangoHud" / "MangoHud.conf"
# Folder the app offers to configure for MangoHud logging.
DEFAULT_LOG_DIR = Path.home() / ".local" / "share" / "rog-monitor" / "mangohud-logs"
FRESH_SECONDS = 5.0
_TAIL_BYTES = 4096


def _configured_log_dir() -> Path | None:
    try:
        for raw in MANGOHUD_CONF.read_text().splitlines():
            line = raw.strip()
            if line.startswith("output_folder="):
                value = line.split("=", 1)[1].strip()
                if value:
                    return Path(os.path.expanduser(value))
    except OSError:
        pass
    return None


def _freshest_csv(folder: Path) -> Path | None:
    try:
        candidates = [
            (path.stat().st_mtime, path)
            for path in folder.glob("*.csv")
        ]
    except OSError:
        return None
    if not candidates:
        return None
    mtime, path = max(candidates)
    if time.time() - mtime > FRESH_SECONDS:
        return None
    return path


def _last_fps(path: Path) -> float | None:
    """fps from the last data row; MangoHud puts the column header (`fps,
    frametime,...`) some lines into the file, after a system-info preamble."""
    try:
        with open(path, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            fh.seek(max(0, size - _TAIL_BYTES))
            tail = fh.read().decode("utf-8", "replace")
        head = path.open().read(2048)
    except OSError:
        return None

    fps_col = None
    for line in head.splitlines():
        cells = [c.strip().lower() for c in line.split(",")]
        if "fps" in cells:
            fps_col = cells.index("fps")
            break
    if fps_col is None:
        return None

    for line in reversed(tail.strip().splitlines()):
        cells = line.split(",")
        if len(cells) <= fps_col:
            continue
        try:
            return round(float(cells[fps_col]), 1)
        except ValueError:
            continue  # header or partial row
    return None


def read_fps() -> float | None:
    folder = _configured_log_dir() or DEFAULT_LOG_DIR
    csv = _freshest_csv(folder)
    if csv is None:
        return None
    return _last_fps(csv)


if __name__ == "__main__":
    print(read_fps())
