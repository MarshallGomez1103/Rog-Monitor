# Pasos con contraseña (sudo/pkexec) pendientes — v10

> Marshall: estos pasos necesitan tu clave de administrador. Córrelos cuando
> vuelvas. Cada agente que necesite root **añade aquí** su comando exacto (no lo
> ejecuta). El orquestador consolida y verifica antes de entregarte la lista.

## Cómo correr

Abre una terminal y pega los comandos en orden. Si algo pide confirmación, léelo
antes de aceptar. Todo es reversible (hay respaldos / RESET A FÁBRICA en la app).

---

## (los agentes añaden sus pasos debajo)

---

## A6 — Offsets de reloj GPU (NVML) + Guardián térmico

Contexto: los offsets de core/memoria de la GPU (pestaña GPU del Centro de
Poder) y el guardián térmico ya están cableados en la app. El **SET** de
offsets ocurre en runtime vía `pkexec` cada vez que pulsas APLICAR — no hay
nada que instalar para eso, solo te pedirá tu clave en ese momento. El
**guardián térmico** sí necesita un paso de instalación único (un servicio
systemd) antes de poder activarse desde la UI.

### 1) Instalar el servicio del guardián térmico (una sola vez)

Corre esto desde la raíz del repo (donde está esta carpeta `docs/`):

```bash
REPO="$(pwd)"
sudo install -m 0644 "$REPO/systemd/rog-thermal-guardian.service" /etc/systemd/system/rog-thermal-guardian.service
sudo sed -i "s#__ROG_MONITOR_REPO__#$REPO#" /etc/systemd/system/rog-thermal-guardian.service
sudo systemctl daemon-reload
```

Esto NO arranca el guardián todavía (queda instalado pero apagado). Desde la
app, pestaña GPU → "GUARDIÁN TÉRMICO GPU" → ACTIVAR GUARDIÁN, lo enciende y
habilita en el arranque (`systemctl start` + `enable`, ya cableado en
`main.js`). Cambiar el techo de temperatura desde la UI también pide tu
clave (escribe un `override.conf` con `pkexec` y hace `daemon-reload`).

Si prefieres hacerlo todo a mano sin la UI:

```bash
sudo systemctl enable --now rog-thermal-guardian.service
sudo systemctl status rog-thermal-guardian.service
```

Para desinstalarlo por completo más adelante:

```bash
sudo systemctl disable --now rog-thermal-guardian.service
sudo rm -f /etc/systemd/system/rog-thermal-guardian.service
sudo rm -rf /etc/systemd/system/rog-thermal-guardian.service.d
sudo systemctl daemon-reload
```

### 2) SET de offsets GPU — no requiere instalación, solo tu clave al usar

Cada vez que cambies "Offset clock núcleo GPU" o "Offset clock memoria GPU"
en la pestaña GPU y pulses APLICAR, la app corre internamente algo
equivalente a:

```bash
pkexec bash scripts/apply-gpu-clocks.sh set --core <MHz> --mem <MHz>
```

Te pedirá tu contraseña de administrador en ese momento (vía el diálogo de
pkexec del sistema, no en una terminal). No hay nada que instalar de
antemano para esto — funciona ya mismo en Wayland gracias a NVML
(verificado: driver 610.43.02, RTX 4060, lectura sin privilegios; el SET
exige root, por eso pkexec). Los offsets NO persisten tras apagar: vuelven a
0 MHz (fábrica) en cada arranque salvo que la app los reaplique.

### 3) Respaldo legacy: Coolbits (X11 únicamente, NO necesario en tu setup)

Coolbits es el mecanismo histórico de NVIDIA para overclock vía `nvidia-settings`,
pero solo aplica bajo X11 (xorg) — tu sesión es Wayland, así que la app usa
NVML directamente (sección 2 arriba) y este paso **no aplica y no debes
correrlo**. Se documenta aquí únicamente como referencia/respaldo en caso de
que algún día vuelvas a X11 o NVML deje de funcionar en tu driver:

```bash
# SOLO si algún día estás en X11 y NVML falla — NO correr en Wayland.
sudo nvidia-xconfig --cool-bits=28
# Requiere reiniciar la sesión grafica (o el equipo) para que tome efecto.
# El archivo resultante queda en /etc/X11/xorg.conf.d/ (p.ej. 90-nvidia.conf
# o similar, según tu distro) con una línea "Option \"Coolbits\" \"28\""
# dentro de la sección Screen.
```

No se requiere ninguna acción tuya en este punto 3 mientras sigas en
Wayland, que es tu configuración actual en Bazzite.
