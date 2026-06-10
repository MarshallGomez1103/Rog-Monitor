# ROG Monitor

Real-time hardware monitor for ASUS ROG laptops on Linux, in your terminal.

Lightweight, flicker-free (built on [Rich](https://github.com/Textualize/rich)),
reads sensors directly from sysfs — no root required for the core features.

```
                     ROG MONITOR v5.0.0   NORMAL
╭──────── CPU ────────╮╭──────── GPU ─────────╮
│ Average   58.4°C    ││ Mode   Hybrid        │
│ Package   69°C      ││ Model  RTX 4060      │
│ Power     28.4 W    ││ Temp   51°C  Use 12% │
╰─────────────────────╯╰──────────────────────╯
╭─────── FANS ────────╮╭────── PROFILE ───────╮
│ CPU ████████░░ 3300 ││ ASUS    performance  │
│ GPU ██████░░░░ 2600 ││ EPP     balance_perf │
╰─────────────────────╯╰──────────────────────╯
```

## Features

- **CPU**: per-core temps (avg/max/min), package temp, frequency, cores >90°C,
  package power (Intel RAPL), thermal-throttle counter.
- **GPU**: NVIDIA (nvidia-smi) and AMD (hwmon) — temp, usage, power, VRAM.
  Detects Hybrid / Integrated / Dedicated mode via supergfxctl and handles the
  dGPU being powered off.
- **Fans**: RPM + percentage bars with auto-calibrating maximums.
- **Power profile**: ASUS platform profile, power-profiles-daemon / tuned-ppd
  profile, EPP — and explains why the kernel governor reads `powersave` on
  modern Intel/AMD P-state drivers.
- **History**: scrolling graphs for CPU temp, GPU temp and CPU power with
  1m / 5m / 15m averages.
- **Alerts**: configurable thresholds (CPU/GPU temp, throttling, stopped fans,
  abnormal power) with desktop notifications and an on-screen event log.
- **System**: RAM, disk (NVMe temp), network rate, load, uptime, battery with
  charge limit.
- **System**: RAM, every real disk (with NVMe temp), network rate, load,
  uptime, battery with charge limit, top processes by CPU.
- **Interactive**: switch power profile (`p`), toggle iGPU/dGPU mode (`g`,
  with pending-change display and cancel), themes (`t`), full event view
  (`v`), export history to JSON/CSV (`e`).
- **Desktop app**: Electron dashboard (`desktop/`) with animated fans, canvas
  charts, profile/GPU buttons and a one-click updater — fed by the same
  Python core over `--json-stream`. Six themes × light/dark mode, working
  Ctrl+wheel zoom, click-to-kill processes, event-log export to .txt.
- **Semantic colors**: blue = cold, green = normal, orange = near your
  configured limits, red = critical — consistent across app and terminal.
- Spanish and English UI (auto-detected from `$LANG`).
- **No telemetry, no network access**: everything is read locally from sysfs;
  the only network use is the optional update button (git fetch on your own
  clone).

## Install

```bash
git clone https://github.com/<you>/Rog-Monitor
cd Rog-Monitor
bash scripts/install.sh   # venv + deps + `monitor` command in ~/.local/bin
monitor
```

CPU package power requires readable Intel RAPL counters (restricted to root by
default since CVE-2020-8694):

```bash
sudo bash scripts/enable-cpu-power.sh
```

Desktop app (requires Node.js/npm):

```bash
bash scripts/install-desktop.sh   # npm deps + "ROG Monitor" menu entry
monitor --desktop                 # or launch from the app menu
```

## Keys

| Key | Action |
|-----|--------|
| `q` | quit |
| `p` | cycle power profile (power-saver → balanced → performance) |
| `g` | toggle GPU mode Hybrid ↔ Integrated; press again while pending to cancel (logout required to apply) |
| `t` | cycle color theme (rog / ice / matrix) |
| `v` | view full event log |
| `e` | export history as JSON + CSV |
| `h` | help |

## CLI

```
monitor [--once] [--json] [--json-stream] [--desktop] [--interval S]
        [--no-gpu] [--theme rog|ice|matrix] [--lang es|en]
```

`--json` / `--json-stream` emit machine-readable snapshots (NDJSON) — this is
the API the desktop app consumes, and an easy integration point for widgets
or scripts.

## Configuration

`~/.config/rog-monitor/config.json` (created on first save):

```json
{
  "lang": "auto",
  "theme": "rog",
  "interval": 1.0,
  "history_seconds": 900,
  "notifications": true,
  "alerts": {
    "cpu_temp_warn": 92,
    "gpu_temp_warn": 85,
    "cpu_power_warn": 140,
    "fan_stopped_cpu_temp": 60,
    "cooldown_seconds": 120,
    "throttle_min_ms": 100
  },
  "temp_colors": {
    "cpu": [70, 85, 92],
    "gpu": [60, 75, 83]
  }
}
```

`temp_colors` sets your personal color limits `[green_below, yellow_below,
orange_below]` — above the last value everything shows red, in the terminal
and in the desktop app.

## Supported hardware

Developed on an ASUS ROG Strix G614JV (i7-13650HX + RTX 4060, Bazzite), but the
sensor layer discovers hwmon chips generically: Intel `coretemp` and AMD
`k10temp`/`zenpower` CPUs, NVIDIA and AMD GPUs, and any chip exposing
`fan*_input` (the ASUS `asus` chip gives the three ROG fans labelled
cpu/gpu/mid). Missing sensors degrade gracefully to `N/A` — no error spam.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). v1–v6 are done; next up: the public
open-source release (v7), universal laptop compatibility (v8) and power-user
tools like fan-curve editing and a gaming overlay (v9).

## License

MIT
