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
- **Interactive**: switch power profile (`p`), toggle iGPU/dGPU mode (`g`),
  themes (`t`), export history to JSON/CSV (`e`).
- Spanish and English UI (auto-detected from `$LANG`).

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

## Keys

| Key | Action |
|-----|--------|
| `q` | quit |
| `p` | cycle power profile (power-saver → balanced → performance) |
| `g` | toggle GPU mode Hybrid ↔ Integrated (logout required to apply) |
| `t` | cycle color theme (rog / ice / matrix) |
| `e` | export history as JSON + CSV |
| `h` | help |

## CLI

```
monitor [--once] [--interval S] [--no-gpu] [--theme rog|ice|matrix] [--lang es|en]
```

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
    "cooldown_seconds": 120
  }
}
```

## Supported hardware

Developed on an ASUS ROG Strix G614JV (i7-13650HX + RTX 4060, Bazzite), but the
sensor layer discovers hwmon chips generically: Intel `coretemp` and AMD
`k10temp`/`zenpower` CPUs, NVIDIA and AMD GPUs, and any chip exposing
`fan*_input` (the ASUS `asus` chip gives the three ROG fans labelled
cpu/gpu/mid). Missing sensors degrade gracefully to `N/A` — no error spam.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). Next up: Electron desktop app (v6) and
the public open-source release (v7).

## License

MIT
