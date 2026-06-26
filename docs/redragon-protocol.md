# Redragon K734WCG-RGB-PRO — protocolo (en análisis)

> Estado 2026-06-12: **detección lista** (la app lo muestra en Iluminación).
> **Control: BLOQUEADO a propósito hasta tener capturas USB reales.**

## ⚠️ Por qué NO mandamos comandos todavía

Los teclados Sinowealth/BY Tech (VID 0x258a) **se han brickeado** con
comandos adivinados: OpenRGB deshabilitó su controlador "Sinowealth keyboard"
porque el mismo VID:PID se reutiliza entre ICs distintos y un comando de un
modelo puede ser el comando de *flasheo* de otro. El KB.ini de este teclado
trae `CmdReset=0` e `IC2481=1` — hay comandos de reset/ISP en el firmware.

**Regla: ningún write/SetFeature al teclado sin verificarlo contra una
captura USB del software oficial.** Leer sysfs está bien; escribir no.

## Identificación (verificada en vivo en esta máquina)

| Conexión | VID:PID | Nombre USB |
|---|---|---|
| Cable | `258a:010c` | BY Tech Gaming Keyboard |
| Dongle 2.4G | `3554:fa09` | CompX (no probado conectado) |

- hidraw0 (interfaz 0): teclado boot estándar — no tocar.
- **hidraw1 (interfaz 1): canal de configuración.** Report descriptor decodificado:
  - Report ID `0x04`: NKRO input.
  - Report ID `0x05`: **FEATURE de 5 bytes + ID — canal de comandos** (página vendor 0xFF00).
  - Report ID `0x06`: input de 7 bytes + **FEATURE de 1794 bytes — canal de datos**
    (colores por tecla / macros, paginado).
  - Reports 0x01/0x02/0x03/0x07: system/consumer/eventos vendor/mouse.
- En Bazzite los `/dev/hidraw*` son rw para el usuario (ACL): **no se necesita
  root ni reglas udev** para hablarle cuando tengamos el protocolo.

## Software oficial: BYCOMBO4 (extraído del instalador oficial `Redragon_K734WCG-RGB-PRO_Software.exe`)

Extraer con: `innoextract -e <exe> -d /tmp/redragon-exe` (innoextract está en brew).

- App real: `app/OemDrv.exe` (PE32 MFC, 2.6 MB, sin empaquetar — strings legibles).
- `app/Dev/kb/KB.ini` es el descriptor del dispositivo para la app:
  - `Fw=24` → selecciona la clase de protocolo **CDevG5KB** dentro de OemDrv.
  - `CRC=1` → los paquetes llevan checksum.
  - `LayerNum=4`, `ChannelMask=3`, `LedMask=0x22020`.
  - `LedOpt1..20`: tabla de efectos HW (id, orden-UI, speed, light, direct, random, color).
  - Sección `[KEY]`: cada tecla trae coordenadas de UI + `0x02,<scancode>,0x00,<led_index>`
    (índice LED con paso 6 → probablemente 2 bytes/canal RGB en el buffer del report 0x06).
- Strings de protocolo en OemDrv.exe (familia G5):
  - `AccessData: SetFeature/GetFeature, nCmdID=%x` — el cmd va en `Buffer[2]` y
    el GetFeature de respuesta debe **ecoar el mismo cmd id**; si no, reintenta.
  - `AccessData CRC err for nCmdID=%x, retry now` — respuesta con CRC.
  - `CDevG5KB::AccessData_Page send this page, Buffer=%x %x %x %x %x` — las
    transferencias grandes van paginadas; el comando de página son los 5 bytes
    del feature 0x05; los datos van por el feature 0x06 (`dataUnit=%d`).
- Nadie ha publicado este protocolo (buscado jun 2026): seremos los primeros.

## 📋 Captura USB en Windows (10 min, la ruta segura)

1. En Windows 11: instala Wireshark marcando **USBPcap** en el instalador.
2. Conecta el teclado **por cable**. Abre la app BYCOMBO4.
3. Abre Wireshark → interfaz USBPcap1 → empieza a capturar.
4. En BYCOMBO4, despacio y EN ORDEN (anota qué hiciste y a qué hora):
   - cambia el efecto 3 veces (p. ej. Static → Wave → Static),
   - cambia el color a rojo puro `FF0000`, luego azul puro `0000FF`,
   - cambia el brillo: mínimo → máximo,
   - cambia la velocidad: mínima → máxima,
   - si hay modo por-tecla: pinta UNA tecla (Esc) de verde `00FF00`.
5. Para la captura y guárdala como `redragon-capture.pcapng` en una carpeta
   que veas desde Bazzite (p. ej. la partición compartida o un USB).
6. La próxima sesión: filtrar `usb.idVendor == 0x258a`, mirar los
   SET_REPORT (feature 0x05/0x06), confirmar opcodes y CRC contra lo de
   arriba, y recién ahí escribir `src/rog_monitor/redragon.py`.

## Plan de implementación (cuando haya capturas)

- `src/rog_monitor/redragon.py`: hablar `/dev/hidraw*` directo con
  `fcntl.ioctl` (HIDIOCSFEATURE/HIDIOCGFEATURE) — stdlib puro, sin deps,
  como el resto del core.
- Verificar SIEMPRE el eco del cmd id + CRC antes de mandar el siguiente paquete.
- Lista blanca de comandos: solo los vistos en capturas. Nada de explorar
  opcodes "a ver qué hacen".
- UI: cuando funcione, el bloque Iluminación ya muestra el dispositivo
  (renderPeripherals); agregar selector de efecto/color para el Redragon y
  el modo música por zonas.
