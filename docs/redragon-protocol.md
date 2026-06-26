# Redragon K734WCG-RGB-PRO — protocol notes (under analysis)

> Status as of 2026-06-12: **detection is ready**; the app can show the device
> in Lighting. **Control is intentionally blocked until real USB captures are
> available.**

## Why we do not send commands yet

Sinowealth/BY Tech keyboards (VID `0x258a`) have been bricked by guessed
commands. OpenRGB disabled its "Sinowealth keyboard" driver because the same
VID:PID is reused across different ICs, and a command for one model may be a
firmware flashing command for another. This keyboard's `KB.ini` contains
`CmdReset=0` and `IC2481=1`, so reset/ISP commands exist in the firmware.

**Rule: no write/SetFeature calls to the keyboard until they are verified against
a USB capture from the official software.** Reading sysfs is fine; writing is
not.

## Identification (live-verified)

| Connection | VID:PID | USB name |
| --- | --- | --- |
| Wired | `258a:010c` | BY Tech Gaming Keyboard |
| 2.4G dongle | `3554:fa09` | CompX (not tested while connected) |

- `hidraw0` (interface 0): standard boot keyboard — do not touch.
- **`hidraw1` (interface 1): configuration channel.** Decoded report descriptor:
  - Report ID `0x04`: NKRO input.
  - Report ID `0x05`: **5-byte FEATURE + ID — command channel** (vendor page
    `0xFF00`).
  - Report ID `0x06`: 7-byte input + **1794-byte FEATURE — data channel**
    (per-key colors / macros, paged).
  - Reports `0x01` / `0x02` / `0x03` / `0x07`: system, consumer, vendor events,
    and mouse.
- On Bazzite, `/dev/hidraw*` has user read/write ACLs, so no root or udev rules
  should be needed once the protocol is known.

## Official software: BYCOMBO4

Source installer: `Redragon_K734WCG-RGB-PRO_Software.exe`.

Extract with:

```bash
innoextract -e <exe> -d /tmp/redragon-exe
```

- Real app: `app/OemDrv.exe` (PE32 MFC, 2.6 MB, unpacked, readable strings).
- `app/Dev/kb/KB.ini` is the device descriptor for the app:
  - `Fw=24` selects the **CDevG5KB** protocol class inside `OemDrv`.
  - `CRC=1` means packets carry checksums.
  - `LayerNum=4`, `ChannelMask=3`, `LedMask=0x22020`.
  - `LedOpt1..20`: hardware effect table (id, UI order, speed, light, direct,
    random, color).
  - `[KEY]` section: each key has UI coordinates plus
    `0x02,<scancode>,0x00,<led_index>`; LED indices step by 6, likely two bytes
    per RGB channel in the report `0x06` buffer.
- Protocol strings in `OemDrv.exe` (G5 family):
  - `AccessData: SetFeature/GetFeature, nCmdID=%x`: command id is in
    `Buffer[2]`; GetFeature responses must echo the same command id or the app
    retries.
  - `AccessData CRC err for nCmdID=%x, retry now`: response CRC failure.
  - `CDevG5KB::AccessData_Page send this page, Buffer=%x %x %x %x %x`: large
    transfers are paged; the page command is the 5-byte feature `0x05`; data
    goes through feature `0x06` (`dataUnit=%d`).
- No public implementation was found as of June 2026. This may be first-party
  research.

## Safe Windows USB capture

1. On Windows 11, install Wireshark and enable **USBPcap** in the installer.
2. Connect the keyboard **by wire** and open BYCOMBO4.
3. In Wireshark, open `USBPcap1` and start capturing.
4. In BYCOMBO4, slowly and in this exact order, noting what you did and when:
   - change the effect three times, for example Static -> Wave -> Static;
   - set color to pure red `FF0000`, then pure blue `0000FF`;
   - change brightness: minimum -> maximum;
   - change speed: minimum -> maximum;
   - if per-key mode exists, paint one key (Esc) green `00FF00`.
5. Stop the capture and save it as `redragon-capture.pcapng` somewhere visible
   from Linux, such as a shared partition or USB drive.
6. Next session: filter `usb.idVendor == 0x258a`, inspect SET_REPORT calls
   (features `0x05` / `0x06`), confirm opcodes and CRC against the notes above,
   and only then write `src/rog_monitor/redragon.py`.

## Implementation plan after captures exist

- `src/rog_monitor/redragon.py`: talk directly to `/dev/hidraw*` with
  `fcntl.ioctl` (`HIDIOCSFEATURE` / `HIDIOCGFEATURE`), using only the standard
  library like the rest of the core.
- Always verify command-id echo and CRC before sending the next packet.
- Command allowlist: only commands observed in captures. No exploratory opcodes.
- UI: the Lighting block already shows the device through `renderPeripherals`;
  add Redragon effect/color controls and zone-aware Music Mode once writes are
  verified.
