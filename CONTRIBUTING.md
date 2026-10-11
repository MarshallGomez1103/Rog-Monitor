# Contributing to ROG Monitor

Thanks for your interest. ROG Monitor is a Linux hardware monitor and control
center for ASUS ROG laptops, built without telemetry and without cloud
dependencies.

## Project rules

- **No telemetry or background network calls**, except the explicit update button
  (`git`) and the report button, which opens GitHub in the browser. No analytics.
- **English is the public base language.** The UI ships in 8 languages
  (`en es fr it pt zh ja ko`); every user-facing string must have at least
  English and Spanish, and new public docs should be written in English.
- **Do not damage hardware.** Root/system changes go through explicit `pkexec`
  prompts or scripts the user chooses to run. Power controls are clamped to
  firmware min/max values twice and require consent.
- **Keep the visual identity.** Cut corners, angled number plates, custom
  palettes, and semantic thermal colors are intentional. Avoid generic rounded
  cards and stock dashboard styling.
- **Use generic paths** in docs and code. Do not hard-code personal home paths.
- **Archive before deleting** existing files unless the change is explicitly a
  cleanup.

## Environment and checks

```bash
# Python core
bash scripts/install.sh
PYTHONPATH=src python3 -m rog_monitor --json
PYTHONPATH=src python3 -m rog_monitor

# Desktop app
bash scripts/install-desktop.sh
```

Before opening a PR, run the same checks as CI where possible:

```bash
python3 -m py_compile src/rog_monitor/*.py
python3 -c "import json; json.load(open('src/rog_monitor/device_profiles.json'))"
PYTHONPATH=src python3 -m rog_monitor --json | python3 -m json.tool > /dev/null
for f in desktop/main.js desktop/preload.js desktop/renderer/*.js; do node --check "$f"; done
node scripts/validate-i18n.mjs
cd desktop && npm ci && npx electron-builder --linux dir --publish never
```

## Running tests

Everything uses the standard library (see
[ADR-0002](docs/adr/0002-no-new-dependencies.md)); there is nothing to install
beyond `requirements.txt`.

```bash
# Python: unit, contract and TUI tests
PYTHONPATH=src python3 -m unittest discover -s tests

# Desktop: privilege helpers, snapshot contract, escaping, charts, benchmarks
node --test desktop/test/*.test.js

# i18n: every key has en and es, every data-i18n resolves
node scripts/validate-i18n.mjs

# Shell syntax of every script
for f in install.sh uninstall.sh scripts/*.sh desktop/start.sh; do bash -n "$f" || exit 1; done

# Installer: prints every action, changes nothing, needs no root
bash scripts/install-system.sh --dry-run
```

To try the installer for real without root, install into a scratch tree:
`ROG_PREFIX=/tmp/rog-test bash scripts/install-system.sh` (systemd and package
steps are skipped).

**Performance.** If you touch the sampling loop, a reader or the Electron
backend handling, measure the cost before and after with `scripts/measure.py`:

```bash
python3 scripts/measure.py --cmd "python3 -m rog_monitor --json-stream --interval 1" --duration 60
python3 scripts/measure.py --bench-overhead --duration 20 --reps 3
```

Run it with `PYTHONPATH=src` from a clone. The method and how to read the
numbers are in [docs/BENCHMARKS.md](docs/BENCHMARKS.md). Report the machine and
conditions along with the result.

### Changing the snapshot (contract test)

The JSON snapshot printed by `python3 -m rog_monitor --json` is a contract
between the Python core and the UI. Rules and reasoning:
[ADR-0004](docs/adr/0004-ndjson-schema-versioning.md).

- **Adding a key** is not breaking. Add it; if the UI reads it, add it to
  `REQUIRED` in `tests/test_contract.py` and to the matching list in
  `desktop/test/contract.test.js`.
- **Removing or renaming a key, or changing a type or unit** is breaking:
  1. bump `"schema"` in `snapshot_json()` (`src/rog_monitor/app.py`) and
     `EXPECTED_SCHEMA` in `tests/test_contract.py`;
  2. update `REQUIRED` in `tests/test_contract.py` and the matching list in
     `desktop/test/contract.test.js`;
  3. record a new fixture, `tests/fixtures/snapshot-v<N>.json`, from
     `PYTHONPATH=src python3 -m rog_monitor --json`, and remove personal data
     (names, serials, paths) from it before committing;
  4. mention the break in `CHANGELOG.md`.

## Privileged code rules

Background: [ADR-0001](docs/adr/0001-privilege-boundary.md) and the "Privilege
boundary" section of [SECURITY.md](SECURITY.md). Short version: root must never
execute or import a file a normal user can modify.

- **Never `pkexec` a file from the repository** (or from the user's home). The
  app calls only root-owned helpers installed in
  `/usr/local/libexec/rog-monitor/`, by absolute path, through `runPriv()`
  and `desktop/priv.js`. The one exception is the installer
  (`scripts/install-system.sh`), which the user confirms explicitly.
- **No `pkexec sh -c "<string>"`** and no shell strings assembled from user
  input. Pass a fixed argv.
- **Root Python goes through `scripts/rog-py.sh`** (`python3 -I`, fixed
  `sys.path`). Never run root Python from the repo or rely on `PYTHONPATH`.
- Scripts that run as root set a fixed `PATH` and must not read the user's
  environment for paths they execute.
- **Adding a new privileged helper or action** means all of the following:
  1. add the script to `HELPERS` in `desktop/priv.js` (and a validator there
     for each argument it takes), with a test in `desktop/test/priv.test.js`;
  2. validate its arguments again inside the helper, or add a subcommand with
     validation to `scripts/rog-ctl.sh`; numeric hardware values must also be
     clamped to the live firmware limits;
  3. add it to the `HELPERS` array in `scripts/install-system.sh` so it is
     installed `root:root`;
  4. list the literal command in the app's System Commands help
     (`desktop/renderer/commands.js`, with texts in all 8 languages);
  5. run `bash scripts/install-system.sh --dry-run`.
- Root services (systemd units) must not call `pkexec`, must point `ExecStart`
  at `/usr/local/libexec/rog-monitor/`, and keep `NoNewPrivileges=yes`.
- Automatic policy (guardian, profile sync) never switches the GPU mode and
  never applies GPU clock offsets.
- Any PR that adds `pkexec`, `sudo`, `systemctl`, `rm`, a sysfs write or GPU
  mode switching gets a focused review.

## Translations

The UI ships in **8 languages**: `en es fr it pt zh ja ko`. Translation guide:
[docs/TRANSLATING.md](docs/TRANSLATING.md).

A new string needs English and Spanish; `node scripts/validate-i18n.mjs` fails
without them. Please provide the other six too. Missing ones fall back to
English or Spanish and the script reports them as translation debt without
failing. Keep placeholders such as `{n}` intact and leave technical tokens
(`pkexec`, `PL1`, command names) untranslated.

Do not leave new UI text hard-coded in one language. Use `data-i18n`,
`data-i18n-attr`, or `window.t(...)` depending on where the string is rendered.

## Add your laptop

See [docs/supported-devices.md](docs/supported-devices.md). In short: add a
profile to `src/rog_monitor/device_profiles.json` with firmware-safe ranges for
your exact model, or open a **Device request** issue with the requested data.

## Style

- Python: standard library first; add dependencies only when they solve a real
  problem.
- Renderer JS: keep feature code in feature files, use local
  `window.rog.onStats` subscribers where possible, and avoid rewriting the
  central `update()` path for unrelated work.
- CSS: use theme variables such as `--accent`, `--panel`, `--hair`, and the
  semantic thermal colors.
