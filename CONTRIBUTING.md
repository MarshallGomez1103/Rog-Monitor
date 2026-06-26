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

## Translations

Translation guide: [docs/TRANSLATING.md](docs/TRANSLATING.md).

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
