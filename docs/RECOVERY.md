# Recovery runbook

Something went wrong (fans stuck, a power limit that crashes games, a service
that breaks the desktop login)? Everything below works from a text console, so
you do not need a working desktop.

1. Press `Ctrl+Alt+F3` (or `F4`..`F6`) and log in with your user and password.
2. `cd` into your ROG Monitor clone (the folder that contains `scripts/`). Below,
   `<repo>` stands for that folder.
3. Pick the section that matches the problem.

If nothing else works: boot with the power cable connected, run the "Disable
everything" step, reboot. Nothing here deletes your configuration.

## Safe-mode actions

`<repo>/scripts/rog-monitor-safe-mode.sh` is the single entry point. It needs
root (`sudo`), except for `--dry-run`.

| Command | What it does |
| --- | --- |
| `sudo bash <repo>/scripts/rog-monitor-safe-mode.sh status` | Shows active/enabled state of the ROG Monitor services. |
| `sudo bash <repo>/scripts/rog-monitor-safe-mode.sh disable` | Stops and disables every ROG Monitor root service. Keeps all files and config. |
| `sudo bash <repo>/scripts/rog-monitor-safe-mode.sh no-auto-profile` | Turns off only the automatic profile switch on AC/battery (and its udev rule). |
| `sudo bash <repo>/scripts/rog-monitor-safe-mode.sh uninstall` | Removes every root integration (units, helpers, asusd copy, RAPL rule). Keeps `/etc/rog-monitor/` and `/etc/asusd/`. Safe to run twice. |
| `sudo bash <repo>/scripts/rog-monitor-safe-mode.sh uninstall --purge` | Same, and also deletes `/etc/rog-monitor/` (battery limit) and the `asusd.env` we installed. |
| `bash <repo>/scripts/rog-monitor-safe-mode.sh uninstall --dry-run` | Prints what `uninstall` would do. Changes nothing, no root needed. |

After `disable`, reboot. Re-enable later from the app (**System -> Maintenance ->
Reinstall / Repair**) or with `sudo bash <repo>/scripts/install-system.sh`.

## Disable everything (the universal fix)

```bash
sudo bash <repo>/scripts/rog-monitor-safe-mode.sh disable
sudo reboot
```

To disable a single unit instead:

```bash
sudo systemctl disable --now rog-profile-sync.service      # fan curves + profile sync
sudo systemctl disable --now rog-thermal-guardian.service  # thermal guardian (opt-in)
sudo systemctl disable --now rog-battery-limit.service     # battery charge limit
sudo systemctl disable --now rog-power-source.service      # AC/battery auto-profile (opt-in)
sudo systemctl disable --now asusd.service                 # Aura daemon (only if ROG Monitor installed it)
```

## Bad fan curve (fans too slow, too loud, or stuck)

The curves you edit live in `~/.config/rog-monitor/fan-curves.json`. The root
service re-reads it; an invalid or too-low curve is already rejected or raised
to a safe floor, but you can always start over:

```bash
mv ~/.config/rog-monitor/fan-curves.json ~/.config/rog-monitor/fan-curves.json.bak
sudo systemctl restart rog-profile-sync.service   # reapplies the built-in defaults
```

To hand the fans back to the firmware right now, disable the custom curves
(`2` = disabled) and stop the service so it does not re-enable them:

```bash
sudo systemctl disable --now rog-profile-sync.service
for d in /sys/class/hwmon/hwmon*; do
  [ "$(cat "$d/name" 2>/dev/null)" = asus_custom_fan_curve ] || continue
  for n in 1 2 3 4 5 6; do [ -e "$d/pwm${n}_enable" ] && echo 2 | sudo tee "$d/pwm${n}_enable" >/dev/null; done
done
```

A reboot normally clears the custom curves as well.

**Fans stuck at a fixed speed after a fan benchmark.** The benchmark sets all
curve points to one fixed PWM while it runs and restores them when it ends
(also on Ctrl+C or `kill`). If it was killed hard (SIGKILL, power loss), the
fan service notices the leftover marker `/run/rog-monitor/calibrating` and
restores the curves within about 30 seconds. To do it by hand:

```bash
sudo rm -f /run/rog-monitor/calibrating
sudo systemctl restart rog-profile-sync.service
```

## Bad power limit (PL1 / PL2 / Dynamic Boost / thermal target)

Power values are validated against the device range before any write, but a
value inside the range can still be unstable for your unit. Restore the
firmware defaults:

```bash
A=/sys/class/firmware-attributes/asus-armoury/attributes
for a in ppt_pl1_spl ppt_pl2_sppt nv_dynamic_boost nv_temp_target; do
  [ -r "$A/$a/default_value" ] && sudo sh -c "cat '$A/$a/default_value' > '$A/$a/current_value'"
done
```

Also stop whatever may reapply them: `sudo systemctl disable --now rog-thermal-guardian.service`
(the guardian trims PL2 / Dynamic Boost when it is too hot) and
`sudo bash <repo>/scripts/rog-monitor-safe-mode.sh no-auto-profile`.

The platform profile can be set directly too:

```bash
echo balanced | sudo tee /sys/firmware/acpi/platform_profile
```

GPU clock offsets (Power Center) are applied through NVML and are normally cleared by a
reboot or a driver reload.

## Battery charge limit

To charge to 100 % again:

```bash
sudo systemctl disable --now rog-battery-limit.service
sudo rm -f /etc/rog-monitor/battery.conf
echo 100 | sudo tee /sys/class/power_supply/BAT*/charge_control_end_threshold
```

If you use asusd as well: `asusctl battery limit 100`.

## Thermal guardian

```bash
sudo systemctl disable --now rog-thermal-guardian.service
sudo rm -rf /etc/systemd/system/rog-thermal-guardian.service.d   # forget its ceilings
sudo systemctl daemon-reload
```

Then restore power limits as in "Bad power limit" if it had trimmed them.
Its status file is `~/.local/share/rog-monitor/thermal-guardian-state.json`.

## Login or desktop problems after installing

1. From the TTY, run the "Disable everything" step and reboot.
2. If the desktop starts now, one of the root integrations was the cause. Look at why:

   ```bash
   journalctl -b -u rog-profile-sync.service -u rog-thermal-guardian.service \
     -u rog-battery-limit.service -u rog-power-source.service --no-pager | tail -50
   ```

3. If the problem started on battery, the AC/battery auto-profile is the usual
   suspect: `sudo bash <repo>/scripts/rog-monitor-safe-mode.sh no-auto-profile`.
4. If the black screen/login loop is about the GPU mode (Hybrid / Integrated),
   that is a manual `supergfxctl --mode Hybrid` followed by a reboot. ROG Monitor
   never changes the GPU mode on its own.
5. Still stuck: `sudo bash <repo>/scripts/rog-monitor-safe-mode.sh uninstall`,
   reboot, and report it (see `SECURITY.md` for how).

## Check the privileged install

Root helpers must be root-owned, not writable by anyone else:

```bash
ls -ld /usr/local/libexec/rog-monitor /usr/local/lib/rog-monitor
ls -l  /usr/local/libexec/rog-monitor
find /usr/local/lib/rog-monitor ! -user root -o -perm /022   # must print nothing
```

If anything looks wrong or outdated (the app says "needs install"), refresh it
with `sudo bash <repo>/scripts/install-system.sh` (use `--dry-run` first to see
every action).
