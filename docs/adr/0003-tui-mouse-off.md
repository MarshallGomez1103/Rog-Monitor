# ADR-0003: Mouse reporting is off in the TUI

- Status: accepted
- Applies to: `src/rog_monitor/keys.py`

## Context

The terminal UI is keyboard-only: it has no clickable elements and no mouse
features. With mouse tracking enabled, click and wheel reports arrive on stdin
as escape sequences, and some of them leaked into the key handler as ordinary
keys, triggering actions the user never pressed. Mouse reporting also takes
over text selection and scrolling in most terminals.

## Decision

`KeyReader` does not enable mouse tracking. It puts the terminal in cbreak
mode and nothing else. The key parser still discards complete mouse reports
(SGR and X10), CSI, SS3 and Alt sequences, so a terminal that sends them anyway
cannot produce phantom key presses.

## Consequences

- Text selection, copy and scrollback behave as usual in the terminal.
- Only keys bound in `app.py` (`BOUND_KEYS`) do anything; everything else is
  ignored.
- If a future feature needs the mouse, enable it in `KeyReader.__enter__` (and
  disable it in `__exit__`) together with that feature. The parser already
  skips the reports, so only the enable/disable sequences are missing.
