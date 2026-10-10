#!/usr/bin/env bash
# systemd-sleep hook: firmware/EC settings can be reset after suspend/resume.
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin  # root: PATH fijo del sistema
[[ "${1:-}" == post ]] || exit 0
sleep 2
/usr/local/libexec/rog-monitor/rog-battery-limit.sh || logger -t rog-battery-limit "Could not restore battery charge limit after resume"
