"""User actions: change power profile, toggle GPU mode, export history."""

import csv
import json
import subprocess
from datetime import datetime

from .config import DATA_DIR

PROFILE_CYCLE = ["power-saver", "balanced", "performance"]


def _run(cmd: list[str], timeout: float = 5.0) -> tuple[bool, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return proc.returncode == 0, (proc.stdout + proc.stderr).strip()
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)


def cycle_profile(current: str | None) -> tuple[bool, str]:
    try:
        idx = PROFILE_CYCLE.index(current or "balanced")
    except ValueError:
        idx = 0
    target = PROFILE_CYCLE[(idx + 1) % len(PROFILE_CYCLE)]
    from .power import PPD_BUS

    ok, _ = _run(["busctl", "--system", "set-property", *PPD_BUS,
                  "ActiveProfile", "s", target])
    return ok, target


def toggle_gpu_mode(current: str | None) -> tuple[bool, str]:
    target = "Integrated" if (current or "").lower() == "hybrid" else "Hybrid"
    ok, _ = _run(["supergfxctl", "--mode", target], timeout=10)
    return ok, target


def export_history(series: dict, events) -> str:
    """Write JSON + CSV snapshots; returns the export directory path."""
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    payload = {
        name: serie.values() for name, serie in series.items()
    }
    payload["events"] = [list(e) for e in events]
    with open(out_dir / f"rog-monitor-{stamp}.json", "w") as fh:
        json.dump(payload, fh, indent=2)

    with open(out_dir / f"rog-monitor-{stamp}.csv", "w", newline="") as fh:
        writer = csv.writer(fh)
        names = [n for n in series]
        writer.writerow(["sample"] + names)
        columns = [series[n].values() for n in names]
        for i in range(max((len(c) for c in columns), default=0)):
            writer.writerow([i] + [c[i] if i < len(c) else "" for c in columns])

    return str(out_dir)
