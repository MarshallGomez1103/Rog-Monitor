"""Fan RPM reading with percentages relative to the user's RPM cap."""

import json
import time

from . import hwmon
from .config import CONFIG_DIR, DATA_DIR

# Sensible startup maximums for ROG Strix; auto-raised when exceeded.
DEFAULT_MAX = {"cpu_fan": 7100, "gpu_fan": 7000, "mid_fan": 7600}
FALLBACK_MAX = 6000
FAN_CURVES_FILE = CONFIG_DIR / "fan-curves.json"
# Esquema versionado de fan-curves.json. v1 = sin "version" (legado, solo
# performance calibrado a mano). v2 agrega "version", curvas propias para
# balanced/quiet (no solo performance) y permite "cap_rpm" por perfil.
FAN_CURVES_SCHEMA_VERSION = 2
# Estado liviano que escribe rog-thermal-guardian.sh (root) para que la UI
# vea el modo actual sin parsear logs. Ruta de solo lectura para la app.
GUARDIAN_STATE_FILE = DATA_DIR / "thermal-guardian-state.json"
# Si el archivo de estado es más viejo que esto, se considera que el
# guardián no está corriendo (evita mostrar un modo "alto" pegado para
# siempre si el servicio murió). Falla-segura: se reporta como desconocido,
# nunca como "silencio".
GUARDIAN_STATE_MAX_AGE = 30.0
# JSON cap keys (cpu/gpu/mid) → hwmon fan labels.
CAP_KEY = {"cpu_fan": "cpu", "gpu_fan": "gpu", "mid_fan": "mid"}


def _store_section(name: str, profile: str | None = None) -> dict:
    """A cpu/gpu/mid section of fan-curves.json mapped to hwmon fan labels.

    Si `profile` se da y existe `profiles.<profile>.cap_rpm`, ese override
    por perfil gana sobre el `cap_rpm` global (esquema v2). Mantiene
    compatibilidad total con JSONs v1 (sin "version", sin cap por perfil).
    """
    try:
        with open(FAN_CURVES_FILE) as fh:
            data = json.load(fh) or {}
    except (OSError, ValueError):
        return {}
    section = data.get(name) or {}
    if profile and name == "cap_rpm":
        per_profile = (data.get("profiles") or {}).get(profile) or {}
        override = per_profile.get("cap_rpm")
        if isinstance(override, dict):
            section = {**section, **override}
    out = {}
    for label, key in CAP_KEY.items():
        value = section.get(key)
        if isinstance(value, (int, float)) and value > 0:
            out[label] = int(value)
    return out


def load_caps(profile: str | None = None) -> dict:
    """RPM cap per fan label from fan-curves.json (empty if none set)."""
    return _store_section("cap_rpm", profile)


def load_measured_max() -> dict:
    """Real measured maximums (calibrate-fans.sh) per fan label."""
    return _store_section("max_rpm")


def load_schema_version() -> int:
    """Versión del esquema del fan-curves.json del usuario (1 si falta)."""
    try:
        with open(FAN_CURVES_FILE) as fh:
            data = json.load(fh) or {}
    except (OSError, ValueError):
        return FAN_CURVES_SCHEMA_VERSION
    version = data.get("version")
    return int(version) if isinstance(version, (int, float)) else 1


def guardian_status() -> dict:
    """Estado del guardián térmico para el stream NDJSON (solo lectura).

    rog-thermal-guardian.sh (root) escribe GUARDIAN_STATE_FILE con
    {"mode": "silence|normal|high", "reason": str, "updated": epoch}. Esta
    app solo lo lee; nunca escribe ahí ni asume que el guardián está
    instalado. Si el archivo falta o está viejo, "mode" es None (UI debe
    tratarlo como "desconocido/no instalado", no como silencio).
    """
    try:
        with open(GUARDIAN_STATE_FILE) as fh:
            data = json.load(fh) or {}
    except (OSError, ValueError):
        return {"mode": None, "running": False}
    updated = data.get("updated")
    fresh = isinstance(updated, (int, float)) and (time.time() - updated) < GUARDIAN_STATE_MAX_AGE
    mode = data.get("mode") if fresh else None
    return {
        "mode": mode,
        "running": bool(fresh),
        "reason": data.get("reason") if fresh else None,
    }


class FanReader:
    def __init__(self, chips: dict, config):
        self.config = config
        # asus chip exposes cpu_fan/gpu_fan/mid_fan; otherwise use any chip with fans
        self.devs = []
        preferred = hwmon.find(chips, "asus")
        if preferred is not None:
            self.devs = [preferred]
        else:
            self.devs = [
                dev
                for paths in chips.values()
                for dev in paths
                if any(dev.glob("fan*_input"))
            ]
        stored = config.get("fan_max_rpm") or {}
        # measured maximums (fan-curves.json) win over observed/defaults
        self.max_rpm = {**DEFAULT_MAX, **stored, **load_measured_max()}
        self._active_profile: str | None = None
        self.caps = load_caps(self._active_profile)
        self._caps_mtime = self._curves_mtime()
        self._dirty = False

    @staticmethod
    def _curves_mtime() -> float:
        try:
            return FAN_CURVES_FILE.stat().st_mtime
        except OSError:
            return 0.0

    def _maybe_reload_caps(self, profile: str | None = None) -> None:
        mtime = self._curves_mtime()
        if mtime != self._caps_mtime or profile != self._active_profile:
            self._active_profile = profile
            self.caps = load_caps(profile)
            self.max_rpm.update(load_measured_max())
            self._caps_mtime = mtime

    def read(self, profile: str | None = None) -> list[dict]:
        """Lee RPM/% por fan. `profile` (quiet/balanced/performance) permite
        usar el cap_rpm específico de ese perfil si fan-curves.json lo trae
        (esquema v2); si no hay override, cae al cap_rpm global (v1)."""
        self._maybe_reload_caps(profile)
        out = []
        for dev in self.devs:
            for label, rpm in hwmon.fans(dev).items():
                top = self.max_rpm.get(label, FALLBACK_MAX)
                if rpm > top:
                    self.max_rpm[label] = top = rpm
                    self._dirty = True
                # Percent is relative to the user's RPM cap when one is set,
                # so 100% means "at the cap". Above the cap is clamped to 100.
                ref = self.caps.get(label) or top
                out.append(
                    {
                        "label": label,
                        "rpm": rpm,
                        "percent": min(100, round(rpm * 100 / ref)) if ref else 0,
                        "cap": self.caps.get(label),
                    }
                )
        return out

    def persist_max(self) -> None:
        if self._dirty:
            self.config.data["fan_max_rpm"] = self.max_rpm
            self.config.save()
            self._dirty = False

    def meta(self) -> dict:
        """Metadatos para el stream NDJSON (clave de nivel raíz, hermana de
        "fans"): versión del esquema de fan-curves.json y estado del
        guardián térmico. No cambia el contrato de los items de `read()`."""
        return {
            "schema_version": load_schema_version(),
            "active_profile": self._active_profile,
            "guardian": guardian_status(),
        }
