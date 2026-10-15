# ADR-0007: Overlay strategy on KDE Wayland (Electron window vs. in-game HUD)

- Status: proposed (S10 / F6-01 + F6-02). Not accepted until the owner runs the
  checks in "What the owner must validate" with a real game.
- Applies to: `desktop/main.js` (`createOverlay`, `positionOverlay`), the
  overlay editor planned for S11, the real-game validation of S12.
- Evidence: `docs/agent-work/v22/evidence/S10/` (raw outputs and the isolated
  probe in `probe/`), summary in
  `docs/agent-work/v22/checkpoints/F6-01-F6-02.md`.
- Owner requirement (V22-D12): the overlay must work with 1-4 monitors, above
  full-screen games, in windowed/borderless mode and on the desktop, "like the
  Steam overlay", and the chosen anchor (for example monitor 1, top-right) must
  be honoured. If that is impossible with an Electron window on KDE
  Wayland/Bazzite, plan B must be documented (this ADR).

## Context

The product overlay (`createOverlay`) is a frameless, transparent,
`focusable:false`, `alwaysOnTop` + `setAlwaysOnTop(true,'screen-saver')`,
`setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})`,
`setIgnoreMouseEvents(true)` window placed with `setPosition()` from
`screen.getDisplayNearestPoint(...).workArea`. The app starts with Electron's
default platform choice, which on a Wayland session is **native Wayland**
(Electron 44.7.0, no `--ozone-platform` flag in `start.sh`).

Everything below was **measured** on the owner's machine (KDE Plasma 6.7.5
Wayland on Bazzite, KWin 6.7.5, XWayland on `:0`, two monitors: `eDP-1`
0,0 1600x1000 scale 1.2 and `HDMI-A-3` 1600,0 1920x1080 scale 1) with an
isolated probe that copies the `createOverlay` options (a 232x150 window).
Nothing was measured with a real game, with 3-4 monitors, on a pure X11
session, or with hot-plugging.

### Measured matrix (2 monitors; probe copying `createOverlay`)

| Capability | Native Wayland (default) | XWayland (`--ozone-platform=x11`) |
|---|---|---|
| Honours requested position (`setPosition`) | **No.** KWin centres the window on the active output; Electron reports the requested position right after the call and `0,0` 1.5 s later (8/8 cases, 4 anchors x 2 monitors, all measured at 2444,442 on `HDMI-A-3`) | **Yes.** 8/8 cases land on the requested anchor; on-screen check (screenshot) of the top-right anchor on both monitors shows the window about 5 logical px closer to the edge than requested, from Electron's rounded scale (see Scale) |
| Chooses the monitor | **No** (follows the active output: `HDMI-A-3` in all 8 recorded cases, `eDP-1` in an earlier unrecorded run) | **Yes** (X11 coordinates cover both monitors; confirmed on both) |
| Window is above an active full-screen window | **No.** Full-screen active window: KWin layer 5 (above), overlay: layer 2, no pixel of the overlay visible in the screenshot (recorded case, both windows on `HDMI-A-3`). `keepAbove=false` although `alwaysOnTop` was requested. The overlay was visible above the full-screen window only in the recorded run where it had itself become the active window (both on `eDP-1`), which means it had taken focus away from the "game" | **Yes.** 3/3 recorded cases (x11 full-screen on `eDP-1`, on `HDMI-A-3`, and Wayland-native full-screen on `HDMI-A-3`): the overlay colour, blended over the blue full-screen, is visible in the screenshot at the requested corner. In an earlier unrecorded run it also stayed on top when the full-screen window had lost focus |
| Transparency | Not recorded | **Yes** (50 % magenta over blue gives the blended colour, so alpha is composited) |
| Stays out of the way (does not take focus) | **No.** `focusable:false` is not honoured: the probe became KWin's active window in 4 of 8 positioning runs and re-took focus during the full-screen runs. Also `skipTaskbar=false` (it appears in the task manager) | **Yes.** The window is an X11 *override-redirect* window (`xwininfo`: `Override Redirect State: yes`), never managed or activated by KWin, no taskbar entry (KWin does not list it) |
| Scale | Per display and correct: `1.2` and `1` (equal to `kscreen-doctor`) | One global factor for all displays: `1.203125` on both (X11 space = logical x 1.2). Rounded bounds (1596x998 instead of 1600x1000). The 232x150 window became 239x157 DIP (286x187 X px) |
| Work area | Equal to the full bounds even though the panel exists (panel at y=938 on `eDP-1`): `workArea` cannot be trusted to avoid the panel | Inconsistent: smaller than the bounds on `HDMI-A-3` (952 vs 1078 high) but equal to them on `eDP-1` (998) |
| Memory (probe, RSS summed over the process tree; over-counts shared pages) | 692 MiB | 625 MiB (no extra cost from XWayland) |

Other measured facts:

- KWin exposes `zwlr_layer_shell_v1` (v5) and `org_kde_plasma_shell`, and
  LayerShellQt is installed, so the compositor *could* place a layer-shell
  overlay. Electron/Chromium has no public API to create layer-shell surfaces;
  using it would need a native helper (new dependency, ADR-0002), so it is
  **not** part of this proposal.
- MangoHud 0.8.4 is installed. Its HUD is drawn inside the game's own swap
  chain. With a Vulkan test app (`vkcube`, not a game) and a temporary config,
  `position=top-right` and `position=bottom-left` placed the HUD at the matching
  corner of the app window under XCB (2/2) and `top-right` under Wayland (1/1).
- MangoHud accepts `position` = `top-left`, `top-center`, `top-right`,
  `middle-left`, `middle-right`, `bottom-left`, `bottom-center`,
  `bottom-right` (strings in `libMangoHud.so`; the shipped example config only
  shows `position=top-left`). There is no `center` and no way to pick a monitor:
  the HUD follows the game window.

## Decision (proposed)

Two layers, because no single window type covers every case:

1. **Layer A: Electron overlay forced to XWayland** for desktop, windowed,
   borderless and full-screen windows (the measured 3/3 on-top cases, correct
   anchor and monitor, no focus theft). The product keeps the current
   `createOverlay` options. The Chromium switch is process-wide and must be set
   before `app.whenReady()`, so there are three ways to get it:
   - **A1** `app.commandLine.appendSwitch('ozone-platform','x11')` always. Simple
     but the main window also leaves native Wayland (global 1.2 factor, so the
     `HDMI-A-3` window is resampled; blurrier text there). Not recommended.
   - **A2 (recommended for S12)** a persisted opt-in "overlay compatibility mode
     (XWayland)" read synchronously at start; the app asks to restart when the
     user switches it. The main window stays native Wayland while the mode is off.
     Cost: one restart; limitation text in the UI.
   - **A3** a second Electron process (`--ozone-platform=x11`) that only hosts
     the overlay and receives metrics over stdio/IPC. No restart and the main
     window stays native, at the price of one more Electron process (the probe
     measured about 625 MiB RSS over-counted for a whole tree; the real private
     cost is lower but must be measured) and a lifecycle to manage. Keep as the
     follow-up if the owner rejects restarts.
2. **Layer B: "game mode" through MangoHud, configured by the app**, for the
   cases where a window above the game is not possible or not reliable
   (exclusive/direct-scan-out full-screen, gamescope, Wayland-native games,
   anti-overlay behaviour). The app writes a MangoHud config with the same
   metrics and mapped anchor, and the user adds `mangohud %command%` (or
   `MANGOHUD=1`) to the game once. The app must say clearly that this layer
   follows the game window (no monitor choice) and that `center` maps to
   `top-center`.

Plan B if the owner's real-game test fails on layer A: ship layer B as the
full-screen answer and keep layer A for windowed/borderless/desktop. If
XWayland itself is unavailable, fall back to the native-Wayland window with an
honest notice that anchor, monitor and on-top-of-fullscreen are not guaranteed
(measured behaviour above), never an "all good" message.

Nothing here adds a dependency: layer A is a Chromium switch, layer B reuses
the MangoHud the app already integrates for FPS logging.

## MangoHud notes for layer B

- Config location (priority order, from `man mangohud`):
  `<app dir>/MangoHud.conf`, `$XDG_CONFIG_HOME/MangoHud/<app>.conf`,
  `$XDG_CONFIG_HOME/MangoHud/MangoHud.conf`; override with
  `MANGOHUD_CONFIGFILE`; inline options with `MANGOHUD_CONFIG=` (highest
  priority).
- Activation per game: Steam launch option `mangohud %command%`; Vulkan
  `MANGOHUD=1`; OpenGL `mangohud` wrapper (`--dlsym` when needed).
- Metrics: `fps`, `frametime`, `frame_timing`, `cpu_stats`, `cpu_temp`,
  `cpu_power`, `cpu_mhz`, `core_load`, `gpu_stats`, `gpu_temp`, `gpu_power`,
  `gpu_core_clock`, `gpu_fan`, `vram`, `ram`, `swap`, `io_read`, battery
  options, `procmem`, `resolution`.
- Look: `font_size`, `font_file`, `text_color`, `background_color`,
  `background_alpha`, `alpha`, `round_corners`, `text_outline`, `hud_compact`,
  `horizontal`, `offset_x`/`offset_y`, `width`/`height`, `table_columns`.
- Keys: `toggle_hud` (default Shift_R+F12), `toggle_hud_position`
  (Shift_R+F11), `reload_cfg` (Shift_L+F4), `toggle_logging` (Shift_L+F2).
- Shared file: `~/.config/MangoHud/MangoHud.conf` already holds the user's own
  settings plus a marked `ROG Monitor FPS` block (`set-fps-logging`). Layer B
  must edit only a marked block of its own, never rewrite the user's lines, and
  must not use `exec=` (it runs shell commands; ADR-0006).
- Limits: MangoHud has no fans/ROG-profile metric of its own, so those rows
  cannot be mirrored by MangoHud; the app should say which rows are
  unavailable in game mode.

## Consequences

- S11 (editor) can offer 7 anchors + monitor, but the UI must show per-mode
  limits: Wayland-native shows "position and monitor not guaranteed"; game mode
  has no monitor choice and no `center`.
- S12 must treat everything marked "not verified" below as open until the owner
  confirms it. Public text must not claim "works over full-screen games" or
  "like Steam" before that.
- The product code must stop trusting `workArea` and `setPosition` on Wayland,
  and must read displays again on `display-added`/`display-removed`/
  `display-metrics-changed` (not wired today; S10 audit).

## Not verified (explicitly open)

- Any real game (Proton/Wine, native Vulkan/OpenGL, borderless and exclusive
  full-screen), including KWin direct scan-out of a full-screen game, which can
  stop compositing windows above it.
- 3 or 4 monitors; monitor unplug/replug; a different primary monitor.
- Click-through of the XWayland overlay (`setIgnoreMouseEvents`) against a real
  game, and that the game keeps keyboard/mouse focus.
- Sharpness of the 1.2 scaled XWayland window on the scale-1 monitor
  (measured size/position only, no visual crispness check).
- A pure X11 session and other compositors (GNOME, Hyprland): not tested, no
  statement made.
- Overlay through `gamescope` or Steam Game Mode.

## What the owner must validate

See the numbered list in `docs/agent-work/v22/checkpoints/F6-01-F6-02.md`
(section "Validacion del propietario").
