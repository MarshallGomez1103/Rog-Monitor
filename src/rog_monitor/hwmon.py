"""Direct sysfs hwmon access: fast, silent, no external processes."""

from pathlib import Path

HWMON_ROOT = Path("/sys/class/hwmon")


def read_str(path: Path) -> str | None:
    try:
        return path.read_text().strip()
    except (OSError, ValueError):
        return None


def read_int(path: Path) -> int | None:
    raw = read_str(path)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def scan() -> dict[str, list[Path]]:
    """Map hwmon chip name -> list of device paths."""
    chips: dict[str, list[Path]] = {}
    if not HWMON_ROOT.is_dir():
        return chips
    for dev in sorted(HWMON_ROOT.iterdir()):
        name = read_str(dev / "name")
        if name:
            chips.setdefault(name, []).append(dev)
    return chips


def find(chips: dict[str, list[Path]], *names: str) -> Path | None:
    for name in names:
        if chips.get(name):
            return chips[name][0]
    return None


def temps(dev: Path) -> dict[str, float]:
    """All temp sensors of a chip as {label_or_index: celsius}."""
    out: dict[str, float] = {}
    for inp in sorted(dev.glob("temp*_input")):
        value = read_int(inp)
        if value is None:
            continue
        label = read_str(dev / inp.name.replace("_input", "_label")) or inp.name[: -len("_input")]
        out[label] = value / 1000.0
    return out


def fans(dev: Path) -> dict[str, int]:
    """All fan sensors of a chip as {label_or_index: rpm}."""
    out: dict[str, int] = {}
    for inp in sorted(dev.glob("fan*_input")):
        rpm = read_int(inp)
        if rpm is None:
            continue
        label = read_str(dev / inp.name.replace("_input", "_label")) or inp.name[: -len("_input")]
        out[label] = rpm
    return out
