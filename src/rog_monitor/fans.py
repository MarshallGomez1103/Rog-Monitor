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
from .config import CONFIG_DIR, DATA_DIR, backup_corrupt, write_atomic

# Sensible startup maximums for ASUS gaming laptops; auto-raised when exceeded.
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
# Tolerancia (s) a un `updated` ligeramente en el futuro (deriva entre el
# reloj del guardián y el de la app). Más allá, un `updated` futuro (reloj
# movido / salto NTP) NO es fresco: antes daba edad negativa < MAX_AGE y el
# guardián figuraba "vivo" (y el tope de Gaming aplicado) indefinidamente.
GUARDIAN_CLOCK_SKEW = 5.0
# JSON cap keys (cpu/gpu/mid) → hwmon fan labels.
CAP_KEY = {"cpu_fan": "cpu", "gpu_fan": "gpu", "mid_fan": "mid"}

# ------------------------------------------------------------------
# Curvas por defecto v22 — idénticas a default_curve_for() de
# scripts/rog-profile-sync.sh (el test test_fan_defaults lo exige).
#
# Formato por perfil y zona: {"temps": [t1..t8], "pwms": [p1..p8]}
# (8 puntos, temps estrictamente crecientes, pwms no decrecientes).
#
# Arrancan en 50 °C (este equipo nunca baja de ~50 en uso; por debajo el EC
# mantiene el punto 1) y reparten los 8 puntos en el rango que sí se usa.
# Mismo reparto de temperaturas en los tres perfiles; solo cambia la altura:
#   75 °C (CPU) → performance 50 % · balanced 42 % · quiet 32 %
#   96 °C (CPU) → performance 100 % · balanced 88 % · quiet 72 %
# La GPU usa 50..87 °C (su techo de fábrica es 87). El cap_rpm por perfil
# se aplica encima, al escribir al hardware.
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
                "temps": [50, 58, 64, 70, 75, 79, 83, 87],
                "pwms":  [46, 66, 97, 127, 168, 209, 242, 255],
            },
            "mid": {
                "temps": [50, 60, 68, 75, 82, 88, 92, 96],
                "pwms":  [46, 66, 97, 127, 168, 209, 242, 255],
            },
            "cpu": {
                "temps": [50, 60, 68, 75, 82, 88, 92, 96],
                "pwms":  [46, 66, 97, 127, 168, 209, 242, 255],
            },
        },
        "balanced": {
            "cap_rpm": {"cpu": 5500, "gpu": 5500, "mid": 5500},
            "gpu": {
                "temps": [50, 58, 64, 70, 75, 79, 83, 87],
                "pwms":  [33, 51, 76, 107, 143, 178, 209, 224],
            },
            "mid": {
                "temps": [50, 60, 68, 75, 82, 88, 92, 96],
                "pwms":  [33, 51, 76, 107, 143, 178, 209, 224],
            },
            "cpu": {
                "temps": [50, 60, 68, 75, 82, 88, 92, 96],
                "pwms":  [33, 51, 76, 107, 143, 178, 209, 224],
            },
        },
        "quiet": {
            "cap_rpm": {"cpu": 4500, "gpu": 4500, "mid": 4500},
            "gpu": {
                "temps": [50, 58, 64, 70, 75, 79, 83, 87],
                "pwms":  [20, 36, 56, 82, 112, 143, 168, 184],
            },
            "mid": {
                "temps": [50, 60, 68, 75, 82, 88, 92, 96],
                "pwms":  [20, 36, 56, 82, 112, 143, 168, 184],
            },
            "cpu": {
                "temps": [50, 60, 68, 75, 82, 88, 92, 96],
                "pwms":  [20, 36, 56, 82, 112, 143, 168, 184],
            },
        },
    },
}


# ------------------------------------------------------------------
# Funciones de lectura/escritura del JSON de curvas
# ------------------------------------------------------------------

def _load_raw() -> dict:
    """Carga fan-curves.json tal cual (sin defaults). Retorna {} si no existe.

    Si el JSON está corrupto se respalda a `.corrupt-<fecha>.bak` (una vez)
    antes de devolver {}, para que un guardado posterior no pierda
    cap_rpm/calibration/max_rpm sin dejar rastro.
    """
    try:
        with open(FAN_CURVES_FILE) as fh:
            data = json.load(fh)
    except OSError:
        return {}
    except ValueError:
        backup_corrupt(FAN_CURVES_FILE)
        return {}
    if not isinstance(data, dict):
        backup_corrupt(FAN_CURVES_FILE)
        return {}
    return data


def _save_raw(data: dict) -> None:
    """Guarda data en fan-curves.json (atómico, crea CONFIG_DIR si hace falta)."""
    write_atomic(FAN_CURVES_FILE, json.dumps(data, indent=2, sort_keys=True) + "\n")


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
    Mezcla sobre el JSON existente: preserva toda clave que no venga en `data`
    (calibration, max_rpm, gaming_cap_rpm...).
    """
    # Mezcla sobre lo existente: las claves que no gestionamos (gaming_cap_rpm,
    # calibration, max_rpm, ...) sobreviven; lo que venga en `data` gana.
    merged = {**_load_raw(), **data}
    merged.setdefault("version", FAN_CURVES_SCHEMA_VERSION)
    _save_raw(merged)


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


def _state_is_fresh(updated, now: float | None = None) -> bool:
    """True si `updated` (epoch) es reciente: -GUARDIAN_CLOCK_SKEW <= edad
    < GUARDIAN_STATE_MAX_AGE. El límite superior es estricto, igual que en
    rog-profile-sync.sh. Bool/NaN/no numérico → False."""
    if isinstance(updated, bool) or not isinstance(updated, (int, float)):
        return False
    age = (time.time() if now is None else now) - updated
    return -GUARDIAN_CLOCK_SKEW <= age < GUARDIAN_STATE_MAX_AGE


def _gaming_cap() -> int | None:
    """Tope de Gaming (`gaming_cap_rpm`) si el guardián está en modo gaming y
    fresco; mismo criterio que rog-profile-sync.sh. Solo lectura."""
    try:
        with open(FAN_CURVES_FILE) as fh:
            cap = (json.load(fh) or {}).get("gaming_cap_rpm")
        with open(GUARDIAN_STATE_FILE) as fh:
            st = json.load(fh) or {}
        if (isinstance(cap, (int, float)) and cap > 0
                and st.get("guardian_mode") == "gaming"
                and _state_is_fresh(st.get("updated"))):
            return int(cap)
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return None


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
    gaming = _gaming_cap() if name == "cap_rpm" else None
    out = {}
    for label, key in CAP_KEY.items():
        value = gaming or section.get(key)
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
    if not _state_is_fresh(updated):
        return {"mode": None, "running": False}
    return {
        "mode": data.get("mode"),
        "running": True,
        "reason": data.get("reason"),
        "aggression": data.get("aggression"),
        "thermal_state": data.get("thermal_state"),
        "cooldown_remaining": data.get("cooldown_remaining", 0),
        "interventions": data.get("interventions", 0),
        # Guardián 2.0 (campos nuevos, opcionales; los anteriores no cambian).
        "configured_mode": data.get("configured_mode"),
        "dry": bool(data.get("dry", 0)),
        "last_decision": data.get("last_decision"),
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
        self._gaming = _gaming_cap()
        self._dirty = False

    @staticmethod
    def _curves_mtime() -> float:
        try:
            return FAN_CURVES_FILE.stat().st_mtime
        except OSError:
            return 0.0

    def _maybe_reload_caps(self, profile: str | None = None) -> None:
        mtime = self._curves_mtime()
        gaming = _gaming_cap()  # el guardián puede entrar/salir de gaming sin tocar el JSON
        if mtime != self._caps_mtime or profile != self._active_profile or gaming != self._gaming:
            self._gaming = gaming
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
