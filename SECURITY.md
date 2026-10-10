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

- Writing ASUS firmware attributes through `apply-power-control.sh`.
- Applying GPU clock offsets through `apply-gpu-clocks.sh`.
- Installing/enabling/stopping ROG Monitor systemd services through explicit
  `pkexec` prompts.
- Reading SMART data through `smartctl`.

Privileged services must not call `pkexec`; if a process already runs as root,
it must write through the allowlisted scripts directly.

Every one of these commands is listed in the app under **Help -> System
Commands**, showing the literal command and why it needs root, so users can audit
exactly what runs as root (source: `desktop/renderer/commands.js`).

## Privilege boundary

Invariant: **no root process (a `pkexec` call or a root systemd unit) ever
executes or imports a file that a non-root user can modify.** Everything that
runs as root is a root-owned copy installed once, with explicit consent, by
`sudo bash scripts/install-system.sh` (or the app's REINSTALL / REPAIR button,
which asks first and runs the same script through `pkexec`):

| What | Where | Owner / mode |
| --- | --- | --- |
| Root helper scripts + `VERSION` | `/usr/local/libexec/rog-monitor/` | `root:root`, dir 0755, scripts 0755 |
| Python package `rog_monitor` | `/usr/local/lib/rog-monitor/rog_monitor/` | `root:root`, dirs 0755, files 0644 |
| systemd units | `/etc/systemd/system/rog-*.service` | `root:root`, 0644 (`ExecStart` points into libexec) |

- Root Python always runs isolated through `rog-py.sh`
  (`/usr/bin/python3 -I`, `sys.path` fixed to `/usr/local/lib/rog-monitor`), so
  `PYTHONPATH`, the user's site-packages and the current directory are ignored.
- The installer itself is the only repo file executed as root, and only after
  the user confirms. Read it first; `--dry-run` prints every action and changes
  nothing, `ROG_PREFIX=/tmp/x` installs into a scratch tree without root.
- The app calls `/usr/bin/pkexec` by absolute path with a helper from the list
  in `desktop/priv.js`. Arguments are validated (integer ranges, enums, a device
  regex such as `^/dev/(nvme\d+n\d+|sd[a-z]+)$`) in the app and again by the
  helper. No `pkexec sh -c "<string>"` is built any more.
- Before every privileged call the app checks that the helper exists, that its
  `VERSION` matches the app, and that the helper and its directory are owned by
  uid 0 and not group/world-writable. Otherwise it returns `needsInstall` and
  runs nothing from the repo.
- The user's `PATH` entries (`~/.local/bin`, Linuxbrew) are appended after the
  system directories and are never used to resolve `pkexec` or root helpers.

Verify it yourself (every line must show `root root` and no `w` for group/other):

```bash
ls -ld /usr/local/libexec/rog-monitor /usr/local/lib/rog-monitor
ls -l  /usr/local/libexec/rog-monitor
find /usr/local/lib/rog-monitor ! -user root -o -perm /022   # must print nothing
systemctl cat rog-profile-sync.service | grep ExecStart      # points into libexec
```

After updating the repo (`git pull`) the `VERSION` changes, privileged actions
report `needsInstall`, and the system copy must be refreshed with
`sudo bash scripts/install-system.sh`.

Known limits: root services still *read* data files from the user's home
(`~/.config/rog-monitor/fan-curves.json`) and the thermal guardian writes its
status JSON there; both are data, never executed or imported. `enable-asusd.sh`
installs the Homebrew `asusd` payload as root, so treat that Homebrew prefix as
trusted.

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
