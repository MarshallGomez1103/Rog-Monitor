"""Persistent JSON configuration at ~/.config/rog-monitor/config.json."""

import json
import os
import shutil
import tempfile
import time
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "rog-monitor"
CONFIG_FILE = CONFIG_DIR / "config.json"
DATA_DIR = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "rog-monitor"

DEFAULTS = {
    "lang": "en",
    "theme": "rog",
    "interval": 1.0,
    "history_seconds": 900,
    "notifications": True,
    "close_action": "quit",
    "ui_prefs_migrated": False,
    "appearance": {
        "theme": "magma",
        "mode": "dark",
        "zoom_level": 0,
    },
    "dashboard_layout": {},
    "dashboard_edit_mode": False,
    "aura_draft": {},
    "fan_max_rpm": {},
    "alerts": {
        "cpu_temp_warn": 92,
        "gpu_temp_warn": 85,
        "cpu_power_warn": 140,
        "fan_stopped_cpu_temp": 60,
        "cooldown_seconds": 60,
        # histéresis: una alerta sólo se despeja al bajar de umbral - margen
        # (°C para temperaturas, % del umbral para potencia)
        "hysteresis_temp": 3,
        "hysteresis_pct": 5,
        # ms of real throttle time per sample before alerting (micro-blips
        # of a few ms are normal on modern Intel HX chips)
        "throttle_min_ms": 100,
        # memoria y disco (%, histéresis = hysteresis_pct puntos)
        "ram_percent_warn": 90,
        "swap_percent_warn": 80,
        "disk_percent_warn": 95,
    },
    # color thresholds [green_below, yellow_below, orange_below] in °C;
    # at or above the last value everything turns red
    "temp_colors": {
        "cpu": [70, 85, 92],
        "gpu": [60, 75, 83],
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


def write_atomic(path: Path, text: str) -> None:
    """Escribe `text` en `path` de forma atómica (tmp en el mismo dir + replace).

    Nunca deja un archivo a medias; si falla, borra el tmp y re-lanza el OSError.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as fh:
            fh.write(text)
        os.chmod(tmp, 0o644)  # mkstemp crea 0600; los scripts root también lo leen
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def backup_corrupt(path: Path) -> Path | None:
    """Copia un JSON ilegible a `<nombre>.corrupt-<fecha>.bak` (una sola vez
    por contenido) para que ninguna escritura posterior lo pierda."""
    path = Path(path)
    try:
        raw = path.read_bytes()
        for old in path.parent.glob(path.name + ".corrupt-*.bak"):
            if old.read_bytes() == raw:
                return old
        dest = path.with_name(f"{path.name}.corrupt-{time.strftime('%Y%m%d-%H%M%S')}.bak")
        shutil.copy2(path, dest)
        return dest
    except OSError:
        return None


class Config:
    def __init__(self):
        self.data = dict(DEFAULTS)
        try:
            with open(CONFIG_FILE) as fh:
                loaded = json.load(fh)
            if not isinstance(loaded, dict):
                raise ValueError("config.json no es un objeto JSON")
            self.data = _merge(DEFAULTS, loaded)
        except OSError:
            pass
        except ValueError:
            backup_corrupt(CONFIG_FILE)

    def __getitem__(self, key):
        return self.data[key]

    def get(self, key, default=None):
        return self.data.get(key, default)

    def save(self) -> bool:
        """Guarda atómicamente. Devuelve False si falló (el llamador decide)."""
        try:
            write_atomic(CONFIG_FILE, json.dumps(self.data, indent=2, sort_keys=True) + "\n")
            return True
        except OSError:
            return False
