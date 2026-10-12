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

## Relacionado: límites de potencia por perfil casi nunca aplicados
Evidencia: journal 2026-10-09..12 — 14 de 15 "Could not apply <perfil> power limits" con `printf: write error: Device or resource busy` en `ppt_pl2_sppt/current_value`, todas justo tras un cambio de perfil; la única OK fue un reinicio del servicio sin cambio de perfil. `sync_once` marcaba LAST_POWER_PROFILE aunque fallara → nunca se reintentaba.
Cambio: `apply_profile_power` devuelve 1 si falla; `sync_power` reintenta en cada vuelta (≤30 s) hasta 5 veces y luego se rinde (log) hasta el próximo cambio de perfil.
Tests: `tests/test_fan_stuck.py::PowerLimitRetry` (EBUSY×2 → aplica a la 3ª y no reintenta más; siempre EBUSY → 5 intentos y "Giving up").

## Revisión 2026-10-12 (tarde) — regla del propietario: "frío → bajan todos; caliente → suben todos"
Evidencia: journal 12:11 "Fans stuck high for 61 s with the CPU at 64 °C" (la 1ª versión sí actuó una vez); pero la captura del propietario mostraba CPU 6100 / GPU 2700 / MID 6000 con la CPU ~74 °C y la regla vieja (solo ventilador CPU, solo <70 °C, umbral fijo 5500 rpm) no hacía nada.
Cambio: cada ventilador contra SU curva aplicada a SU temperatura (CPU/MID: paquete CPU; GPU: dGPU vía nvidia-smi solo si está activa, suspendida = fría), pasado a rpm con la calibración medida de fan-curves.json (o max_rpm). Atasco = rpm ≥4500 y > esperado + 1200 durante ≥60 s, a cualquier temperatura → enable=2 1 s + reescribe TODAS las curvas; enfriamiento de 5 min entre arreglos. Centinela de "sin atasco" ahora vacío (no 0).
Tests (12): caso de la captura (74 °C, 6100/2700/6000) → re-aplica; máquina caliente → nada; GPU caliente con ventilador GPU alto → nada; GPU dormida con su ventilador pegado → re-aplica; rpm normales a 74 °C → nada; cooldown; interpolación y calibración.
Prueba en hardware real (solo lectura, sin escribir): CPU 77 °C / GPU 56 °C, 4200/2700/4100 rpm vs esperado 4800/2343/4966 → "normal".
