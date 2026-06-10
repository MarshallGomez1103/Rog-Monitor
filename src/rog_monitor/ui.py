"""Dashboard rendering with Rich: panels, bars, graphs, themes."""

from rich.console import Group
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from . import graph

THEMES = {
    "rog": {
        "accent": "bold red",
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
        "border": "dark_green",
        "title": "bold bright_green",
        "dim": "green",
        "bar": "green",
        "graph_cpu": "bright_green",
        "graph_gpu": "green",
        "graph_power": "yellow",
    },
}


def temp_style(temp: float | None) -> str:
    if temp is None:
        return "grey58"
    if temp < 70:
        return "green"
    if temp < 85:
        return "yellow"
    if temp < 92:
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


def _kv(table: Table, key: str, value) -> None:
    table.add_row(Text(key, style="grey74"), value if isinstance(value, Text) else Text(str(value)))


def _grid() -> Table:
    table = Table.grid(padding=(0, 1))
    table.add_column(min_width=11)
    table.add_column()
    return table


def cpu_panel(state, t, th) -> Panel:
    cpu = state["cpu"]
    table = _grid()
    avg = cpu["avg"]
    _kv(table, t("avg"), Text(f"{avg}°C", style=temp_style(avg)) if avg is not None else _fmt(None))
    _kv(table, t("max"), _fmt(cpu["max"], "°C"))
    _kv(table, t("min"), _fmt(cpu["min"], "°C"))
    _kv(table, t("package"), Text(f"{cpu['package']:.0f}°C", style=temp_style(cpu["package"])) if cpu["package"] is not None else _fmt(None))
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
    table = _grid()
    _kv(table, t("gpu_mode"), Text(info.get("mode") or "N/A", style=th["accent"]))
    if active:
        _kv(table, t("model"), active["name"])
        temp = active["temp"]
        _kv(table, t("temp"), Text(f"{temp:.0f}°C", style=temp_style(temp)) if temp is not None else _fmt(None))
        util = active["util"]
        if util is not None:
            row = Text()
            row.append_text(bar(util, 14, th["bar"]))
            row.append(f" {util:.0f}%")
            _kv(table, t("usage"), row)
        _kv(table, t("power"), _fmt(active["power"], " W"))
        if active["vram_total"]:
            _kv(table, t("vram"), f"{active['vram_used']:.0f} / {active['vram_total']:.0f} MiB")
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
    if battery:
        text = Text()
        text.append(f"{battery['capacity']}% ", style="bold")
        text.append(f"({battery['status']}", style="grey58")
        if battery["charge_limit"]:
            text.append(f", {t('charge_limit')} {battery['charge_limit']}%", style="grey58")
        text.append(")", style="grey58")
        if battery["watts"] and not battery["on_ac"]:
            text.append(f" {battery['watts']} W", style="yellow")
        _kv(table, t("battery"), text)
    return Panel(table, title=Text(f" {t('profile')} ", style=th["title"]), border_style=th["border"])


def _graph_block(title: str, serie, width: int, style: str, th) -> Group:
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
    for _ in range(4):
        table.add_column()

    ram = Text()
    ram.append_text(bar(info["ram_percent"], 12, th["bar"]))
    ram.append(f" {info['ram_used_gb']:.1f}/{info['ram_total_gb']:.0f}G")

    disk = Text("N/A", style="grey58")
    if info["disk_percent"] is not None:
        disk = Text()
        disk.append_text(bar(info["disk_percent"], 12, th["bar"]))
        disk.append(f" {info['disk_used_gb']:.0f}/{info['disk_total_gb']:.0f}G")
        if info["nvme_temps"]:
            disk.append(f" {max(info['nvme_temps']):.0f}°C", style="grey58")

    net = Text(f"↓{info['rx_mbps']:.1f} ↑{info['tx_mbps']:.1f} Mb/s")
    load = Text(f"{info['load'][0]:.2f} {info['load'][1]:.2f} {info['load'][2]:.2f}")
    load.append(f"  ·  {t('uptime')} {info['uptime_h']:.1f}h", style="grey58")

    table.add_row(
        Text(f"{t('ram')} ", style="grey74") + ram,
        Text(f"{t('disk')} ", style="grey74") + disk,
        Text(f"{t('net')} ", style="grey74") + net,
        Text(f"{t('load')} ", style="grey74") + load,
    )
    return Panel(table, title=Text(f" {t('system')} ", style=th["title"]), border_style=th["border"])


def events_panel(state, t, th) -> Panel:
    events = list(state["events"])[-4:]
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
    return Panel(body, title=Text(f" {t('events')} ", style=th["title"]), border_style=th["border"])


def thermal_state(avg: float | None, t) -> Text:
    if avg is None:
        return Text("N/A", style="grey58")
    if avg < 70:
        return Text(t("state_cold"), style="bold green")
    if avg < 85:
        return Text(t("state_normal"), style="bold yellow")
    if avg < 92:
        return Text(t("state_hot"), style="bold dark_orange")
    return Text(t("state_critical"), style="bold red")


def build(state, t, console_width: int):
    from . import __version__

    th = THEMES.get(state["theme"], THEMES["rog"])

    header = Text(justify="center")
    header.append(f"ROG MONITOR v{__version__}", style=th["accent"])
    header.append("   ")
    header.append_text(thermal_state(state["cpu"]["avg"], t))

    if state.get("help_visible"):
        return Group(
            header,
            Panel(Text(t("help_body")), title=Text(f" {t('help_title')} ", style=th["title"]),
                  border_style=th["border"]),
        )

    top = Table.grid(expand=True)
    top.add_column(ratio=1)
    top.add_column(ratio=1)
    top.add_row(cpu_panel(state, t, th), gpu_panel(state, t, th))
    top.add_row(fans_panel(state, t, th), profile_panel(state, t, th))

    footer = Text(justify="center")
    if state.get("message"):
        footer.append(state["message"] + "   ", style="bold yellow")
    footer.append(t("keys"), style="grey58")

    return Group(
        header,
        top,
        history_panel(state, t, th, console_width),
        system_panel(state, t, th),
        events_panel(state, t, th),
        footer,
    )
