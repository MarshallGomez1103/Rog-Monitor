# ADR-0001: Root runs only root-owned copies

- Status: accepted
- Applies to: `desktop/priv.js`, `scripts/install-system.sh`, `scripts/rog-ctl.sh`, `scripts/rog-py.sh`, `systemd/*.service`

## Context

ROG Monitor needs root for a few things: writing firmware power limits, fan
curves, the charge limit and GPU clock offsets, reading SMART data, and running
a few systemd services. The repository lives in the user's home and is writable
by the user. If a root process (a `pkexec` call or a root systemd unit) ran or
imported a file from that repository, any process running as the user could
edit the file and get root the next time the service starts or the user
approves an unrelated password prompt.

## Decision

No root process executes or imports a file that a non-root user can modify.

- Helper scripts are installed once into `/usr/local/libexec/rog-monitor/` and
  the Python package into `/usr/local/lib/rog-monitor/`, owned by `root:root`
  and not writable by group or others. systemd units are installed into
  `/etc/systemd/system/` and point at the libexec copies.
- Root Python is started only through `rog-py.sh` (`python3 -I`, `sys.path`
  fixed to the system copy), so `PYTHONPATH`, user site-packages and the
  current directory are ignored.
- The app calls `/usr/bin/pkexec` by absolute path with an absolute helper path
  from a closed list (`HELPERS` in `desktop/priv.js`). It never builds
  `pkexec sh -c "<string>"`.
- Arguments are validated in the app and again by the helper. Numeric power
  values are also clamped to firmware limits by the helper.
- Before each privileged call the app checks that the helper exists, that its
  `VERSION` matches the app's, and that the helper and its directory are
  owned by uid 0 and not group/world-writable. Otherwise it reports
  `needsInstall` and runs nothing.
- The only repo file executed as root is `scripts/install-system.sh`, and only
  after the user confirms it (`sudo bash ...` or the app's REINSTALL / REPAIR).
  `--dry-run` prints every action without changing anything.

## Consequences

- After an update that changes `VERSION`, privileged actions are refused until
  the system copy is refreshed with `sudo bash scripts/install-system.sh`. The
  app detects this and offers REINSTALL / REPAIR.
- Adding a new privileged action means touching three places (see "Privileged
  code rules" in CONTRIBUTING.md): the allowlist in `desktop/priv.js`, the
  argument validation in `rog-ctl.sh` (or in the helper itself), and the helper
  list in `install-system.sh`.
- Root services still read some data files from the user's home. They are
  treated as data (type, size and range checks, no symlinks) and never
  executed or imported. See SECURITY.md.
- The privileged surface can be audited with `ls -l` and `find` on two
  directories; SECURITY.md lists the commands.
