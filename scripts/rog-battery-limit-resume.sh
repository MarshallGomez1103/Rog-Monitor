#!/usr/bin/env bash
# systemd-sleep hook: firmware/EC settings can be reset after suspend/resume.
set -euo pipefail
[[ "${1:-}" == post ]] || exit 0
sleep 2
/usr/local/sbin/rog-battery-limit || logger -t rog-battery-limit "Could not restore battery charge limit after resume"
