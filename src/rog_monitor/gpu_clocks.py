"""gpu_clocks.py — Helper NVML para offsets de reloj GPU en Wayland.

Usa ctypes directo a libnvidia-ml.so.1 (sin pip, sin nvidia-ml-py).
Funciona en Wayland con drivers NVIDIA recientes cuando NVML expone offsets.

Uso sin root (lectura):
    python3 -m rog_monitor.gpu_clocks read

Con root (escritura, vía pkexec → apply-gpu-clocks.sh):
    python3 -m rog_monitor.gpu_clocks set --core 100 --mem 500

Símbolos verificados en libnvidia-ml.so.1 (driver 610.43.02, RTX 4060):
    nvmlDeviceGetGpcClkVfOffset, nvmlDeviceSetGpcClkVfOffset
    nvmlDeviceGetMemClkVfOffset, nvmlDeviceSetMemClkVfOffset
    nvmlDeviceGetGpcClkMinMaxVfOffset, nvmlDeviceGetMemClkMinMaxVfOffset
"""

from __future__ import annotations

import ctypes
import ctypes.util
import json
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Rango seguro recomendado por defecto (no el tope absoluto del driver).
# El usuario puede ir más allá tras doble consentimiento.
# ---------------------------------------------------------------------------
SAFE_CORE_MAX_MHZ = 200    # rango absoluto: -1000..+1000
SAFE_MEM_MAX_MHZ  = 1000   # rango absoluto: -2000..+6000
SAFE_CORE_MIN_MHZ = -200   # undervolt moderado
SAFE_MEM_MIN_MHZ  = -500
# Tope absoluto: más allá del rango seguro solo con doble consentimiento en la UI,
# pero nunca fuera de esto.
ABS_CORE_MIN_MHZ, ABS_CORE_MAX_MHZ = -1000, 1000
ABS_MEM_MIN_MHZ,  ABS_MEM_MAX_MHZ  = -2000, 6000

# ---------------------------------------------------------------------------
# NVML types
# ---------------------------------------------------------------------------

# nvmlReturn_t
NVML_SUCCESS = 0
NVML_ERROR_NOT_SUPPORTED = 3
NVML_ERROR_NO_PERMISSION  = 15

# nvmlDevice_t es un puntero opaco
NvmlDeviceT = ctypes.c_void_p


class NvmlError(RuntimeError):
    def __init__(self, code: int, msg: str = ""):
        self.code = code
        super().__init__(msg or f"NVML error {code}")


# ---------------------------------------------------------------------------
# Carga de libnvidia-ml.so.1
# ---------------------------------------------------------------------------

def _load_nvml() -> ctypes.CDLL:
    """Carga libnvidia-ml. Lanza OSError si no está disponible."""
    # Rutas habituales en Linux (nvidia propietario).
    candidates = [
        "libnvidia-ml.so.1",
        "libnvidia-ml.so",
        "/usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1",
        "/usr/lib64/libnvidia-ml.so.1",
        "/usr/local/lib/libnvidia-ml.so.1",
    ]
    last_err: Exception | None = None
    for name in candidates:
        try:
            return ctypes.CDLL(name)
        except OSError as e:
            last_err = e
    raise OSError(f"No se encontró libnvidia-ml.so.1: {last_err}")


def _chk(lib: ctypes.CDLL, ret: int, op: str) -> None:
    if ret != NVML_SUCCESS:
        err_fn = getattr(lib, "nvmlErrorString", None)
        if err_fn:
            err_fn.restype = ctypes.c_char_p
            msg = err_fn(ret)
            msg = msg.decode() if isinstance(msg, bytes) else str(msg)
        else:
            msg = f"código {ret}"
        raise NvmlError(ret, f"{op}: {msg}")


# ---------------------------------------------------------------------------
# Inicialización / limpieza
# ---------------------------------------------------------------------------

def _nvml_init(lib: ctypes.CDLL) -> None:
    ret = lib.nvmlInit_v2() if hasattr(lib, "nvmlInit_v2") else lib.nvmlInit()
    _chk(lib, ret, "nvmlInit")


def _nvml_shutdown(lib: ctypes.CDLL) -> None:
    try:
        lib.nvmlShutdown()
    except Exception:
        pass


def _get_device(lib: ctypes.CDLL, index: int = 0) -> NvmlDeviceT:
    dev = NvmlDeviceT()
    ret = lib.nvmlDeviceGetHandleByIndex_v2(ctypes.c_uint(index), ctypes.byref(dev))
    _chk(lib, ret, f"nvmlDeviceGetHandleByIndex({index})")
    return dev


# ---------------------------------------------------------------------------
# Telemetría de solo lectura (sin root) para gpu.py — reemplaza a nvidia-smi
# ---------------------------------------------------------------------------

_LIB: ctypes.CDLL | None = None
NVML_FI_DEV_POWER_AVERAGE = 185  # mW, media ~1 s (= power.draw.average)


class _Util(ctypes.Structure):
    _fields_ = [("gpu", ctypes.c_uint), ("memory", ctypes.c_uint)]


class _Mem(ctypes.Structure):
    # nvmlMemory_v2: igual que nvidia-smi (used excluye la memoria reservada
    # por el driver; la v1 la cuenta como usada y daba ~300 MiB de más).
    _fields_ = [("version", ctypes.c_uint), ("total", ctypes.c_ulonglong),
                ("reserved", ctypes.c_ulonglong), ("free", ctypes.c_ulonglong),
                ("used", ctypes.c_ulonglong)]


class _FieldValue(ctypes.Structure):
    _fields_ = [("fieldId", ctypes.c_uint), ("scopeId", ctypes.c_uint),
                ("timestamp", ctypes.c_longlong), ("latencyUsec", ctypes.c_longlong),
                ("valueType", ctypes.c_uint), ("nvmlReturn", ctypes.c_uint),
                ("value", ctypes.c_ulonglong)]


class _ProcInfo(ctypes.Structure):
    _fields_ = [("pid", ctypes.c_uint), ("mem", ctypes.c_ulonglong),
                ("gi", ctypes.c_uint), ("ci", ctypes.c_uint)]


def _session():
    """(lib, dev) con nvmlInit hecho. El llamador DEBE hacer _nvml_shutdown(lib).

    Init/shutdown por lectura (~15 ms, sin fork): con el handle abierto entre
    ticks el driver cuenta un usuario y la dGPU híbrida nunca entra en D3.
    """
    global _LIB
    if _LIB is None:
        _LIB = _load_nvml()
    _nvml_init(_LIB)
    try:
        return _LIB, _get_device(_LIB, 0)
    except Exception:
        _nvml_shutdown(_LIB)
        raise


def read_telemetry() -> dict:
    """Mismos campos que `nvidia-smi --query-gpu` usaba en gpu.py (sin vendor).

    Lanza OSError (sin libnvidia-ml) o NvmlError (init falló). Un campo que el
    driver no soporta queda en None, igual que "[N/A]" en nvidia-smi.
    """
    lib, dev = _session()
    try:
        def num(fn, *args):
            val = ctypes.c_uint()
            return float(val.value) if fn(dev, *args, ctypes.byref(val)) == NVML_SUCCESS else None

        buf = ctypes.create_string_buffer(96)
        name = buf.value.decode(errors="replace") if lib.nvmlDeviceGetName(dev, buf, 96) == NVML_SUCCESS else ""
        util = _Util()
        util_ok = lib.nvmlDeviceGetUtilizationRates(dev, ctypes.byref(util)) == NVML_SUCCESS
        mem = _Mem()
        mem.version = ctypes.sizeof(_Mem) | (2 << 24)
        mem_ok = lib.nvmlDeviceGetMemoryInfo_v2(dev, ctypes.byref(mem)) == NVML_SUCCESS
        # power.draw.average (estable) con respaldo a la muestra instantánea
        fv = _FieldValue()
        fv.fieldId = NVML_FI_DEV_POWER_AVERAGE
        mw = None
        if lib.nvmlDeviceGetFieldValues(dev, 1, ctypes.byref(fv)) == NVML_SUCCESS \
                and fv.nvmlReturn == NVML_SUCCESS and fv.value:
            mw = float(fv.value)
        if mw is None:
            mw = num(lib.nvmlDeviceGetPowerUsage)
        return {
            "name": name,
            "temp": num(lib.nvmlDeviceGetTemperature, 0),   # NVML_TEMPERATURE_GPU
            "util": float(util.gpu) if util_ok else None,
            "power": round(mw / 1000, 2) if mw else None,
            "vram_used": float(round(mem.used / 1048576)) if mem_ok else None,
            "vram_total": float(round(mem.total / 1048576)) if mem_ok else None,
            "clock_mhz": num(lib.nvmlDeviceGetClockInfo, 0),      # NVML_CLOCK_GRAPHICS
            "vram_clock_mhz": num(lib.nvmlDeviceGetClockInfo, 2),  # NVML_CLOCK_MEM
        }
    finally:
        _nvml_shutdown(lib)


def read_vram_processes() -> list[dict]:
    """[{pid, vram_mb, type}] de procesos con VRAM (C = compute, G = gráficos)."""
    lib, dev = _session()
    try:
        rows = []
        for kind, fn in (("C", "nvmlDeviceGetComputeRunningProcesses_v3"),
                         ("G", "nvmlDeviceGetGraphicsRunningProcesses_v3")):
            count = ctypes.c_uint(64)
            arr = (_ProcInfo * 64)()
            if getattr(lib, fn)(dev, ctypes.byref(count), arr) != NVML_SUCCESS:
                continue
            for p in arr[:count.value]:
                if 0 < (p.mem >> 20) < 2 ** 40:  # N/A = 2^64-1
                    rows.append({"pid": int(p.pid), "vram_mb": int(p.mem >> 20), "type": kind})
        return rows
    finally:
        _nvml_shutdown(lib)


# ---------------------------------------------------------------------------
# Funciones públicas — offsets
# ---------------------------------------------------------------------------

def read_offsets(device_index: int = 0) -> dict:
    """Lee offsets actuales y rangos min/max. Sin root."""
    lib = _load_nvml()
    _nvml_init(lib)
    try:
        dev = _get_device(lib, device_index)

        # --- offset núcleo actual ---
        core_val = ctypes.c_int()
        r = lib.nvmlDeviceGetGpcClkVfOffset(dev, ctypes.byref(core_val))
        _chk(lib, r, "nvmlDeviceGetGpcClkVfOffset")

        # --- rango núcleo ---
        core_min_val = ctypes.c_int()
        core_max_val = ctypes.c_int()
        r = lib.nvmlDeviceGetGpcClkMinMaxVfOffset(
            dev, ctypes.byref(core_min_val), ctypes.byref(core_max_val)
        )
        _chk(lib, r, "nvmlDeviceGetGpcClkMinMaxVfOffset")

        # --- offset memoria actual ---
        mem_val = ctypes.c_int()
        r = lib.nvmlDeviceGetMemClkVfOffset(dev, ctypes.byref(mem_val))
        _chk(lib, r, "nvmlDeviceGetMemClkVfOffset")

        # --- rango memoria ---
        mem_min_val = ctypes.c_int()
        mem_max_val = ctypes.c_int()
        r = lib.nvmlDeviceGetMemClkMinMaxVfOffset(
            dev, ctypes.byref(mem_min_val), ctypes.byref(mem_max_val)
        )
        _chk(lib, r, "nvmlDeviceGetMemClkMinMaxVfOffset")

        return {
            "ok": True,
            "device_index": device_index,
            "core": {
                "value": int(core_val.value),
                "min": int(core_min_val.value),
                "max": int(core_max_val.value),
                "safe_min": SAFE_CORE_MIN_MHZ,
                "safe_max": SAFE_CORE_MAX_MHZ,
                "unit": "MHz",
            },
            "mem": {
                "value": int(mem_val.value),
                "min": int(mem_min_val.value),
                "max": int(mem_max_val.value),
                "safe_min": SAFE_MEM_MIN_MHZ,
                "safe_max": SAFE_MEM_MAX_MHZ,
                "unit": "MHz",
            },
        }
    finally:
        _nvml_shutdown(lib)


def validate_offsets(core_mhz: int, mem_mhz: int) -> tuple[int, int]:
    """Rechaza (no recorta) offsets fuera del tope ABSOLUTO: es una escritura a
    hardware, mejor fallar claro que aplicar otro valor. El rango SAFE_* lo
    impone la UI (pasarlo exige doble consentimiento), no esta función."""
    core, mem = int(core_mhz), int(mem_mhz)
    if not ABS_CORE_MIN_MHZ <= core <= ABS_CORE_MAX_MHZ:
        raise ValueError(
            f"offset core {core} MHz fuera del tope "
            f"{ABS_CORE_MIN_MHZ}..{ABS_CORE_MAX_MHZ} MHz")
    if not ABS_MEM_MIN_MHZ <= mem <= ABS_MEM_MAX_MHZ:
        raise ValueError(
            f"offset mem {mem} MHz fuera del tope "
            f"{ABS_MEM_MIN_MHZ}..{ABS_MEM_MAX_MHZ} MHz")
    return core, mem


def set_offsets(core_mhz: int, mem_mhz: int, device_index: int = 0) -> dict:
    """Escribe offsets. REQUIERE ROOT (llámalo desde apply-gpu-clocks.sh via pkexec)."""
    core_mhz, mem_mhz = validate_offsets(core_mhz, mem_mhz)
    # Doble recorte en Python (el script también recorta).
    data = read_offsets(device_index)

    core_min = data["core"]["min"]
    core_max = data["core"]["max"]
    mem_min  = data["mem"]["min"]
    mem_max  = data["mem"]["max"]

    core_clamped = max(core_min, min(core_max, int(core_mhz)))
    mem_clamped  = max(mem_min,  min(mem_max,  int(mem_mhz)))

    lib = _load_nvml()
    _nvml_init(lib)
    try:
        dev = _get_device(lib, device_index)

        r = lib.nvmlDeviceSetGpcClkVfOffset(dev, ctypes.c_int(core_clamped))
        _chk(lib, r, "nvmlDeviceSetGpcClkVfOffset")

        r = lib.nvmlDeviceSetMemClkVfOffset(dev, ctypes.c_int(mem_clamped))
        _chk(lib, r, "nvmlDeviceSetMemClkVfOffset")

        return {
            "ok": True,
            "core_applied": core_clamped,
            "mem_applied": mem_clamped,
            "core_requested": int(core_mhz),
            "mem_requested": int(mem_mhz),
        }
    finally:
        _nvml_shutdown(lib)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _cmd_read(args) -> int:
    try:
        result = read_offsets(args.device)
        print(json.dumps(result, indent=2))
        return 0
    except NvmlError as e:
        print(json.dumps({"ok": False, "err": str(e), "nvml_code": e.code}), file=sys.stderr)
        return 1
    except OSError as e:
        print(json.dumps({"ok": False, "err": f"NVML no disponible: {e}"}), file=sys.stderr)
        return 1


def _cmd_set(args) -> int:
    if os.geteuid() != 0:
        msg = "ERROR: set_offsets requiere root. Usa pkexec + apply-gpu-clocks.sh."
        print(json.dumps({"ok": False, "err": msg}), file=sys.stderr)
        return 1
    try:
        result = set_offsets(args.core, args.mem, args.device)
        print(json.dumps(result, indent=2))
        return 0
    except ValueError as e:
        print(json.dumps({"ok": False, "err": str(e)}), file=sys.stderr)
        return 1
    except NvmlError as e:
        print(json.dumps({"ok": False, "err": str(e), "nvml_code": e.code}), file=sys.stderr)
        return 1
    except OSError as e:
        print(json.dumps({"ok": False, "err": f"NVML no disponible: {e}"}), file=sys.stderr)
        return 1


def main(argv=None) -> int:
    import argparse
    parser = argparse.ArgumentParser(
        prog="python -m rog_monitor.gpu_clocks",
        description="Offsets de reloj GPU vía NVML (sin pip, ctypes).",
    )
    parser.add_argument("--device", type=int, default=0, metavar="IDX",
                        help="Índice de GPU (default 0).")

    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("read", help="Leer offsets actuales + rangos min/max (sin root).")

    set_p = sub.add_parser("set", help="Escribir offsets (REQUIERE ROOT).")
    set_p.add_argument("--core", type=int, required=True, metavar="MHz",
                        help=f"Offset del núcleo en MHz (rango absoluto: -1000..+1000).")
    set_p.add_argument("--mem", type=int, required=True, metavar="MHz",
                        help=f"Offset de memoria en MHz (rango absoluto: -2000..+6000).")

    parsed = parser.parse_args(argv)

    if parsed.cmd == "read":
        return _cmd_read(parsed)
    if parsed.cmd == "set":
        return _cmd_set(parsed)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
