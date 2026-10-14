"""Game FPS via MangoHud CSV logs (best effort, no injection of our own).

Only something running inside the game (MangoHud) can know its real FPS.
When MangoHud logging is enabled with an `output_folder`, it appends one CSV
row per `log_interval` while the game runs. We tail the freshest CSV and
report its last fps value; if no log was touched recently, fps is None and
the overlay hides the row.
"""

from __future__ import annotations

import math
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
    frametime,...`) some lines into the file, after a system-info preamble.

    One binary read of head and tail. A tail that starts mid-row or a last row
    without its trailing newline may be cut inside a number ("6" of "60.5"),
    so those partial lines are dropped; nan/inf/negative values are never
    reported.
    """
    try:
        with open(path, "rb") as fh:
            head = fh.read(2048).decode("utf-8", "replace")
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            start = max(0, size - _TAIL_BYTES)
            fh.seek(start)
            tail = fh.read().decode("utf-8", "replace")
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

    lines = tail.split("\n")
    if not tail.endswith("\n"):
        lines.pop()  # last row is still being written / truncated
    if start > 0 and lines:
        lines.pop(0)  # tail begins mid-row

    for line in reversed(lines):
        cells = line.split(",")
        if len(cells) <= fps_col:
            continue
        try:
            value = float(cells[fps_col])
        except ValueError:
            continue  # header or partial row
        if not math.isfinite(value) or value < 0:
            continue
        return round(value, 1)
    return None


def read_fps() -> float | None:
    folder = _configured_log_dir() or DEFAULT_LOG_DIR
    csv = _freshest_csv(folder)
    if csv is None:
        return None
    return _last_fps(csv)


if __name__ == "__main__":
    print(read_fps())
