#!/usr/bin/env python3

import subprocess
import time
import statistics
from collections import deque

RESET = "\033[0m"

RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
CYAN = "\033[96m"
WHITE = "\033[97m"

cpu_history = deque(maxlen=60)
gpu_history = deque(maxlen=60)


def run(cmd):

    try:

        return subprocess.check_output(
            cmd,
            shell=True,
            text=True,
            stderr=subprocess.DEVNULL
        ).strip()

    except:

        return ""


def bar(percent, width=20):

    filled = int(width * percent / 100)

    return "█" * filled + "░" * (width - filled)


def temp_color(temp):

    if temp < 70:
        return GREEN

    if temp < 85:
        return YELLOW

    if temp < 92:
        return "\033[38;5;208m"

    return RED


def sparkline(values):

    chars = "▁▂▃▄▅▆▇█"

    if not values:
        return ""

    mn = min(values)
    mx = max(values)

    if mx == mn:
        return chars[0] * len(values)

    out = ""

    for v in values:

        idx = int((v - mn) / (mx - mn) * 7)

        out += chars[idx]

    return out


while True:

    sensors = run("sensors")

    cores = []

    for line in sensors.splitlines():

        if line.startswith("Core "):

            try:

                t = float(
                    line.split()[2]
                    .replace("+", "")
                    .replace("°C", "")
                )

                cores.append(t)

            except:
                pass

    if not cores:

        continue

    avg = round(statistics.mean(cores), 1)
    mx = round(max(cores), 1)
    mn = round(min(cores), 1)

    hot90 = len([x for x in cores if x >= 90])

    package = "N/A"

    for line in sensors.splitlines():

        if "Package id 0" in line:

            package = (
                line.split()[3]
                .replace("+", "")
                .replace("°C", "")
            )

    cpu_fan = gpu_fan = mid_fan = 0

    for line in sensors.splitlines():

        if "cpu_fan" in line:
            cpu_fan = int(line.split()[1])

        if "gpu_fan" in line:
            gpu_fan = int(line.split()[1])

        if "mid_fan" in line:
            mid_fan = int(line.split()[1])

    gpu_name = "Intel iGPU"

    gpu_temp = "N/A"
    gpu_util = "N/A"
    gpu_power = "N/A"

    nvidia = run(
        "nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,power.draw --format=csv,noheader,nounits"
    )

    if nvidia:

        parts = [x.strip() for x in nvidia.split(",")]

        gpu_name = parts[0]
        gpu_temp = parts[1]
        gpu_util = parts[2]
        gpu_power = parts[3]

    tuned = run(
        "tuned-adm active | cut -d':' -f2"
    )

    governor = run(
        "cat /sys/devices/system/cpu/cpufreq/policy0/scaling_governor"
    )

    cpu_history.append(avg)

    try:
        gpu_history.append(float(gpu_temp))
    except:
        pass

    print("\033[H\033[J", end="")

    print(f"{CYAN}")
    print("╔══════════════════════════════════════════════╗")
    print("║              ROG MONITOR V2                 ║")
    print("╚══════════════════════════════════════════════╝")
    print(RESET)

    print(f"{WHITE}PERFIL{RESET}")
    print(f"Tuned     : {tuned}")
    print(f"Governor  : {governor}")
    print()

    print(f"{WHITE}CPU{RESET}")

    print(f"Promedio  : {temp_color(avg)}{avg}°C{RESET}")
    print(f"Máximo    : {mx}°C")
    print(f"Mínimo    : {mn}°C")
    print(f"Package   : {package}°C")
    print(f">90°C     : {hot90} núcleos")

    print()

    print(f"{WHITE}GPU{RESET}")

    print(f"Modelo    : {gpu_name}")
    print(f"Temp      : {gpu_temp}°C")
    print(f"Uso       : {gpu_util}%")
    print(f"Potencia  : {gpu_power} W")

    print()

    print(f"{WHITE}VENTILADORES{RESET}")

    print(
        f"CPU  {bar(cpu_fan/70)} {cpu_fan} RPM"
    )

    print(
        f"GPU  {bar(gpu_fan/70)} {gpu_fan} RPM"
    )

    print(
        f"MID  {bar(mid_fan/70)} {mid_fan} RPM"
    )

    print()

    print(f"{WHITE}CPU HISTORY{RESET}")
    print(sparkline(cpu_history))

    print()

    print(f"{WHITE}GPU HISTORY{RESET}")
    print(sparkline(gpu_history))

    print()

    if avg < 70:
        state = f"{GREEN}FRÍO{RESET}"

    elif avg < 85:
        state = f"{YELLOW}NORMAL{RESET}"

    elif avg < 92:
        state = f"\033[38;5;208mCALIENTE{RESET}"

    else:
        state = f"{RED}CRÍTICO{RESET}"

    print(f"Estado térmico: {state}")

    time.sleep(1)