# ADR-0002: No new dependencies; tests on the standard library

- Status: accepted
- Applies to: `src/rog_monitor/`, `tests/`, `desktop/test/`, `desktop/renderer/`

## Context

ROG Monitor is installed on personal machines, partly as an AppImage and partly
from a clone, and part of it runs as root. Every dependency adds install
friction, supply-chain surface and something to keep updated. The Python core
needs only `rich` for the TUI; the Electron app has a plain-JavaScript
renderer with no build step.

## Decision

- Python: standard library first. `rich` is the only runtime dependency
  (`requirements.txt`). NVML is called through `ctypes`, not a pip package.
  Add a dependency only when it solves a real problem the standard library
  cannot.
- Tests use `unittest` (Python) and `node:test` (desktop). No pytest, no Jest,
  no browser-driver framework.
- No UI framework in the renderer. Visual consistency comes from CSS tokens
  (custom properties such as `--accent`, `--panel`, `--hair` and the semantic
  thermal colors) set per palette, not from a component library or from
  per-theme stylesheets.
- Shell helpers rely on tools already present on the target systems.

## Consequences

- CI installs `requirements.txt` and, for packaging, `npm ci`; there is no
  test tooling to install or pin.
- Some things are written by hand (an NVML binding, the i18n loader and
  validator, the TUI key parser). That code is small and covered by tests, but
  it is ours to maintain.
- A new palette is a set of token values, not new components.
- A pull request that adds a dependency has to explain why the standard
  library is not enough.
