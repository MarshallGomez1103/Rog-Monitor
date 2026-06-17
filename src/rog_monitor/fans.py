"""Fan RPM reading with percentages relative to the user's RPM cap.

v12 (A-FANS):
  - DEFAULT_FAN_CURVES con curvas suaves por perfil (quiet arranca en PWM 0
    = fan apagado hasta ~40 °C; performance/balanced con idle más bajo que
    antes para que los fans sí bajen cuando la carga termina).
  - load_profiles() / save_profiles() para leer y escribir los tres perfiles
    del fan-curves.json (contrato C3: la UI puede mostrar/editar las tres
    curvas). API retrocompatible: load_caps() y FanReader.read() no cambian.
  - load_all_config() / save_all_config() para que main.js use una sola
    llamada en get-fan-config / set-fan-config.
  - CLI: añade subcomandos `profiles` (leer) y `write-profiles` (escribir)
    sin cambiar las firmas/subcomandos existentes.
"""

from __future__ import annotations

import json
import sys
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

# ------------------------------------------------------------------
# Curvas por defecto v13 — coherentes con profile_power (device_profiles.json).
#
# Formato por perfil y zona: {"temps": [t1..t8], "pwms": [p1..p8]}
# (8 puntos, temps estrictamente crecientes, pwms no decrecientes).
#
# La curva sólo define el mapeo temperatura→PWM; la HISTÉRESIS (anti-rebote)
# la aplica rog-thermal-guardian.sh en el otro repo y NO se toca aquí.
#
# Coherencia con el objetivo térmico de cada perfil (profile_power):
#   - quiet     → thermal_target 75 °C: el ventilador llega a su tope ANTES de
#                 ~75 °C (defiende activamente el techo más bajo) y arranca
#                 APAGADO (pwm 0) por debajo de ~42 °C = silencio real. Como
#                 el poder ya está bajo, rara vez necesita ese tope.
#   - balanced  → thermal_target 82 °C: tope alrededor de ~82-84 °C.
#   - performance → thermal_target 87 °C: tope alrededor de ~87-90 °C, deja
#                 que el equipo trabaje caliente pero seguro hasta el techo de
#                 fábrica.
# Los cap_rpm bajan en quiet (más silencio) y suben en performance.
# Los tres perfiles quedan claramente distintos en cap y curva.
# ------------------------------------------------------------------
DEFAULT_FAN_CURVES: dict = {
    "version": FAN_CURVES_SCHEMA_VERSION,
    "cap_rpm": {
        "cpu": 6500,
        "gpu": 6500,
        "mid": 6500,
    },
    "profiles": {
        "performance": {
            "cap_rpm": {"cpu": 6500, "gpu": 6500, "mid": 6500},
            "gpu": {
                "temps": [35, 45, 55, 62, 70, 78, 84, 88],
                "pwms":  [30, 46, 70, 100, 150, 200, 240, 255],
            },
            "mid": {
                "temps": [35, 45, 55, 65, 75, 83, 89, 95],
                "pwms":  [30, 50, 80, 115, 158, 205, 240, 255],
            },
            "cpu": {
                "temps": [35, 45, 55, 65, 75, 83, 89, 95],
                "pwms":  [35, 55, 85, 120, 160, 205, 240, 255],
            },
        },
        "balanced": {
            "cap_rpm": {"cpu": 5500, "gpu": 5500, "mid": 5500},
            "gpu": {
                "temps": [36, 46, 56, 63, 70, 76, 81, 84],
                "pwms":  [15, 28, 50, 82, 122, 165, 200, 215],
            },
            "mid": {
                "temps": [36, 46, 56, 66, 74, 80, 85, 90],
                "pwms":  [16, 32, 56, 92, 132, 172, 205, 220],
            },
            "cpu": {
                "temps": [36, 46, 56, 66, 74, 80, 85, 90],
                "pwms":  [18, 35, 60, 95, 138, 178, 210, 225],
            },
        },
        "quiet": {
            "cap_rpm": {"cpu": 4500, "gpu": 4500, "mid": 4500},
            "gpu": {
                "temps": [42, 52, 60, 66, 70, 73, 75, 78],
                "pwms":  [0, 18, 38, 68, 100, 130, 155, 170],
            },
            "mid": {
                "temps": [42, 52, 60, 67, 72, 75, 78, 82],
                "pwms":  [0, 22, 44, 76, 110, 140, 165, 180],
            },
            "cpu": {
                "temps": [42, 52, 60, 67, 72, 75, 78, 82],
                "pwms":  [0, 20, 42, 74, 108, 140, 165, 180],
            },
        },
    },
}


# ------------------------------------------------------------------
# Funciones de lectura/escritura del JSON de curvas
# ------------------------------------------------------------------

def _load_raw() -> dict:
    """Carga fan-curves.json tal cual (sin defaults). Retorna {} si no existe."""
    try:
        with open(FAN_CURVES_FILE) as fh:
            return json.load(fh) or {}
    except (OSError, ValueError):
        return {}


def _save_raw(data: dict) -> None:
    """Guarda data en fan-curves.json (crea CONFIG_DIR si hace falta)."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    tmp = FAN_CURVES_FILE.with_suffix(".json.tmp")
    with open(tmp, "w") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
        fh.write("\n")
    tmp.replace(FAN_CURVES_FILE)


def load_all_config() -> dict:
    """Carga la config completa de fans (caps + perfiles + version).

    Si el archivo no existe o le faltan secciones, se completan con
    DEFAULT_FAN_CURVES sin pisar lo que sí exista. Siempre retorna un dict
    con claves "version", "cap_rpm" y "profiles".
    """
    import copy
    data = _load_raw()
    merged = copy.deepcopy(DEFAULT_FAN_CURVES)
    # Preservar cap_rpm global si existe
    if isinstance(data.get("cap_rpm"), dict):
        merged["cap_rpm"].update(data["cap_rpm"])
    # Preservar perfiles si existen (solo sobreescribe claves presentes)
    raw_profiles = data.get("profiles") or {}
    for prof_name, prof_defaults in merged["profiles"].items():
        raw_prof = raw_profiles.get(prof_name) or {}
        import copy as _copy
        merged_prof = _copy.deepcopy(prof_defaults)
        if isinstance(raw_prof.get("cap_rpm"), dict):
            merged_prof["cap_rpm"].update(raw_prof["cap_rpm"])
        for fan in ("cpu", "gpu", "mid"):
            if isinstance(raw_prof.get(fan), dict):
                merged_prof[fan] = raw_prof[fan]
        merged["profiles"][prof_name] = merged_prof
    # Preservar calibración y max_rpm si existen
    for key in ("calibration", "max_rpm"):
        if key in data:
            merged[key] = data[key]
    merged["version"] = FAN_CURVES_SCHEMA_VERSION
    return merged


def save_all_config(data: dict) -> None:
    """Guarda la config completa de fans en fan-curves.json.

    Solo escribe; no aplica nada al hardware (eso lo hace rog-profile-sync
    con pkexec, disparado desde main.js después de llamar a esta función).
    Preserva "calibration" y "max_rpm" si ya existen y no vienen en `data`.
    """
    existing = _load_raw()
    for key in ("calibration", "max_rpm"):
        if key in existing and key not in data:
            data[key] = existing[key]
    data.setdefault("version", FAN_CURVES_SCHEMA_VERSION)
    _save_raw(data)


def load_profiles() -> dict:
    """Lee solo la sección "profiles" del fan-curves.json.

    Retorna un dict con los tres perfiles (performance/balanced/quiet).
    Si falta alguno, se completa con DEFAULT_FAN_CURVES. Compatible con
    el esquema v1 (sin "profiles") → en ese caso devuelve los defaults.
    Contrato C3: la UI usa esta función para mostrar/editar curvas.
    """
    return load_all_config()["profiles"]


def save_profiles(profiles: dict) -> None:
    """Escribe la sección "profiles" en fan-curves.json.

    Preserva cap_rpm global, calibration y max_rpm. Solo escribe; no aplica.
    Valida que cada perfil tenga exactamente 8 puntos en temps y pwms, y que
    las listas sean monótonas (temp creciente, pwm no decreciente).
    """
    import copy
    # Validar antes de guardar
    for prof_name, prof in profiles.items():
        for fan in ("cpu", "gpu", "mid"):
            curve = prof.get(fan)
            if not isinstance(curve, dict):
                continue
            temps = curve.get("temps", [])
            pwms = curve.get("pwms", [])
            if len(temps) != 8 or len(pwms) != 8:
                raise ValueError(
                    f"Perfil {prof_name}/{fan}: se requieren exactamente 8 puntos "
                    f"(temps={len(temps)}, pwms={len(pwms)})"
                )
            for i in range(1, 8):
                if temps[i] <= temps[i - 1]:
                    raise ValueError(
                        f"Perfil {prof_name}/{fan}: temps no monótonas en pos {i} "
                        f"({temps[i-1]} → {temps[i]})"
                    )
                if pwms[i] < pwms[i - 1]:
                    raise ValueError(
                        f"Perfil {prof_name}/{fan}: pwms no monótonas en pos {i} "
                        f"({pwms[i-1]} → {pwms[i]})"
                    )
    existing = _load_raw()
    existing["profiles"] = profiles
    existing.setdefault("version", FAN_CURVES_SCHEMA_VERSION)
    _save_raw(existing)


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

    rog-thermal-guardian.sh (root) escribe GUARDIAN_STATE_FILE con el
    estado enriquecido (v12): mode, reason, updated, aggression,
    thermal_state, cooldown_remaining, interventions. Esta app solo lo lee;
    nunca escribe ahí ni asume que el guardián está instalado.
    Si el archivo falta o está viejo, "mode" es None (UI debe tratarlo como
    "desconocido/no instalado", no como silencio).
    """
    try:
        with open(GUARDIAN_STATE_FILE) as fh:
            data = json.load(fh) or {}
    except (OSError, ValueError):
        return {"mode": None, "running": False}
    updated = data.get("updated")
    fresh = isinstance(updated, (int, float)) and (time.time() - updated) < GUARDIAN_STATE_MAX_AGE
    if not fresh:
        return {"mode": None, "running": False}
    return {
        "mode": data.get("mode"),
        "running": True,
        "reason": data.get("reason"),
        "aggression": data.get("aggression"),
        "thermal_state": data.get("thermal_state"),
        "cooldown_remaining": data.get("cooldown_remaining", 0),
        "interventions": data.get("interventions", 0),
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


# ------------------------------------------------------------------
# CLI (retrocompatible): añade subcomandos sin cambiar los existentes.
#
# Subcomandos nuevos (v12):
#   fans profiles                   → imprime los 3 perfiles como JSON
#   fans profiles --profile <name>  → imprime solo ese perfil
#   fans write-profiles <json>      → guarda perfiles (JSON por stdin o arg)
#   fans defaults                   → imprime DEFAULT_FAN_CURVES completo
# ------------------------------------------------------------------

def _cli_profiles(args: list[str]) -> None:
    """Imprime perfiles del fan-curves.json (defaults si no existe)."""
    profile_filter = None
    i = 0
    while i < len(args):
        if args[i] == "--profile" and i + 1 < len(args):
            profile_filter = args[i + 1]
            i += 2
        else:
            i += 1
    profiles = load_profiles()
    if profile_filter:
        if profile_filter not in profiles:
            print(json.dumps({"error": f"Perfil desconocido: {profile_filter}"}))
            sys.exit(1)
        print(json.dumps({profile_filter: profiles[profile_filter]}, indent=2))
    else:
        print(json.dumps(profiles, indent=2))


def _cli_write_profiles(args: list[str]) -> None:
    """Lee JSON de stdin o del primer arg y guarda los perfiles."""
    if args:
        raw = args[0]
    else:
        raw = sys.stdin.read()
    try:
        profiles = json.loads(raw)
    except ValueError as e:
        print(json.dumps({"error": f"JSON inválido: {e}"}))
        sys.exit(1)
    if not isinstance(profiles, dict):
        print(json.dumps({"error": "Se espera un objeto JSON con perfiles"}))
        sys.exit(1)
    try:
        save_profiles(profiles)
    except ValueError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    print(json.dumps({"ok": True, "saved_profiles": list(profiles.keys())}))


def _cli_defaults(_args: list[str]) -> None:
    """Imprime las curvas por defecto (DEFAULT_FAN_CURVES) como JSON."""
    print(json.dumps(DEFAULT_FAN_CURVES, indent=2))


def _cli_all_config(_args: list[str]) -> None:
    """Imprime la config completa (caps + perfiles + version) como JSON."""
    print(json.dumps(load_all_config(), indent=2))


def main(argv: list[str] | None = None) -> None:
    """Punto de entrada CLI: python -m rog_monitor.fans <subcommand>."""
    args = argv if argv is not None else sys.argv[1:]
    if not args:
        print("Uso: fans profiles | write-profiles | defaults | all-config")
        sys.exit(1)
    cmd = args[0]
    rest = args[1:]
    dispatch = {
        "profiles": _cli_profiles,
        "write-profiles": _cli_write_profiles,
        "defaults": _cli_defaults,
        "all-config": _cli_all_config,
    }
    if cmd not in dispatch:
        print(json.dumps({"error": f"Subcomando desconocido: {cmd}"}))
        sys.exit(1)
    dispatch[cmd](rest)


if __name__ == "__main__":
    main()
