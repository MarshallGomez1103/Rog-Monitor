#!/usr/bin/env python3
"""Analiza una captura: busca los colores de prueba y da su caja envolvente.
Uso: python3 -I shot-analyze.py captura.png
 - mezcla  (128,0,208): overlay rgba(255,0,255,.5) SOBRE fullscreen #0000a0
 - magenta (255,0,255): overlay sin transparencia (opaco)
 - azul_fs (0,0,160)  : ventana fullscreen visible
Imprime conteos y bbox en pixeles de la captura. No guarda la captura."""
import sys
from PIL import Image

im = Image.open(sys.argv[1]).convert("RGB")
W, H = im.size
px = im.load()
targets = {"mezcla": (128, 0, 208), "magenta": (255, 0, 255), "azul_fs": (0, 0, 160)}
tol = 14
res = {k: [0, W, H, -1, -1] for k in targets}
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        for k, (tr, tg, tb) in targets.items():
            if abs(r - tr) <= tol and abs(g - tg) <= tol and abs(b - tb) <= tol:
                v = res[k]
                v[0] += 1
                v[1] = min(v[1], x)
                v[2] = min(v[2], y)
                v[3] = max(v[3], x)
                v[4] = max(v[4], y)
print(f"SHOT size={W}x{H}")
for k, v in res.items():
    if v[0]:
        print(f"SHOT {k}: n={v[0]} bbox=({v[1]},{v[2]})-({v[3]},{v[4]})")
    else:
        print(f"SHOT {k}: n=0")
