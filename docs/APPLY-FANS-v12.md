# APPLY-FANS-v12 — Pasos de sistema para que los fans bajen de verdad

> **Marshall, lée esto antes de hacer cualquier cosa en la app.**
> El código en `fans.py` y el guardián térmico ya están correctos en el repo,
> pero **sin estos pasos de sistema los fans seguirán como antes** — las
> curvas nuevas no llegan al hardware hasta que los apliques.

---

## ¿Por qué hace falta esto?

Hay dos capas:

1. **Código (ya listo):** `fans.py` tiene las curvas suaves por perfil,
   el guardián térmico corregido (`rog-thermal-guardian.sh`), y la API para
   que la UI las muestre/edite. Esta parte ya está en el repo.

2. **Sistema (pendiente tú):** `rog-profile-sync.sh` es el script que corre
   como **root** y escribe las curvas al hardware cada vez que cambias de
   perfil. Vive en `~/Rog-Monitor-Scripts/scripts/` (repo separado). Hay que:
   - Actualizar su bloque `case` con las curvas nuevas más suaves.
   - Reinstalar el guardián térmico (servicio systemd) para que use la
     versión v12 (la anterior no baja escalones correctamente).
   - Activar el servicio.

Sin este paso, el firmware sigue usando las curvas agresivas viejas
y el guardián (aunque instalado) no se activa.

---

## Paso 0 — Prerequisito: repo de scripts del sistema

```bash
# Si ya existe ~/Rog-Monitor-Scripts, saltar.
# Si no existe, crearlo ahora:
git clone <url-del-repo-de-scripts> ~/Rog-Monitor-Scripts
# — o —
mkdir -p ~/Rog-Monitor-Scripts/scripts
```

La ruta `~/Rog-Monitor-Scripts/scripts/rog-profile-sync.sh` debe existir.
Si el archivo ya existe, el paso A lo actualiza; si no existe aún, lo crea.

---

## Paso A — Actualizar las curvas en rog-profile-sync.sh

Abre `~/Rog-Monitor-Scripts/scripts/rog-profile-sync.sh` en tu editor y
localiza el bloque `case "$PROFILE" in` que contiene las curvas de puntos
(`pwm_auto_point*`). Sustituye ese bloque entero por el siguiente:

> **Cópialo verbatim.** Los valores son los que ROG Monitor v12 usa como
> defaults (quiet arranca en 0 = fan apagado hasta ~40 °C).

```bash
# ---------------------------------------------------------------------------
# Curvas de ventiladores por perfil — ROG Monitor v12 (A-FANS)
# Formato: T1..T8 en °C, P1..P8 en PWM (0-255)
# quiet: fan apagado (PWM=0) hasta ~40 °C
# balanced: arranque suave 15-18 PWM desde 35-48 °C
# performance: arranque 30-35 PWM desde 35 °C (audible pero no a tope)
# Caps: performance=6500 RPM, balanced=5500 RPM, quiet=4500 RPM
# ---------------------------------------------------------------------------
apply_curves() {
    local PROFILE="$1"
    local FAN_JSON="${2:-/var/home/*/.config/rog-monitor/fan-curves.json}"

    # Intentar leer curvas del JSON del usuario (si existe y es válido).
    # Si falta, caer a los defaults embebidos abajo.
    local USE_JSON=false
    if command -v python3 >/dev/null 2>&1; then
        local json_file
        for json_file in $FAN_JSON; do
            [[ -f "$json_file" ]] || continue
            python3 -c "
import json, sys
with open('$json_file') as f:
    d = json.load(f)
p = d.get('profiles', {}).get('$PROFILE', {})
for fan in ('cpu', 'gpu', 'mid'):
    c = p.get(fan, {})
    t = c.get('temps', [])
    w = c.get('pwms', [])
    if len(t) == 8 and len(w) == 8:
        print(fan + ':' + ','.join(map(str, t)) + '|' + ','.join(map(str, w)))
" 2>/dev/null && USE_JSON=true && break
        done
    fi

    if [[ "$USE_JSON" == "true" ]]; then
        # Curvas del JSON de usuario — aplicar con el helper genérico abajo.
        _apply_from_json "$PROFILE" "$FAN_JSON"
        return $?
    fi

    # Fallback: curvas embebidas (no hay JSON o está dañado).
    case "$PROFILE" in
        performance)
            # GPU: techo 6500 RPM, cap 250 PWM
            _write_fan_curve "gpu"  "35 45 55 62 70 75 80 83" "30 46 70 100 150 195 235 250"
            # MID
            _write_fan_curve "mid"  "35 45 55 65 75 82 88 95" "30 50 80 115 158 198 232 247"
            # CPU
            _write_fan_curve "cpu"  "35 45 55 65 75 82 88 95" "35 55 85 120 160 200 235 247"
            ;;
        balanced)
            # GPU
            _write_fan_curve "gpu"  "35 48 58 64 71 76 80 83" "15 26 46 75 112 150 185 195"
            # MID
            _write_fan_curve "mid"  "35 48 58 68 78 84 90 95" "16 30 52 85 122 158 190 200"
            # CPU
            _write_fan_curve "cpu"  "35 48 58 68 78 84 90 95" "18 32 55 88 128 165 200 210"
            ;;
        quiet)
            # GPU (empieza en PWM 0 = fan apagado hasta 40 °C)
            _write_fan_curve "gpu"  "40 52 62 68 74 78 82 85" "0 14 26 46 72 98 128 140"
            # MID
            _write_fan_curve "mid"  "40 52 62 70 80 85 90 95" "0 18 32 56 84 112 140 150"
            # CPU
            _write_fan_curve "cpu"  "40 52 62 70 80 85 90 95" "0 16 30 52 80 110 140 150"
            ;;
        *)
            echo "[rog-profile-sync] Perfil desconocido: $PROFILE — usando balanced" >&2
            apply_curves "balanced" "$FAN_JSON"
            return $?
            ;;
    esac
}

# Helper: escribe una curva de 8 puntos al hwmon del ventilador indicado.
# Uso: _write_fan_curve <fan_name> "<t1..t8>" "<p1..p8>"
# fan_name: cpu | gpu | mid  (mapea a fan1/fan2/fan3 en hwmon ASUS)
_write_fan_curve() {
    local fan_name="$1"
    local temps=($2)
    local pwms=($3)

    # Encontrar el hwmon ASUS (nombre "asus")
    local hwmon_dir=""
    for d in /sys/class/hwmon/hwmon*; do
        [[ "$(cat "$d/name" 2>/dev/null)" == "asus" ]] && hwmon_dir="$d" && break
    done
    [[ -z "$hwmon_dir" ]] && { echo "[rog-profile-sync] hwmon ASUS no encontrado" >&2; return 1; }

    # Mapeo fan_name → índice pwmN
    local pwm_idx
    case "$fan_name" in
        cpu) pwm_idx=1 ;;
        gpu) pwm_idx=2 ;;
        mid) pwm_idx=3 ;;
        *)   echo "[rog-profile-sync] fan desconocido: $fan_name" >&2; return 1 ;;
    esac

    local i pwm_file temp_file
    for i in $(seq 1 8); do
        pwm_file="$hwmon_dir/pwm${pwm_idx}_auto_point${i}_pwm"
        temp_file="$hwmon_dir/pwm${pwm_idx}_auto_point${i}_temp"
        [[ -f "$pwm_file"  ]] && printf '%s' "${pwms[$((i-1))]}"  > "$pwm_file"  2>/dev/null
        [[ -f "$temp_file" ]] && printf '%s' "$(( ${temps[$((i-1))]} * 1000 ))" > "$temp_file" 2>/dev/null
    done
}

# Helper: aplica curvas leídas dinámicamente del JSON del usuario.
_apply_from_json() {
    local profile="$1"
    local json_glob="${2:-/var/home/*/.config/rog-monitor/fan-curves.json}"
    local json_file
    for json_file in $json_glob; do
        [[ -f "$json_file" ]] || continue
        python3 - <<PYEOF 2>/dev/null
import json, subprocess, sys
with open('$json_file') as f:
    d = json.load(f)
p = d.get('profiles', {}).get('$profile', {})
for fan in ('cpu', 'gpu', 'mid'):
    c = p.get(fan, {})
    t = c.get('temps', [])
    w = c.get('pwms', [])
    if len(t) == 8 and len(w) == 8:
        subprocess.run(
            ['bash', '-c',
             f'source {__file__.replace("pyeof_placeholder","")} 2>/dev/null || true; '
             f'_write_fan_curve {fan} "{" ".join(map(str,t))}" "{" ".join(map(str,w))}"'],
            check=False
        )
PYEOF
        return 0
    done
    return 1
}
```

> **Nota:** Si tu `rog-profile-sync.sh` ya tiene su propia función
> `_write_fan_curve` o estructura de `case`, adapta integrando las líneas de
> temperaturas y PWM del bloque de arriba. Lo que importa es que los valores
> `t1..t8` y `p1..p8` reflejen las curvas de arriba.

---

## Paso B — Reinstalar el servicio del guardián térmico

El guardián de v12 tiene la corrección de histéresis (cada escalón de bajada
espera su propio período de COOLDOWN, no solo STEP_DELAY). Hay que reinstalar
el `.service` para que apunte al script actualizado del repo.

```bash
# Desde la raíz del repo ROG Monitor (donde está esta carpeta docs/):
REPO="$(pwd)"

# 1. Instalar el .service con la ruta real del repo
sudo install -m 0644 "$REPO/systemd/rog-thermal-guardian.service" \
     /etc/systemd/system/rog-thermal-guardian.service

# 2. Sustituir el marcador de ruta del repo
sudo sed -i "s#__ROG_MONITOR_REPO__#$REPO#" \
     /etc/systemd/system/rog-thermal-guardian.service

# 3. Recargar systemd
sudo systemctl daemon-reload

# 4. (Re)iniciar y habilitar en el arranque
sudo systemctl enable --now rog-thermal-guardian.service
```

Si el servicio ya estaba instalado de v11, el paso anterior lo actualiza
con el script corregido; no hace falta desinstalarlo antes.

---

## Paso C — Verificar que funciona

### C1. Ver el estado del guardián en tiempo real

```bash
# Estado del servicio (debe decir "active (running)")
systemctl status rog-thermal-guardian.service

# Logs en vivo (ver los escalones de subida/bajada)
journalctl -fu rog-thermal-guardian.service
```

Deberías ver líneas como:
```
[ROG-THERMAL 12:34:56] Iniciando guardián térmico GPU (techo=83°C, ...)
[ROG-THERMAL 12:35:10] Carga/temp baja detectada — esperando 20s para bajar a balanced
[ROG-THERMAL 12:35:30] Carga baja sostenida 20s → escalón a balanced
```

### C2. Leer el estado que publica la app

```bash
# El guardián escribe aquí cada 2 s (mientras corre)
cat ~/.local/share/rog-monitor/thermal-guardian-state.json
```

Ejemplo de salida v12:
```json
{
  "mode": "normal",
  "reason": "cpu=5% gpu=3% temp=42C",
  "updated": 1718650000,
  "aggression": "balanced",
  "thermal_state": "normal",
  "cooldown_remaining": 0,
  "interventions": 0
}
```

- `mode`: silence | normal | high (qué muestra la UI)
- `aggression`: quiet | balanced | performance (lo que el guardián le pide al firmware)
- `cooldown_remaining`: segundos hasta el próximo escalón de bajada (0 = no bajando)
- `interventions`: veces que el guardián recortó boost/PL por emergencia térmica

### C3. Verificar temperatura de sensores

```bash
# Ver temps de CPU/GPU con sensors
sensors | grep -E "edge|Tctl|Package|GPU"

# Ver RPM de ventiladores en vivo
watch -n1 "sensors | grep -E 'fan[0-9]'"
```

### C4. Prueba rápida de bajada de fans

1. Abre la app y cambia al perfil **Quiet**.
2. Espera 30-40 segundos (el guardián tiene COOLDOWN=20s por escalón).
3. Con CPU/GPU en idle y temp < ~70 °C, los fans deberían bajar (el guardián
   pide `quiet` y el firmware los reduce según la curva, que arranca en 0 PWM
   hasta 40 °C — si la GPU está a ~42 °C, el fan 2 puede llegar a 0 RPM).

---

## Paso D — Aplicar las curvas en la app (GUARDAR Y APLICAR)

Una vez aplicados los pasos A-C:

1. Abre ROG Monitor → bloque **Ventiladores** → botón **CURVAS**.
2. Selecciona un perfil (p.ej. Balanced).
3. Pulsa **GUARDAR Y APLICAR** (pedirá tu contraseña por pkexec).
4. Cambia de perfil en la barra superior y verifica que las RPM responden.

> Esto reinstala `rog-profile-sync.sh` desde el repo y reinicia el servicio,
> asegurando que el hardware use las curvas nuevas del JSON.

---

## Resumen rápido (TL;DR)

| Paso | Qué hace | Root |
|------|----------|------|
| A | Actualizar curvas en rog-profile-sync.sh | No (edita archivo del usuario) |
| B | Instalar/actualizar servicio del guardián | **Sí** (sudo) |
| C | Verificar estado y logs | No |
| D | GUARDAR Y APLICAR desde la app | **Sí** (pkexec) |

Sin el paso B, el guardián sigue inactivo aunque el código esté correcto.
Sin el paso A (o D), las curvas viejas agresivas siguen en el hardware.

---

## Qué cambió en v12 vs v11

- **Histéresis corregida:** cada escalón de bajada vuelve a esperar 20 s
  de carga baja sostenida (antes el 2.º escalón tardaba solo STEP_DELAY=10s
  más, demasiado rápido). Ahora: terminas de jugar → ~20 s → baja a "normal"
  → otros ~20 s → baja a "silence" si el idle se mantiene.
- **JSON de estado enriquecido:** el guardián publica `aggression`,
  `thermal_state`, `cooldown_remaining` e `interventions`, que la UI puede
  mostrar para explicar por qué los fans están donde están.
- **Curvas por perfil más suaves:** idle más bajo en performance/balanced;
  quiet con zona de silencio real (PWM=0 hasta ~40 °C).
- **API `fans.py`:** `load_profiles()`, `save_profiles()`, `load_all_config()`,
  `save_all_config()` para que la UI edite las tres curvas desde la app.
