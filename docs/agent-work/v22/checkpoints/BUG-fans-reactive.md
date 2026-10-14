# BUG — ventiladores que no bajan / curvas que no se aplican (2026-10-14)
Estado: DONE en código + tests · despliegue root PENDIENTE (`sudo bash scripts/install-system.sh`)

## Evidencia
- Equipo: ROG Strix G614JV, BIOS G614JV.333, kernel 7.2.9, `asus-wmi` (hwmon `asus_custom_fan_curve`).
- Prueba controlada (carga CPU 150 s y 5 min de enfriamiento, log cada 2 s en
  `.ai/private/rog-v22/logs/fans-2026-10-14/heat-cooldown.log`):
  - subida: a 95 °C pasa de 4200 a 6000 rpm en ~30 s (~60 rpm/s);
  - bajada: mantiene 6000 rpm ~20 s, luego baja en escalones (5200, 4200) y vuelve a normal ~75 s después de acabar la carga.
  - La curva SÍ manda en cargas cortas. El GPU fan también sube con solo la CPU caliente.
- Mismo síntoma reportado en la Strix G16 2025 (Windows/Armoury Crate): tras carga larga los ventiladores quedan arriba
  y solo cambiar de modo los resetea → bug de firmware del EC, no de Linux.
- Journal: `Applied quiet fan curves to 2 fans` tras `printf: write error: Invalid argument` (EINVAL al habilitar;
  asusd escribe a la vez al cambiar de perfil). Quiet nunca aplicaba PL1/PL2: `'dynamic_boost'=5 fuera del rango seguro [0, 0]`.

## Cambios
1. Vigilante (`check_stuck_fans`): umbral 3000 rpm (antes 4500: en quiet/balanced nunca saltaba), margen max(900, 25 %),
   cada ventilador contra su curva a la temperatura más caliente (CPU o GPU), cooldown 3 min, y deja en el journal si el
   re-aplicado funcionó (`Fans back on their curve` / `still high`).
2. `curves_match` compara los 8 puntos (antes solo el 8): un cambio en la parte baja de la curva no se aplicaba hasta cambiar de perfil.
3. `set_curve` reintenta una vez el enable (EINVAL por carrera con asusd).
4. `power_control.profile_power_for` recorta al rango VIVO del firmware (quiet: DB [0,0]) → quiet recibe sus PL1/PL2.
5. Curvas por defecto desde 50 °C, iguales en servicio y app (`tests/test_fan_defaults.py`); el fan-curves.json del
   propietario migrado (backup `fan-curves.json.pre-50c.bak`). Editor: eje 40–105 °C.
6. CI: cobertura Python (`coverage`, piso 50 %) y Node (`--experimental-test-coverage`, piso 90 % líneas).

## Pruebas
- Python 196 OK · Node 50 OK · i18n OK · `bash -n` todos los scripts. Cobertura Python 51 %, Node 99 %.
- Prueba en hardware del vigilante nuevo: tras el despliegue root, mirar `journalctl -u rog-profile-sync | grep -i fan`.
