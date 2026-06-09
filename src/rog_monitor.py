#!/usr/bin/env python3

import subprocess
import re
import time

from rich.live import Live
from rich.table import Table
from rich.panel import Panel
from rich.layout import Layout
from rich.console import Group


MAX_FAN_RPM = 7000


def run(cmd):
    try:
        return subprocess.check_output(
            cmd,
            shell=True,
            text=True,
            stderr=subprocess.DEVNULL
        )
    except:
        return ""


def get_cpu_data():

    sensors = run("sensors")

    cores = [
        float(x)
        for x in re.findall(r"Core .*?\+([0-9.]+)", sensors)
    ]

    package = re.search(
        r"Package id 0:\s+\+([0-9.]+)",
        sensors
    )

    package_temp = (
        float(package.group(1))
        if package else 0
    )

    if cores:
        avg = sum(cores) / len(cores)
        minimum = min(cores)
        maximum = max(cores)
        hot90 = len([x for x in cores if x >= 90])
    else:
        avg = minimum = maximum = hot90 = 0

    return {
        "avg": avg,
        "min": minimum,
        "max": maximum,
        "package": package_temp,
        "hot90": hot90
    }


def get_fans():

    sensors = run("sensors")

    def fan(name):

        match = re.search(
            rf"{name}:\s+([0-9]+)",
            sensors
        )

        rpm = int(match.group(1)) if match else 0

        percent = rpm / MAX_FAN_RPM * 100

        return rpm, percent

    return {
        "cpu": fan("cpu_fan"),
        "gpu": fan("gpu_fan"),
        "mid": fan("mid_fan")
    }


def get_gpu():

    data = run(
        "nvidia-smi "
        "--query-gpu=temperature.gpu,"
        "utilization.gpu,power.draw "
        "--format=csv,noheader,nounits"
    )

    try:

        temp, util, power = [
            x.strip()
            for x in data.split(",")
        ]

        return {
            "temp": temp,
            "util": util,
            "power": power
        }

    except:

        return {
            "temp": "?",
            "util": "?",
            "power": "?"
        }


def get_profile():

    profile = run(
        "tuned-adm active"
    )

    governor = run(
        "cat /sys/devices/system/cpu/"
        "cpufreq/policy0/scaling_governor"
    )

    profile = profile.split(":")[-1].strip()

    return profile, governor.strip()


def build_ui():

    cpu = get_cpu_data()
    gpu = get_gpu()
    fans = get_fans()

    profile, governor = get_profile()

    cpu_table = Table()

    cpu_table.add_column("CPU")
    cpu_table.add_column("Valor")

    cpu_table.add_row(
        "Promedio",
        f"{cpu['avg']:.1f}°C"
    )

    cpu_table.add_row(
        "Máximo",
        f"{cpu['max']:.1f}°C"
    )

    cpu_table.add_row(
        "Mínimo",
        f"{cpu['min']:.1f}°C"
    )

    cpu_table.add_row(
        "Package",
        f"{cpu['package']:.1f}°C"
    )

    cpu_table.add_row(
        ">90°C",
        str(cpu["hot90"])
    )

    gpu_table = Table()

    gpu_table.add_column("GPU")
    gpu_table.add_column("Valor")

    gpu_table.add_row(
        "Temp",
        f"{gpu['temp']}°C"
    )

    gpu_table.add_row(
        "Uso",
        f"{gpu['util']}%"
    )

    gpu_table.add_row(
        "Potencia",
        f"{gpu['power']} W"
    )

    fan_table = Table()

    fan_table.add_column("Fan")
    fan_table.add_column("RPM")
    fan_table.add_column("%")

    fan_table.add_row(
        "CPU",
        str(fans["cpu"][0]),
        f"{fans['cpu'][1]:.0f}%"
    )

    fan_table.add_row(
        "GPU",
        str(fans["gpu"][0]),
        f"{fans['gpu'][1]:.0f}%"
    )

    fan_table.add_row(
        "MID",
        str(fans["mid"][0]),
        f"{fans['mid'][1]:.0f}%"
    )

    profile_panel = Panel(
        f"""
Perfil: {profile}

Governor: {governor}
""",
        title="Energía"
    )

    return Group(
        profile_panel,
        Panel(cpu_table, title="CPU"),
        Panel(gpu_table, title="GPU"),
        Panel(fan_table, title="Ventiladores")
    )


def main():

    with Live(
        build_ui(),
        refresh_per_second=2
    ) as live:

        while True:

            live.update(
                build_ui()
            )

            time.sleep(1)


if __name__ == "__main__":
    main()
