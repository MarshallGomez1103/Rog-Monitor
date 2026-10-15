#!/usr/bin/env python3
"""Resume los matrix-*-raw.txt en una tabla Markdown.
Uso: python3 -I summarize.py matrix-wayland-raw.txt matrix-x11-raw.txt"""
import json
import re
import sys

for path in sys.argv[1:]:
    cases = re.split(r"^=== CASE ", open(path, encoding="utf-8").read(), flags=re.M)[1:]
    print(f"\n### {path}\n")
    print("| modo | monitor | anclaje | pedido (DIP) | Electron tras setPosition | Electron a 1,5 s | medido (compositor/X11) |")
    print("|---|---|---|---|---|---|---|")
    for c in cases:
        head = c.split("\n", 1)[0]
        m = re.match(r"mode=(\S+) display=(\d) anchor=(\S+)", head)
        mode, mon, anchor = m.groups()
        pj = re.search(r"^ELECTRON\|PROBE (\{.*\})$", c, flags=re.M)
        if not pj:
            print(f"| {mode} | {mon} | {anchor} | - | - | - | SIN DATOS |")
            continue
        j = json.loads(pj.group(1))
        b1, b2 = j["afterSet"], j["afterSettle"]
        f = lambda b: f"{b['x']},{b['y']} {b['width']}x{b['height']}"
        kw = re.search(r"^KW\|ROG Overlay Probe\|([^|]*)\|.*?\|out=([^|]*)", c, flags=re.M)
        xw = re.search(r"^XWININFO\|.*?X:\s+(-?\d+).*?Y:\s+(-?\d+).*?Width:\s+(\d+).*?Height:\s+(\d+)", c, flags=re.M)
        if xw:
            med = f"X11 {xw.group(1)},{xw.group(2)} {xw.group(3)}x{xw.group(4)}"
        elif kw:
            med = f"KWin {kw.group(1)} en {kw.group(2)}"
        else:
            med = "no visible"
        print(f"| {mode} | {mon} | {anchor} | {j['requested'][0]},{j['requested'][1]} | {f(b1)} | {f(b2)} | {med} |")
