"""Aura / RGB helpers: tool detection, saved profiles, and ASUS commands."""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import shutil
import socket
import subprocess
import time
from pathlib import Path

from .config import CONFIG_DIR

AURA_FILE = CONFIG_DIR / "aura.json"
HEX_RE = re.compile(r"^[0-9a-fA-F]{6}$")
BRIGHTNESS_LEVELS = ["off", "low", "med", "high"]
SPEED_LEVELS = ["low", "med", "high"]
DIRECTIONS = ["up", "down", "left", "right"]
PRIMARY_EFFECTS = ["static", "breathe", "rainbow-cycle", "rainbow-wave", "stars"]
ASUSCTL_CANDIDATES = [
    "asusctl",
    "/home/linuxbrew/.linuxbrew/bin/asusctl",
    "/usr/local/bin/asusctl",
    "/usr/bin/asusctl",
]
OPENRGB_CANDIDATES = [
    "openrgb",
    "/var/lib/flatpak/exports/bin/org.openrgb.OpenRGB",
    str(Path.home() / ".local/share/flatpak/exports/bin/org.openrgb.OpenRGB"),
    "/usr/bin/openrgb",
]

DEFAULTS = {
    "apply_on_startup": False,
    "startup_profile": None,
    "last_applied": {},
    "profiles": [],
}

EFFECT_META = {
    "static": {"label": "Static", "colours": 1},
    "breathe": {"label": "Respiracion", "colours": 2, "speed": True},
    "rainbow-cycle": {"label": "Color Cycle", "speed": True},
    "rainbow-wave": {"label": "Rainbow", "speed": True, "direction": True},
    "stars": {"label": "Starry Night", "colours": 2, "speed": True},
    "rain": {"label": "Lluvia", "speed": True},
    "highlight": {"label": "Highlight", "colours": 1, "speed": True},
    "laser": {"label": "Laser", "colours": 1, "speed": True},
    "ripple": {"label": "Ripple", "colours": 1, "speed": True},
    "pulse": {"label": "Pulse", "colours": 1, "speed": True},
    "comet": {"label": "Comet", "colours": 1, "speed": True},
    "flash": {"label": "Flash", "colours": 1, "speed": True},
}


def _merge(base: dict, extra: dict) -> dict:
    out = dict(base)
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _merge(out[key], value)
        else:
            out[key] = value
    return out


def _run(cmd: list[str], timeout: float = 5.0) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)
    output = "\n".join(part.strip() for part in (proc.stdout, proc.stderr) if part.strip()).strip()
    return proc.returncode == 0, output


def _find_binary(candidates: list[str]) -> str | None:
    for candidate in candidates:
        if "/" in candidate and os.path.exists(candidate):
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    return None


def _load_store() -> dict:
    try:
        with open(AURA_FILE) as fh:
            return _merge(DEFAULTS, json.load(fh))
    except (OSError, ValueError):
        return copy.deepcopy(DEFAULTS)


def _save_store(data: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(AURA_FILE, "w") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
        fh.write("\n")


def _normalize_colour(value: str | None, fallback: str = "ff5500") -> str:
    text = (value or fallback).strip().lstrip("#").lower()
    if not HEX_RE.fullmatch(text):
        raise ValueError(f"color inválido: {value!r}")
    return text


def _normalize_state(raw: dict) -> dict:
    effect = (raw.get("effect") or "static").strip()
    if effect not in EFFECT_META:
        raise ValueError(f"efecto no soportado: {effect}")

    meta = EFFECT_META[effect]
    brightness = (raw.get("brightness") or "high").strip().lower()
    if brightness not in BRIGHTNESS_LEVELS:
        raise ValueError(f"brillo inválido: {brightness}")

    state = {
        "driver": (raw.get("driver") or "asus").strip().lower(),
        "effect": effect,
        "brightness": brightness,
        "colour": _normalize_colour(raw.get("colour")),
        "colour2": _normalize_colour(raw.get("colour2"), "000000"),
        "speed": (raw.get("speed") or "med").strip().lower(),
        "direction": (raw.get("direction") or "right").strip().lower(),
        "zone": (raw.get("zone") or "").strip() or None,
    }

    if state["driver"] not in ("asus", "openrgb"):
        raise ValueError(f"driver no soportado: {state['driver']}")
    if state["speed"] not in SPEED_LEVELS:
        raise ValueError(f"velocidad inválida: {state['speed']}")
    if state["direction"] not in DIRECTIONS:
        raise ValueError(f"dirección inválida: {state['direction']}")

    if meta.get("colours", 1) < 2:
        state["colour2"] = None
    if not meta.get("speed"):
        state["speed"] = None
    if not meta.get("direction"):
        state["direction"] = None
    return state


class AuraManager:
    def __init__(self):
        self.asusctl = _find_binary(ASUSCTL_CANDIDATES)
        self.openrgb = _find_binary(OPENRGB_CANDIDATES)
        # pw-record / pw-cat (PipeWire nativo) capturan bien del monitor;
        # parec a menudo devuelve 0 bytes, así que va de último.
        self.music_source = (
            shutil.which("pw-record")
            or shutil.which("pw-cat")
            or shutil.which("parec")
        )
        self._effects = self._discover_effects()
        self._cache = None
        self._cache_ts = 0.0

    def _discover_effects(self) -> list[dict]:
        if not self.asusctl:
            return []
        ok, out = _run([self.asusctl, "aura", "effect", "--help"], timeout=2.0)
        if not ok:
            return [dict({"id": key}, **meta) for key, meta in EFFECT_META.items()]
        effect_ids = []
        commands = False
        for raw in out.splitlines():
            line = raw.strip()
            if not line:
                continue
            if line.startswith("Commands:"):
                commands = True
                continue
            if not commands:
                continue
            effect = line.split()[0]
            if effect in EFFECT_META:
                effect_ids.append(effect)
        if not effect_ids:
            effect_ids = list(EFFECT_META)
        return [dict({"id": key}, **EFFECT_META.get(key, {"label": key, "colours": 1})) for key in effect_ids]

    def _brightness(self) -> str | None:
        if not self.asusctl:
            return None
        ok, out = _run([self.asusctl, "leds", "get"], timeout=1.5)
        if not ok:
            return None
        for level in BRIGHTNESS_LEVELS:
            if level in out.lower():
                return level
        return None

    @staticmethod
    def _openrgb_sdk_available() -> bool:
        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.2)
            return sock.connect_ex(("127.0.0.1", 6742)) == 0
        except OSError:
            return False
        finally:
            if sock is not None:
                sock.close()

    def snapshot(self, force: bool = False) -> dict:
        now = time.monotonic()
        if not force and self._cache and now - self._cache_ts < 15:
            return copy.deepcopy(self._cache)

        store = _load_store()
        current = None
        last_applied = store.get("last_applied") or None
        if last_applied:
            try:
                current = _normalize_state(last_applied)
            except ValueError:
                current = None

        basic_effects = [fx for fx in self._effects if fx["id"] in PRIMARY_EFFECTS]
        extra_effects = [fx for fx in self._effects if fx["id"] not in PRIMARY_EFFECTS]

        result = {
            "available": bool(self.asusctl or self.openrgb),
            "asus": {
                "available": bool(self.asusctl),
                "binary": self.asusctl,
                "effects": self._effects,
                "basic_effects": basic_effects,
                "extra_effects": extra_effects,
                "brightness_levels": BRIGHTNESS_LEVELS,
                "current_brightness": self._brightness(),
                "hint": None if self.asusctl else "Instala asusctl/asusd para controlar Aura.",
            },
            "openrgb": {
                "available": bool(self.openrgb),
                "binary": self.openrgb,
                "sdk_port": 6742,
                "sdk_reachable": self._openrgb_sdk_available() if self.openrgb else False,
                "hint": (
                    None
                    if self.openrgb
                    else "OpenRGB no está instalado. En Bazzite/Flatpak: flatpak install flathub org.openrgb.OpenRGB"
                ),
            },
            "music": {
                "available": bool(self.music_source),
                "source": os.path.basename(self.music_source) if self.music_source else None,
            },
            "profiles": store.get("profiles", []),
            "apply_on_startup": bool(store.get("apply_on_startup")),
            "startup_profile": store.get("startup_profile"),
            "current": current,
            "config_path": str(AURA_FILE),
        }
        self._cache = result
        self._cache_ts = now
        return copy.deepcopy(result)


def apply_state(raw: dict) -> dict:
    mgr = AuraManager()
    state = _normalize_state(raw)
    if state["driver"] != "asus":
        return {
            "ok": False,
            "err": "OpenRGB aún no está activo en este equipo. Instálalo y levanta su SDK local para el periférico Redragon.",
        }
    if not mgr.asusctl:
        return {"ok": False, "err": "No encontré asusctl en el sistema."}

    commands = [[mgr.asusctl, "leds", "set", state["brightness"]]]
    cmd = [mgr.asusctl, "aura", "effect", state["effect"]]
    meta = EFFECT_META.get(state["effect"], {})
    if meta.get("colours", 0) >= 1 and state["colour"]:
        cmd.extend(["--colour", state["colour"]])
    if meta.get("colours", 0) >= 2 and state["colour2"]:
        cmd.extend(["--colour2", state["colour2"]])
    if meta.get("speed") and state["speed"]:
        cmd.extend(["--speed", state["speed"]])
    if meta.get("direction") and state["direction"]:
        cmd.extend(["--direction", state["direction"]])
    if state["zone"]:
        cmd.extend(["--zone", state["zone"]])
    commands.append(cmd)

    outputs = []
    for command in commands:
        ok, out = _run(command, timeout=6.0)
        if not ok:
            return {"ok": False, "err": out or "Falló el comando Aura", "command": command}
        if out:
            outputs.append(out)

    store = _load_store()
    store["last_applied"] = state
    _save_store(store)
    return {"ok": True, "state": state, "out": "\n".join(outputs).strip()}


def save_profile(name: str, raw_state: dict, apply_on_startup: bool | None = None,
                 startup_profile: str | None = None) -> dict:
    title = (name or "").strip()
    if not title:
        return {"ok": False, "err": "El perfil necesita un nombre."}
    state = _normalize_state(raw_state)
    store = _load_store()
    profiles = [p for p in store.get("profiles", []) if p.get("name", "").lower() != title.lower()]
    profiles.append({"name": title, "state": state})
    store["profiles"] = profiles
    if apply_on_startup is not None:
        store["apply_on_startup"] = bool(apply_on_startup)
    if startup_profile is not None:
        store["startup_profile"] = startup_profile or None
    _save_store(store)
    return {"ok": True, "profiles": profiles}


def delete_profile(name: str) -> dict:
    title = (name or "").strip().lower()
    if not title:
        return {"ok": False, "err": "Nombre de perfil vacío."}
    store = _load_store()
    profiles = [p for p in store.get("profiles", []) if p.get("name", "").lower() != title]
    removed = len(profiles) != len(store.get("profiles", []))
    store["profiles"] = profiles
    startup_name = (store.get("startup_profile") or "").lower()
    if startup_name == title:
        store["startup_profile"] = None
        store["apply_on_startup"] = False
    _save_store(store)
    return {"ok": removed, "profiles": profiles, "err": None if removed else "Perfil no encontrado."}


def set_startup_profile(name: str | None, enabled: bool) -> dict:
    store = _load_store()
    selected = (name or "").strip() or None
    if enabled and selected:
        names = {p.get("name") for p in store.get("profiles", [])}
        if selected not in names:
            return {"ok": False, "err": f'No existe el perfil "{selected}".'}
    store["apply_on_startup"] = bool(enabled and selected)
    store["startup_profile"] = selected if enabled else None
    _save_store(store)
    return {"ok": True, "apply_on_startup": store["apply_on_startup"], "startup_profile": store["startup_profile"]}


def apply_startup_profile() -> dict:
    store = _load_store()
    if not store.get("apply_on_startup") or not store.get("startup_profile"):
        return {"ok": True, "skipped": True}
    for profile in store.get("profiles", []):
        if profile.get("name") == store["startup_profile"]:
            return apply_state(profile.get("state") or {})
    return {"ok": False, "err": f'No encontré el perfil de inicio "{store["startup_profile"]}".'}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m rog_monitor.aura")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("state")

    apply_p = sub.add_parser("apply")
    apply_p.add_argument("--json", required=True)

    save_p = sub.add_parser("save-profile")
    save_p.add_argument("--name", required=True)
    save_p.add_argument("--json", required=True)

    del_p = sub.add_parser("delete-profile")
    del_p.add_argument("--name", required=True)

    start_p = sub.add_parser("set-startup")
    start_p.add_argument("--name", default="")
    start_p.add_argument("--enabled", action="store_true")

    sub.add_parser("apply-startup")

    args = parser.parse_args(argv)
    if args.cmd == "state":
        print(json.dumps(AuraManager().snapshot(force=True)))
        return 0
    if args.cmd == "apply":
        print(json.dumps(apply_state(json.loads(args.json))))
        return 0
    if args.cmd == "save-profile":
        print(json.dumps(save_profile(args.name, json.loads(args.json))))
        return 0
    if args.cmd == "delete-profile":
        print(json.dumps(delete_profile(args.name)))
        return 0
    if args.cmd == "set-startup":
        print(json.dumps(set_startup_profile(args.name, args.enabled)))
        return 0
    if args.cmd == "apply-startup":
        print(json.dumps(apply_startup_profile()))
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
