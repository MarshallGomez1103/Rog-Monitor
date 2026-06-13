# ROG Monitor v9.0.0 — Build Spec & Multi-Agent Contract

> **Orchestrator:** Claude (Opus 4.8). **Implementers:** 6 parallel Sonnet agents,
> each in its own git worktree. This file is the single source of truth and the
> contract every agent codes against. Read it fully before touching code.
> Owner: **Marshall**. Machine: **ASUS ROG Strix G16 (G614JV)** — i7‑13650HX +
> RTX 4060 Mobile, Bazzite, KDE **Wayland**.

## 0. Hard rules (from AGENTS.md — non-negotiable)

1. **NEVER `git push`.** Commit inside your worktree only. Marshall pushes himself.
2. **No telemetry, no network** except the existing update/report buttons.
3. **Español primero** (i18n es/en in `src/rog_monitor/i18n.py`); UI strings in Spanish.
4. **TUI ↔ desktop parity** for *data* features (a new readout should show in both).
5. **No hardcoded `/home/marshall`** — generic paths (`~`, `$ROG_SCRIPTS_DIR`).
6. **Archive, never delete** preexisting files.
7. **Design must NOT look AI-made:** keep the house identity — cut corners
   (`clip-path`), skewed numbered plates, accent diagonal stripe, carbon texture.
   Own palettes. Big, clear type.
8. **Power-control safety (this release):** every write is hard-clamped to the
   firmware min/max, defaults to stock, gated behind a consent dialog, and has a
   RESET-A-FÁBRICA. Nothing writes to hardware without an explicit user click.
   **During development NO agent writes real power values** — test with a fake
   sysfs dir. The privileged script double-clamps (defense in depth).
9. **RGB brick-caution:** never send a guessed command to any keyboard. Only the
   5 asusd-supported modes are wired; everything else is shown but inert.

## 1. Calibrated hardware profile (verified twice: Armoury Crate captures + live sysfs)

All four asus-armoury knobs live at
`/sys/class/firmware-attributes/asus-armoury/attributes/<attr>/` with readable
`current_value`, `min_value`, `max_value`. Writing `current_value` needs root
(pkexec). **Read min/max live** so this works on any asus-armoury laptop.

| UI control | attr / mechanism | min | max | default (stock) | works on Wayland |
|---|---|---|---|---|---|
| CPU **PL1** (sostenible) | `ppt_pl1_spl` | 28 | 140 | 140 W | ✅ yes |
| CPU **PL2** (ráfaga 2 min) | `ppt_pl2_sppt` | 28 | 175 | 175 W | ✅ yes |
| GPU **Dynamic Boost** | `nv_dynamic_boost` | 5 | 25 | 25 W | ✅ yes |
| GPU **Thermal Target** | `nv_temp_target` | 75 | 87 | 87 °C | ✅ yes |
| GPU **Base Clock Offset** | NVIDIA (NVML/nvidia-settings) | 0 | 200 | 50 MHz | ⚠️ gated |
| GPU **Memory Clock Offset** | NVIDIA | 0 | 300 | 100 MHz | ⚠️ gated |

Constraints: **PL2 ≥ PL1** (warn, don't hard-block). Thermal Target hard ceiling
**87 °C** (Marshall's explicit limit; equals firmware max anyway).
Bonus (optional, works on Wayland): NVIDIA `power.limit` via `nvidia-smi -pl`
(min 5 W / max 140 W on this GPU) — a *real* GPU power knob if you want one.

**Allowlist for the privileged writer — EXACTLY these four attribute names:**
`ppt_pl1_spl ppt_pl2_sppt nv_dynamic_boost nv_temp_target`. Reject anything else.

## 2. Shared contracts (code against these so we merge cleanly)

### 2.1 File ownership (do NOT edit files you don't own)
- **Agent 1** (backend power): `src/rog_monitor/power_control.py` (new),
  `src/rog_monitor/device_profiles.json` (new), `scripts/apply-power-control.sh`
  (new), and **the only edits to** `src/rog_monitor/app.py` (2 anchored lines)
  and `src/rog_monitor/ui.py` (TUI readout).
- **Agent 2** (power UI): `desktop/renderer/power.js` (new),
  `desktop/renderer/styles/power.css` (new); **the only edits to**
  `desktop/main.js` and `desktop/preload.js`; additive blocks in `index.html`.
- **Agent 3** (themes): the `THEMES` array in `desktop/renderer/app.js`
  (lines ~27‑37) and the palette section of `desktop/renderer/style.css`
  (lines ~7‑104). Plus the TUI palette list in `src/rog_monitor/ui.py`? **No** —
  ui.py is Agent 1's; coordinate theme *names* only via this spec.
- **Agent 4** (lighting): `src/rog_monitor/aura.py`, the aura functions in
  `app.js` (~326‑546, `renderAura`/`renderEffectGrid`/etc.), the aura `<article>`
  in `index.html` (~89‑148), `desktop/renderer/styles/lighting.css` (new).
- **Agent 5** (wizard + 4 states): `desktop/renderer/wizard.js` (new),
  `desktop/renderer/widget-states.js` (new), `desktop/renderer/styles/onboarding.css`
  (new); additive skeleton overlays inside existing blocks + a wizard modal in
  `index.html`.
- **Agent 6** (docs): `README.md`, `docs/roadmap.md`, `CHANGELOG.md`,
  `CONTRIBUTING.md` (new), `.github/` (new), `docs/supported-devices.md` (new).
  **Do not** touch code. **Do not** touch `HANDOFF.md`/`AGENTS.md` (orchestrator).

**Nobody edits `update()` in app.js.** For live data, register your own
subscriber: `window.rog.onStats((stats) => { ... })` (ipcRenderer supports many
listeners). Read the global `lastStats`/`toast(msg)` if useful.

**CSS:** new features ship a separate file under `desktop/renderer/styles/` and a
`<link>` in `index.html <head>` right after `style.css`. Only Agent 3 edits
`style.css` itself. Reuse the house variables: `--bg --panel --hair --accent
--accent2 --chip --ink --dim` and state colors `--cold --okstate --hot --crit`.

**JS:** new features ship a separate file in `desktop/renderer/` and a
`<script src="…">` in `index.html` right before `</body>` after `app.js`.

### 2.2 IPC contract for power control (Agent 1 backend ↔ Agent 2 desktop)
Python module `rog_monitor.power_control` (mirror `settings.py`/`aura.py` CLI style):
- `python -m rog_monitor.power_control state` → JSON:
  ```json
  {"ok":true,"available":true,"device":{"id":"asus-rog-strix-g16-g614jv",
   "name":"ASUS ROG Strix G16 (G614JV)","source":"sysfs+profile","calibrated":true},
   "controls":{
     "pl1":{"value":140,"min":28,"max":140,"default":140,"unit":"W","writable":true,"label":"PL1"},
     "pl2":{"value":175,"min":28,"max":175,"default":175,"unit":"W","writable":true,"label":"PL2"},
     "dynamic_boost":{"value":25,"min":5,"max":25,"default":25,"unit":"W","writable":true},
     "thermal_target":{"value":87,"min":75,"max":87,"default":87,"unit":"°C","writable":true},
     "base_clock_offset":{"value":0,"min":0,"max":200,"default":50,"unit":"MHz","writable":false,
        "reason":"Requiere sesión X11 con Coolbits; no disponible en Wayland"},
     "mem_clock_offset":{"value":0,"min":0,"max":300,"default":100,"unit":"MHz","writable":false,
        "reason":"…"}},
   "session":"wayland"}
  ```
- `python -m rog_monitor.power_control apply --json '{"pl1":120,"pl2":160,...}'`
  → validates each key against the live sysfs min/max + allowlist, writes via the
  pkexec script, reads back, returns `{"ok":true,"controls":{…}}` or `{"ok":false,"err":…}`.
- `python -m rog_monitor.power_control reset` → writes all stock defaults.
- Electron IPC (Agent 2 adds to main.js, mirroring `get-settings`/`save-settings`):
  `get-power-control` → `runJsonModule('rog_monitor.power_control',['state'])`;
  `set-power-control` (payload) → `runJsonModule(...,['apply','--json',JSON])` but
  the **write itself** is done by the script through `pkexec` (see §3 Agent 1);
  `reset-power-control` → `[...'reset']`. preload: `window.rog.getPowerControl()`,
  `setPowerControl(payload)`, `resetPowerControl()`.
- Snapshot: Agent 1 also adds `"power_control": self.power.snapshot()` to
  `app.py:sample()` (lightweight, read-only) so the TUI and any subscriber see
  current values without a separate call.

### 2.3 THEMES schema (Agent 3)
`app.js`: `[id, name, desc, [darkBg, darkAccent], [lightBg, lightAccent]]`.
`style.css`: two blocks per theme —
`html[data-mode="dark"][data-theme="<id>"]{ --bg --panel --hair --accent --accent2 --chip; }`
and the `light` equivalent (tinted panels, never flat white). You may add new
custom props (e.g. `--glow`) as long as they degrade gracefully.

### 2.4 Block id map (Agent 5 four-states targets)
Left: `cpu-block gpu-block fans-block aura-block`. Right: charts, `bench-block`,
`system-block`, `events-block`, `procs-block`. RAM meter `#ram-meter`, fans host
`#fans`. Power modal will be `#power-modal` (Agent 2). New topbar buttons go in
`<div class="controls">`.

## 3. Per-agent briefs

### Agent 1 — Backend: power & clock control + device DB (Python)
Deliver `power_control.py` with a `PowerControl` class: `snapshot()` (read-only,
fast, cached ~5 s), `state()`, `apply(changes)`, `reset()`; the §2.2 CLI; and the
allowlisted, double-clamped writes. `device_profiles.json`: the G614JV entry
(table §1) + a generic "auto-from-sysfs" fallback + room for community entries +
a `custom` mechanism (user JSON in `~/.config/rog-monitor/`). Detection: match on
DMI product (`/sys/class/dmi/id/product_name` → "G614JV"), else read live sysfs
ranges. `scripts/apply-power-control.sh`: args `attr=value …`; for each, confirm
attr ∈ allowlist, read `min_value`/`max_value`, clamp, write `current_value`;
print resulting values; never touch anything else. Add a compact read-only power
line to `ui.py` (PL1/PL2/boost/thermal current) for TUI parity, behind i18n.
Add 2 anchored lines to `app.py` (`self.power = PowerControl()` in `__init__`,
`"power_control": self.power.snapshot()` in the `sample()` dict). **Test** with
`py_compile`, a fake sysfs root via an env override (e.g. `ROG_FW_ATTRS_DIR`), and
`python -m rog_monitor.power_control state`. NEVER write real values in tests.

### Agent 2 — Power-control desktop UI + IPC
A new topbar button `PODER` (id `power-btn`) opens modal `#power-modal`
("CENTRO DE PODER") with **CPU** and **GPU** tabs (mirror Armoury Crate's Manual
Mode). Each control = labeled slider + number box, bounded to `min..max`, value
preset to current, with the stock default marked. Show units, tooltips (reuse
Armoury Crate's wording, translated). Gated controls (Wayland clock offsets)
render disabled with their `reason` (four-state style). Buttons: **APLICAR**
(consent dialog summarizing the change + risk, then `setPowerControl`), **RESET A
FÁBRICA** (`resetPowerControl`), Cancelar. Live current-values via your own
`window.rog.onStats` subscriber reading `stats.power_control`. Add IPC to main.js
+ preload per §2.2. CSS in `styles/power.css`, link in head. JS in `power.js`,
script before `</body>`. Make it draggable (reuse `makeDraggable('power-modal')`
pattern — add the id to that array via your power.js, or call it yourself).
Wire `power-modal` background-click-to-close like other modals. **Test**
`node --check` on main.js/preload.js/power.js. Do not write hardware.

### Agent 3 — Themes: make them imponentes; fix light mode; +4 palettes
Keep the 8 existing, **rework every light variant** so it reads premium (rich
tinted panels, real contrast, glow on accents — not pale/flat). Add four:
- **`neon-nights`** "Neon Nights" — Miami-night synthwave (hot magenta/pink +
  electric cyan/blue, deep indigo bg, strong glow). Reference: *Third Crisis /
  Neon Knights* vibe Marshall named.
- **`cyberpunk`** "Cyberpunk" — Night-City high-contrast (electric yellow +
  cyan, near-black bg, hazard accents).
- **`aurora`** "Aurora" — boreal teal→violet premium dark.
- **`alba`** "Alba" — a genuinely elegant **light** showcase theme (warm
  ivory/porcelain + gold/rose accent) to prove light mode can be imponente.
Update both `THEMES` (app.js) and the palette CSS (style.css). Aim for the
polish level of Hermes Desktop. Verify every theme in **both** light and dark.
Keep the house identity rules (rule 7). `node --check app.js`.

### Agent 4 — Lighting: from 4 modes to the full Aura-style grid (honest)
Replace the small chip row with a **9-tile mode grid** like Aura Sync:
Static, Breathing(Respiración), Strobing(Pulse), Color Cycle, Rainbow,
Starry Night, Music, Smart, Adaptive. Wire ONLY the 5 the keyboard supports
(asusd `SupportedBasicModes` = static, breathe, rainbow-cycle, rainbow-wave,
pulse) + Music (existing modo música). The rest render as tiles in a clear
**"no soportado por el teclado interno"** / **"próximamente (Redragon)"** state —
никаких guessed HW commands (brick risk, see docs/redragon-protocol.md). Improve
`aura.py` snapshot to return a rich, labeled, icon-tagged mode list with a
`supported`/`reason` flag per mode so the UI is data-driven and honest. Keep the
existing apply path/IPC. CSS in `styles/lighting.css`. `py_compile aura.py`,
`node --check app.js`.

### Agent 5 — First-run wizard + 4 states per widget
**Wizard** (first launch only; gate on a localStorage flag + offer "volver a
ver"): welcome → detect fans → explain/permissions → optional calibrate →
optional CPU/GPU benchmark → quick tour of each block (incl. the new CENTRO DE
PODER and themes). Beautiful, on-brand, skippable. New `wizard.js` + a
`#wizard-modal` in index.html + `styles/onboarding.css`.
**Four states per widget** (con datos / cargando / sin datos / error) for
cpu-block, gpu-block, fans, RAM, disks, procs: a `widget-states.js` that
registers its own `onStats` subscriber + `onBackendDown`, sets `data-state` on
each block, and shows skeleton (loading), "sin datos" placeholder, or an explicit
error chip (e.g. RAM that won't read, a fan stuck at 0 RPM shown as *parado*, not
blank). Additive skeleton markup in index.html; styles in onboarding.css (or a
second file). Never show "medido" without measurement (mirror the fan rule).
`node --check`.

### Agent 6 — Docs & open-source readiness
Update `README.md` (it's stale — still says v5/3 themes/`t` cycles rog/ice/matrix;
now 12 themes, power control, etc.) with: feature list incl. **Centro de Poder**
calibrated for the G614JV, a **clear safety note** (firmware-clamped, consent,
reset), and a **Supported devices** section + **how to add your own device**
(point to `docs/supported-devices.md` describing the `device_profiles.json`
schema and how to read your Armoury Crate ranges). Finish `docs/roadmap.md`
(mark v9/v10 items this release completes: power control with consent, wizard,
4-states, themes, lighting grid; keep undervolt history note but record the
2026‑06‑12 reversal w/ the safe-range justification). `CHANGELOG.md` → a
**v9.0.0** entry. Add `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/` (bug +
device-request), and `.github/workflows/ci.yml` (lint + `py_compile` +
`node --check` + `python -m rog_monitor --json` smoke on Ubuntu). No code, no
push, no publishing — leave it *ready* for Marshall to publish.

## 4. Synthesis (orchestrator, after all agents)
Merge worktrees (additive index.html insertions + head links + scripts are the
only real conflicts), reconcile the power IPC seam (Agent 1↔2), `node --check` +
`py_compile` everything, launch the Electron app via CDP and screenshot every new
surface (power modal both tabs, all 12 themes light+dark, lighting grid, wizard,
4-states), bump to **v9.0.0**, update HANDOFF.md + CHANGELOG, commit locally
(**no push**), and write Marshall a summary incl. anything that needs his clicks
(GUARDAR Y APLICAR, first real power-apply, Redragon USB capture).
