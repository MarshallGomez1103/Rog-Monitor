"""Minimal i18n: Spanish and English UI strings."""

import os

STRINGS = {
    "es": {
        "profile": "PERFIL",
        "asus_profile": "Perfil ASUS",
        "ppd_profile": "Perfil energía",
        "epp": "EPP",
        "governor": "Governor",
        "governor_note": "(powersave es normal con {driver})",
        "cpu": "CPU",
        "avg": "Promedio",
        "max": "Máximo",
        "min": "Mínimo",
        "package": "Package",
        "hot_cores": ">90°C",
        "cores_suffix": "núcleos",
        "freq": "Frecuencia",
        "power": "Potencia",
        "power_na_hint": "ejecuta enable-cpu-power.sh (sudo)",
        "throttle": "Throttling",
        "events_suffix": "eventos",
        "gpu": "GPU",
        "gpu_mode": "Modo",
        "gpu_off": "dGPU apagada (modo Integrated)",
        "model": "Modelo",
        "temp": "Temp",
        "usage": "Uso",
        "vram": "VRAM",
        "fans": "VENTILADORES",
        "fan_stopped": "detenido",
        "history": "HISTORIAL",
        "cpu_temp_graph": "CPU °C",
        "gpu_temp_graph": "GPU °C",
        "cpu_power_graph": "CPU W",
        "avg_1m": "1m",
        "avg_5m": "5m",
        "avg_15m": "15m",
        "system": "SISTEMA",
        "ram": "RAM",
        "swap": "Swap",
        "disk": "Disco /",
        "net": "Red",
        "battery": "Batería",
        "charge_limit": "límite",
        "load": "Carga",
        "uptime": "Uptime",
        "thermal_state": "Estado térmico",
        "state_cold": "FRÍO",
        "state_normal": "NORMAL",
        "state_hot": "CALIENTE",
        "state_critical": "CRÍTICO",
        "events": "EVENTOS",
        "no_events": "sin eventos",
        "keys": "q salir · p perfil · g GPU · t tema · e exportar · h ayuda",
        "help_title": "AYUDA",
        "help_body": (
            "q  salir\n"
            "p  cambiar perfil (power-saver → balanced → performance)\n"
            "g  cambiar GPU (Hybrid ↔ Integrated, requiere cerrar sesión)\n"
            "t  cambiar tema\n"
            "e  exportar historial (JSON + CSV)\n"
            "h  cerrar esta ayuda"
        ),
        "profile_set": "Perfil cambiado a {p}",
        "gpu_mode_set": "Modo GPU solicitado: {m} (cierra sesión para aplicar)",
        "gpu_mode_err": "No se pudo cambiar el modo GPU",
        "exported": "Exportado a {path}",
        "alert_cpu": "CPU caliente: {v}°C",
        "alert_gpu": "GPU caliente: {v}°C",
        "alert_throttle": "Thermal throttling detectado (paquete CPU)",
        "alert_fan": "Ventilador {f} detenido con CPU a {v}°C",
        "alert_power": "Potencia CPU anómala: {v} W",
    },
    "en": {
        "profile": "PROFILE",
        "asus_profile": "ASUS profile",
        "ppd_profile": "Power profile",
        "epp": "EPP",
        "governor": "Governor",
        "governor_note": "(powersave is normal with {driver})",
        "cpu": "CPU",
        "avg": "Average",
        "max": "Max",
        "min": "Min",
        "package": "Package",
        "hot_cores": ">90°C",
        "cores_suffix": "cores",
        "freq": "Frequency",
        "power": "Power",
        "power_na_hint": "run enable-cpu-power.sh (sudo)",
        "throttle": "Throttling",
        "events_suffix": "events",
        "gpu": "GPU",
        "gpu_mode": "Mode",
        "gpu_off": "dGPU off (Integrated mode)",
        "model": "Model",
        "temp": "Temp",
        "usage": "Usage",
        "vram": "VRAM",
        "fans": "FANS",
        "fan_stopped": "stopped",
        "history": "HISTORY",
        "cpu_temp_graph": "CPU °C",
        "gpu_temp_graph": "GPU °C",
        "cpu_power_graph": "CPU W",
        "avg_1m": "1m",
        "avg_5m": "5m",
        "avg_15m": "15m",
        "system": "SYSTEM",
        "ram": "RAM",
        "swap": "Swap",
        "disk": "Disk /",
        "net": "Net",
        "battery": "Battery",
        "charge_limit": "limit",
        "load": "Load",
        "uptime": "Uptime",
        "thermal_state": "Thermal state",
        "state_cold": "COOL",
        "state_normal": "NORMAL",
        "state_hot": "HOT",
        "state_critical": "CRITICAL",
        "events": "EVENTS",
        "no_events": "no events",
        "keys": "q quit · p profile · g GPU · t theme · e export · h help",
        "help_title": "HELP",
        "help_body": (
            "q  quit\n"
            "p  cycle profile (power-saver → balanced → performance)\n"
            "g  toggle GPU (Hybrid ↔ Integrated, logout required)\n"
            "t  cycle theme\n"
            "e  export history (JSON + CSV)\n"
            "h  close this help"
        ),
        "profile_set": "Profile set to {p}",
        "gpu_mode_set": "GPU mode requested: {m} (log out to apply)",
        "gpu_mode_err": "Could not change GPU mode",
        "exported": "Exported to {path}",
        "alert_cpu": "CPU hot: {v}°C",
        "alert_gpu": "GPU hot: {v}°C",
        "alert_throttle": "Thermal throttling detected (CPU package)",
        "alert_fan": "Fan {f} stopped while CPU at {v}°C",
        "alert_power": "Abnormal CPU power: {v} W",
    },
}


def detect_lang() -> str:
    lang = os.environ.get("LANG", "")
    return "es" if lang.lower().startswith("es") else "en"


class Translator:
    def __init__(self, lang: str | None = None):
        self.lang = lang if lang in STRINGS else detect_lang()

    def __call__(self, key: str, **kw) -> str:
        text = STRINGS.get(self.lang, STRINGS["en"]).get(key) or STRINGS["en"].get(key, key)
        return text.format(**kw) if kw else text
