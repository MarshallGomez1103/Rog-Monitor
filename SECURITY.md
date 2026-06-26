# Security Policy

ROG Monitor is a local hardware-control app. The main security risk is not data
exfiltration; it is applying unsafe system or firmware settings that can crash a
session, overheat a machine, or make the desktop fail to start.

## Data and network

- No telemetry.
- No background network calls.
- The update button may run `git fetch` for the user's clone.
- The report button opens the browser with a GitHub issue draft.
- Logs and configuration stay under the user's home directory.

## Privileged actions

Root is only used for allowlisted hardware/system actions:

- Writing ASUS firmware attributes through `scripts/apply-power-control.sh`.
- Applying GPU clock offsets through `scripts/apply-gpu-clocks.sh`.
- Installing/enabling/stopping ROG Monitor systemd services through explicit
  `pkexec` prompts.
- Reading SMART data through `smartctl`.

Privileged services must not call `pkexec`; if a process already runs as root,
it must write through the allowlisted scripts directly.

Every one of these commands is listed in the app under **Help -> System
Commands**, showing the literal command and why it needs root, so users can audit
exactly what runs as root (source: `desktop/renderer/commands.js`).

## Hard safety rules

- Never run `supergfxctl --mode` from boot, udev, AC/battery hooks, or systemd
  automation. GPU mode changes are manual user actions only.
- Automatic policy may adjust PPD profile, platform profile, fan curves, fan
  caps, brightness, PL1/PL2, Dynamic Boost, and GPU thermal target.
- Automatic policy must not apply GPU core/memory clock offsets.
- Every numeric write must be clamped by the UI/backend and again by the
  firmware-facing script.
- Any PR that adds a shell command, `pkexec`, `systemctl`, `sudo`, `rm`, GPU mode
  switching, or sysfs write needs focused review.

## Recovery

From a TTY, disable all root integrations:

```bash
cd /path/to/Rog-Monitor
sudo bash scripts/rog-monitor-safe-mode.sh disable
sudo reboot
```

To remove installed root integrations while keeping user config:

```bash
sudo bash scripts/rog-monitor-safe-mode.sh uninstall
```

## Reporting a vulnerability

Report privately: open a **GitHub Security Advisory** (repo → Security → Report a
vulnerability) instead of a public issue, especially for anything that could apply
unsafe firmware/system settings. Include your model, distro, and steps to
reproduce. Public issues are fine for non-exploitable bugs.
