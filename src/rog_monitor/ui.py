"""Dashboard rendering with Rich: panels, bars, graphs, themes."""

from rich.console import Group
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

THEMES = {
    "rog": {
        "accent": "bold red",
        "key": "bold red",
        "border": "grey35",
        "title": "bold white",
        "dim": "grey58",
        "bar": "red",
        "graph_cpu": "cyan",
        "graph_gpu": "green",
        "graph_power": "magenta",
    },
    "ice": {
        "accent": "bold cyan",
        "key": "bold cyan",
        "border": "blue",
        "title": "bold white",
        "dim": "grey58",
        "bar": "cyan",
        "graph_cpu": "bright_blue",
        "graph_gpu": "bright_cyan",
        "graph_power": "white",
    },
    "matrix": {
        "accent": "bold green",
        "key": "bold bright_green",
        "border": "dark_green",
        "title": "bold bright_green",
        "dim": "green",
        "bar": "green",
        "graph_cpu": "bright_green",
        "graph_gpu": "green",
        "graph_power": "yellow",
    },
}

DEFAULT_LIMITS = [70, 85, 92]


def temp_style(temp: float | None, limits: list | None = None) -> str:
    if temp is None:
        return "grey58"
    # frío=azul, normal=verde, cerca del límite=naranja, crítico=rojo
    lo, mid, hi = (limits or DEFAULT_LIMITS)[:3]
    if temp < lo:
        return "bright_blue"
    if temp < mid:
        return "green"
    if temp < hi:
        return "dark_orange"
    return "bold red"


def bar(percent: float | None, width: int = 18, style: str = "red") -> Text:
    pct = max(0.0, min(100.0, percent or 0))
    filled = int(width * pct / 100)
    text = Text()
    text.append("█" * filled, style=style)
    text.append("░" * (width - filled), style="grey30")
    return text


def _fmt(value, suffix="", nd=1):
    if value is None:
        return Text("N/A", style="grey58")
    if isinstance(value, float):
        value = round(value, nd)
    return Text(f"{value}{suffix}")


def _temp_text(temp, limits) -> Text:
    if temp is None:
        return _fmt(None)
    return Text(f"{temp:.0f}°C", style=temp_style(temp, limits))


def _kv(table: Table, key: str, value) -> None:
    table.add_row(Text(key, style="grey74"), value if isinstance(value, Text) else Text(str(value)))


def _grid() -> Table:
    table = Table.grid(padding=(0, 1))
    table.add_column(min_width=11)
    table.add_column()
    return table


def keys_bar(t, th, message: str = "") -> Text:
    text = Text(justify="center")
    if message:
        text.append(message + "   ", style="bold yellow")
    pairs = t("keys_pairs")
    for i, (key, label) in enumerate(pairs):
        if i:
            text.append("  ·  ", style="grey30")
        text.append(key, style=th["key"])
        text.append(f" {label}", style="grey58")
    return text


def cpu_panel(state, t, th) -> Panel:
    cpu = state["cpu"]
    limits = state["limits"]["cpu"]
    table = _grid()
    avg = cpu["avg"]
    _kv(table, t("avg"), Text(f"{avg}°C", style=temp_style(avg, limits)) if avg is not None else _fmt(None))
    _kv(table, t("max"), _fmt(cpu["max"], "°C"))
    _kv(table, t("min"), _fmt(cpu["min"], "°C"))
    _kv(table, t("package"), _temp_text(cpu["package"], limits))
    _kv(table, t("hot_cores"), f"{cpu['hot90']} {t('cores_suffix')}")
    _kv(table, t("freq"), _fmt(cpu["freq_ghz"], " GHz", 2))

    watts = state["cpu_watts"]
    if state["rapl_available"]:
        _kv(table, t("power"), _fmt(watts, " W"))
    else:
        _kv(table, t("power"), Text(t("power_na_hint"), style="grey58"))
    _kv(table, t("throttle"), f"{cpu['throttle_count']} {t('events_suffix')}")

    title = Text(f" {t('cpu')} ", style=th["title"])
    subtitle = Text(cpu["model"][:40], style=th["dim"])
    return Panel(table, title=title, subtitle=subtitle, border_style=th["border"])


def gpu_panel(state, t, th) -> Panel:
    info = state["gpu"]
    active = info.get("active")
    limits = state["limits"]["gpu"]
    table = _grid()

    mode = Text(info.get("mode") or "N/A", style=th["accent"])
    if info.get("pending"):
        mode.append(f" → {info['pending']}", style="bold yellow")
        mode.append(f" ({t('gpu_pending')})", style="grey58")
    _kv(table, t("gpu_mode"), mode)
    if info.get("supported"):
        _kv(table, t("gpu_modes_avail"), Text(" · ".join(info["supported"]), style="grey58"))

    if active:
        _kv(table, t("model"), active.get("name") or "N/A")
        _kv(table, t("temp"), _temp_text(active.get("temp"), limits))
        util = active.get("util")
        if util is not None:
            row = Text()
            row.append_text(bar(util, 14, th["bar"]))
            row.append(f" {util:.0f}%")
            _kv(table, t("usage"), row)
        _kv(table, t("power"), _fmt(active.get("power"), " W"))
        clock, vclock = active.get("clock_mhz"), active.get("vram_clock_mhz")
        if clock is not None:
            freq = Text(f"{clock:.0f} MHz")
            if vclock is not None:
                freq.append(f"  (VRAM {vclock:.0f} MHz)", style="grey58")
            _kv(table, t("freq"), freq)
        used, total = active.get("vram_used"), active.get("vram_total")
        if used is not None and total:
            _kv(table, t("vram"), f"{used:.0f} / {total:.0f} MiB")
    else:
        table.add_row(Text(t("gpu_off"), style="grey58"), Text(""))
    return Panel(table, title=Text(f" {t('gpu')} ", style=th["title"]), border_style=th["border"])


def fans_panel(state, t, th) -> Panel:
    table = Table.grid(padding=(0, 1))
    table.add_column(min_width=9)
    table.add_column()
    table.add_column(justify="right", min_width=10)
    for fan in state["fans"]:
        label = fan["label"].replace("_fan", "").upper()
        rpm_text = Text(f"{fan['rpm']} RPM")
        if fan["rpm"] == 0:
            rpm_text = Text(f"0 RPM ({t('fan_stopped')})", style="grey58")
        table.add_row(
            Text(label, style="grey74"),
            bar(fan["percent"], 18, th["bar"]),
            rpm_text,
        )
    return Panel(table, title=Text(f" {t('fans')} ", style=th["title"]), border_style=th["border"])


def profile_panel(state, t, th) -> Panel:
    cpu = state["cpu"]
    table = _grid()
    _kv(table, t("asus_profile"), Text(state["asus_profile"] or "N/A", style=th["accent"]))
    _kv(table, t("ppd_profile"), Text(state["ppd_profile"] or "N/A", style=th["accent"]))
    _kv(table, t("epp"), cpu["epp"] or "N/A")
    gov = Text(cpu["governor"] or "N/A")
    if cpu["governor"] == "powersave" and (cpu["driver"] or "").endswith("pstate"):
        gov.append(f" {t('governor_note', driver=cpu['driver'])}", style="grey58")
    _kv(table, t("governor"), gov)

    battery = state["battery"]
    if battery and battery.get("capacity") is not None:
        text = Text()
        if battery.get("on_ac"):
            text.append(f"⚡ {t('on_ac')}  ", style="bold green")
        else:
            text.append(f"🔋 {t('on_battery')}  ", style="bold yellow")
        text.append(f"{battery['capacity']}% ", style="bold")
        text.append(f"({battery.get('status') or '?'}", style="grey58")
        if battery.get("charge_limit"):
            text.append(f", {t('charge_limit')} {battery['charge_limit']}%", style="grey58")
        text.append(")", style="grey58")
        if battery.get("watts") and not battery.get("on_ac"):
            text.append(f" {battery['watts']} W", style="yellow")
        _kv(table, t("battery"), text)
    return Panel(table, title=Text(f" {t('profile')} ", style=th["title"]), border_style=th["border"])


def _graph_block(title: str, serie, width: int, style: str, th) -> Group:
    from . import graph

    values = serie.values()
    rows = graph.render(values, width - 6, height=4)
    hi, lo = graph.axis_labels(values, width - 6)
    header = Text(title, style=th["dim"])
    last = serie.last()
    if last is not None:
        header.append(f"  {last:.1f}", style="bold")
        for label, secs in (("1m", 60), ("5m", 300), ("15m", 900)):
            avg = serie.avg(secs)
            if avg is not None:
                header.append(f"  {label}:{avg:.0f}", style="grey58")
    lines = [header]
    for i, row in enumerate(rows):
        prefix = f"{hi:>4} " if i == 0 else (f"{lo:>4} " if i == len(rows) - 1 else "     ")
        line = Text(prefix, style="grey58")
        line.append(row, style=style)
        lines.append(line)
    return Group(*lines)


def history_panel(state, t, th, console_width: int) -> Panel:
    series = state["series"]
    blocks = [("cpu_temp_graph", "cpu_temp", "graph_cpu")]
    if series["gpu_temp"].values():
        blocks.append(("gpu_temp_graph", "gpu_temp", "graph_gpu"))
    if series["cpu_power"].values():
        blocks.append(("cpu_power_graph", "cpu_power", "graph_power"))
    if series["gpu_power"].values():
        blocks.append(("gpu_power_graph", "gpu_power", "graph_gpu"))

    width = max(24, (console_width - 8) // len(blocks))
    table = Table.grid(padding=(0, 2))
    for _ in blocks:
        table.add_column()
    table.add_row(
        *[
            _graph_block(t(label), series[key], width, th[style], th)
            for label, key, style in blocks
        ]
    )
    return Panel(table, title=Text(f" {t('history')} ", style=th["title"]), border_style=th["border"])


def system_panel(state, t, th) -> Panel:
    info = state["sys"]
    table = Table.grid(padding=(0, 2))
    for _ in range(3):
        table.add_column()

    ram = Text()
    ram.append_text(bar(info["ram_percent"], 12, th["bar"]))
    ram.append(f" {info['ram_used_gb']:.1f}/{info['ram_total_gb']:.0f}G")

    net = Text(f"↓{info['rx_mbps']:.1f} ↑{info['tx_mbps']:.1f} Mb/s")
    load = Text(f"{info['load'][0]:.2f} {info['load'][1]:.2f} {info['load'][2]:.2f}")
    load.append(f"  ·  {t('uptime')} {info['uptime_h']:.1f}h", style="grey58")

    table.add_row(
        Text(f"{t('ram')} ", style="grey74") + ram,
        Text(f"{t('net')} ", style="grey74") + net,
        Text(f"{t('load')} ", style="grey74") + load,
    )

    disks = Table.grid(padding=(0, 1))
    disks.add_column(min_width=11)
    disks.add_column()
    disks.add_column()
    for disk in info["disks"]:
        usage = Text(f" {disk['used_gb']:.0f}/{disk['total_gb']:.0f}G ({disk['percent']}%)")
        if info["nvme_temps"] and disk["mount"] in ("/", "/var/home", "/home"):
            usage.append(f" · NVMe {max(info['nvme_temps']):.0f}°C", style="grey58")
        disks.add_row(
            Text(disk["label"], style="grey74"),
            bar(disk["percent"], 18, th["bar"]),
            usage,
        )

    return Panel(Group(table, disks), title=Text(f" {t('system')} ", style=th["title"]),
                 border_style=th["border"])


def processes_panel(state, t, th) -> Panel:
    table = Table.grid(padding=(0, 2))
    table.add_column(min_width=7, justify="right")
    table.add_column(min_width=26)
    table.add_column(min_width=9, justify="right")
    table.add_column(justify="right")
    table.add_row(
        Text("PID", style="grey42"), Text(t("proc_name"), style="grey42"),
        Text(t("proc_cpu"), style="grey42"), Text(t("proc_ram"), style="grey42"),
    )
    for proc in state["procs"]:
        table.add_row(
            Text(str(proc["pid"]), style="grey58"),
            Text(proc["name"]),
            Text(f"{proc['cpu']:.1f}%", style=th["accent"]),
            Text(f"{proc['mem_mb']} MB", style="grey74"),
        )
    return Panel(table, title=Text(f" {t('processes')} ", style=th["title"]),
                 border_style=th["border"])


def events_panel(state, t, th, full: bool = False) -> Panel:
    events = list(state["events"])
    if not full:
        events = events[-4:]
    if events:
        lines = []
        for stamp, level, message in events:
            style = {"crit": "bold red", "warn": "yellow"}.get(level, "grey74")
            line = Text(f"{stamp}  ", style="grey58")
            line.append(message, style=style)
            lines.append(line)
        body = Group(*lines)
    else:
        body = Text(t("no_events"), style="grey58")
    title = t("events_all_title") if full else t("events")
    subtitle = None if full else Text(t("events_hint"), style=th["dim"])
    return Panel(body, title=Text(f" {title} ", style=th["title"]),
                 subtitle=subtitle, border_style=th["border"])


def power_control_line(state, t, th) -> Text | None:
    """Compact read-only one-liner showing live power/thermal knob values.

    Returns None when no power_control data is available (so build() can skip it).
    Format:  POTENCIA  PL1 140 W  ·  PL2 175 W  ·  Dynamic Boost 25 W  ·  Techo térmico 87 °C
    GPU clock offsets are omitted (they are always locked on Wayland).
    """
    pc = state.get("power_control")
    if not pc:
        return None

    raw = pc.get("controls", {})
    controls = raw if isinstance(raw, dict) else {c["key"]: c for c in raw}

    def _fmt_ctrl(key: str, label_key: str) -> str | None:
        ctrl = controls.get(key)
        if ctrl is None:
            return None
        val = ctrl.get("value")
        unit = ctrl.get("unit", "")
        if val is None:
            return f"{t(label_key)} {t('power_na')}"
        return f"{t(label_key)} {val} {unit}".strip()

    parts = []
    for key, label_key in (
        ("pl1", "power_pl1"),
        ("pl2", "power_pl2"),
        ("dynamic_boost", "power_dboost"),
        ("thermal_target", "power_thermal"),
    ):
        s = _fmt_ctrl(key, label_key)
        if s is not None:
            parts.append(s)

    if not parts:
        return None

    line = Text()
    line.append(f" {t('power_control')} ", style=th["title"])
    for i, part in enumerate(parts):
        if i:
            line.append("  ·  ", style="grey30")
        line.append(part, style=th["dim"])
    return line


def thermal_state(avg: float | None, t, limits) -> Text:
    if avg is None:
        return Text("N/A", style="grey58")
    lo, mid, hi = (limits or DEFAULT_LIMITS)[:3]
    if avg < lo:
        return Text(t("state_cold"), style="bold green")
    if avg < mid:
        return Text(t("state_normal"), style="bold yellow")
    if avg < hi:
        return Text(t("state_hot"), style="bold dark_orange")
    return Text(t("state_critical"), style="bold red")


def build(state, t, console_width: int):
    from . import __version__

    th = THEMES.get(state["theme"], THEMES["rog"])

    header = Text(justify="center")
    header.append(f"ROG MONITOR v{__version__}", style=th["accent"])
    header.append("   ")
    header.append_text(thermal_state(state["cpu"]["avg"], t, state["limits"]["cpu"]))

    bar_line = keys_bar(t, th, state.get("message", ""))

    if state.get("help_visible"):
        return Group(
            header,
            bar_line,
            Panel(Text(t("help_body")), title=Text(f" {t('help_title')} ", style=th["title"]),
                  border_style=th["border"]),
        )

    if state.get("events_visible"):
        return Group(header, bar_line, events_panel(state, t, th, full=True))

    top = Table.grid(expand=True)
    top.add_column(ratio=1)
    top.add_column(ratio=1)
    top.add_row(cpu_panel(state, t, th), gpu_panel(state, t, th))
    top.add_row(fans_panel(state, t, th), profile_panel(state, t, th))

    power_line = power_control_line(state, t, th)
    bottom_rows = [
        history_panel(state, t, th, console_width),
        system_panel(state, t, th),
        events_panel(state, t, th),
        processes_panel(state, t, th),
    ]
    if power_line is not None:
        bottom_rows.insert(0, power_line)

    return Group(header, bar_line, top, *bottom_rows)
