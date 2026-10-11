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
- Reading SMART data through `smartctl` (`rog-ctl.sh smart-json <device>`).

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
status JSON there; both are data, never executed or imported.

- Reads of user files as root are hardened: `rog-profile-sync.sh` only accepts
  a regular file (no symlink, FIFO or device; the directory must not be a
  symlink) of at most 256 KiB, and the Python that parses it opens it with
  `O_NOFOLLOW | O_NONBLOCK` and re-checks type and size on the open descriptor.
  The guardian skips a state directory that is a symlink and writes through a
  temp file created with `O_EXCL`.
  Its only hardware writes are `ppt_pl2_sppt`, `nv_dynamic_boost` and
  `/sys/firmware/acpi/platform_profile`, all through one `hw_write` function
  (simulation mode `ROG_THERMAL_DRY=1` writes nothing); its crash marker lives
  in root-only `/run/rog-monitor`, and the python it calls for per-profile
  limits is the isolated `rog-py.sh` launcher. Residual: a user who can swap a *parent*
  directory between check and open is not fully excluded; the only data taken
  from those files is numbers that are range-checked again (below).
- `enable-asusd.sh` copies the Homebrew `asusd` payload to `/usr/local` as root.
  Homebrew's prefix belongs to the user, so by default the script **refuses**
  when the payload or any parent directory is not root-owned or is group/world
  writable. Passing `--i-understand-user-owned-source` overrides that and is
  only meant for a manual `sudo` run by someone who trusts that prefix; the app
  never passes it (it runs the script with `--yes` only), so the in-app Aura
  enable button fails closed until the payload is root-owned.

## Input validation and fan safety

- **Power values** (PL1, PL2, Dynamic Boost, thermal target, GPU offsets) are
  checked in three places: the app rejects non-numbers (no more `null`/`true`/`""`
  turning into `0`); `rog_monitor.power_control` **refuses** (does not clamp) any
  value outside the device range from `device_profiles.json` / live firmware
  limits before anything is written; the root helper clamps to the live firmware
  `min_value`/`max_value` again.
- **Fan curves** must have 8 points, strictly increasing temperatures in
  20..105 C, integer PWM 0..255, and never leave fans (almost) off when hot: the
  last point and every point at or above 90 C need PWM >= 150. This is enforced
  when saving (`desktop/priv.js`, unit-tested) and again by the root service
  (`rog-profile-sync.sh`): a structurally invalid stored curve is discarded for
  the built-in default, a too-low hot PWM is raised to the floor. The one
  deliberate exception is the user's RPM cap (>= 2000 RPM), applied after the
  floor.
- **Fan benchmark** (`calibrate-fans.sh`) fixes the PWM of all curve points
  while it runs. It restores the curves on exit, Ctrl+C, `TERM` and `HUP`. It no
  longer stops the sync service; it writes `/run/rog-monitor/calibrating` (its
  PID) and the sync service pauses while that PID lives. Ceiling: `SIGKILL` or a
  power cut cannot be trapped; then the leftover marker is detected by the
  service within ~30 s (or at boot, since `/run` is a tmpfs) and the curves are
  restored.
- **systemd units** run with `NoNewPrivileges=yes`, `ProtectSystem=full` and
  `PrivateTmp=yes`. `ProtectSystem=strict`, `ProtectKernelTunables` and
  `ProtectHome` are deliberately not used (the units write `/sys` and read/write
  under `/var/home`; a `ProtectHome=true` once broke the guardian).

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
sudo bash scripts/rog-monitor-safe-mode.sh uninstall            # keeps /etc/rog-monitor and /etc/asusd
bash scripts/rog-monitor-safe-mode.sh uninstall --dry-run       # preview, no root
```

`uninstall` also removes what `enable-asusd.sh` and `enable-cpu-power.sh`
installed (asusd binary, unit and D-Bus policy, the RAPL tmpfiles rule) and is
idempotent. Add `--purge` to delete the root-side config as well.

Step-by-step recovery recipes (bad fan curve, power limit, guardian, battery
limit, login problems) are in [docs/RECOVERY.md](docs/RECOVERY.md).

## Reporting a vulnerability

Report privately: open a **GitHub Security Advisory** (repo → Security → Report a
vulnerability) instead of a public issue, especially for anything that could apply
unsafe firmware/system settings. Include your model, distro, and steps to
reproduce. Public issues are fine for non-exploitable bugs.
