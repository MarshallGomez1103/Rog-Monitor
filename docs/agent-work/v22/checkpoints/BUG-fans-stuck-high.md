# BUG 2026-10-12 — Ventiladores a ~6000 rpm con la CPU fría en performance
Estado: TESTED con fakes; requiere `sudo bash scripts/install-system.sh` (copia root) y confirmación del propietario.
Reporte: tras jugar, en performance, CPU 59.9 °C / paquete 67 °C / GPU 46 °C y los 3 ventiladores a ~6000 rpm sin bajar; al pasar a balanced/saver bajaron a 3400/3800/3400 al instante.
Evidencia (solo lectura):
- journal rog-profile-sync 2026-10-11 15:45 → 2026-10-12 01:00: performance con NUESTRA curva activa todo el rato (sin re-aplicaciones = nadie la pisó). A las 01:00 cambio a balanced → curva reescrita → bajan.
- Curva performance aplicada (hwmon7): a 60 °C pide pwm 69/255 (~2500–3000 rpm según calibración); 6000 rpm ≈ pwm 210 ≈ >85 °C. El EC no re-evalúa la curva al enfriarse hasta que alguien la reescribe.
- asusd también escribe sus curvas (`enabled: false`) en cada cambio de perfil (33 escrituras hoy) — tercer escritor, ver GRD-02/F7.
Cambio (`scripts/rog-profile-sync.sh`): `check_stuck_fans` en cada vuelta (≤30 s) cuando la curva ya es la correcta: si el paquete CPU <70 °C, el ventilador de CPU ≥5500 rpm y la curva aplicada pide <140/255 durante ≥60 s → log + enable=2 1 s + re-aplicar la curva del perfil. Solo el ventilador de CPU decide (GPU/MID pueden ir altos con razón). `ponytail:` umbral fijo; calibración si hay falsos positivos. El script ahora es importable (`source`) sin ejecutar el bucle.
Tests: `tests/test_fan_stuck.py` (interpolación; 6000 rpm frío → re-aplica a los ≥60 s y no a los 30; caliente → nada; rpm normal → nada; episodio se reinicia; solo GPU alto → nada). Suite completa OK. `install-system.sh --dry-run` OK.
Tests TUI pty: Esc/resize verifican "SYSTEM" esperando por condición (con el equipo caliente PROCESSES sale de pantalla por eventos de throttling).
No verificado: comportamiento real del EC tras la re-aplicación (lo confirma el propietario tras instalar: jugar, salir, esperar 2 min en performance).
