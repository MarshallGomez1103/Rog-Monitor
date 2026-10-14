"""N-B-14: simulación del bucle de benchmarks (benchmarks.py) sin estrés real.

Reloj falso (sleep avanza el tiempo simulado, nunca duerme), lectores falsos,
Popen sustituido por un registrador y /sys falso. Nada lanza procesos ni carga
CPU/GPU; los tests que ya cubre tests/test_benchmarks.py (percentiles, describe,
build_stats, throughput básico) no se repiten.
"""

import contextlib
import io
import json
import signal
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import benchmarks as bm


class Clock:
    def __init__(self, start=1000.0):
        self.now = start
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class Sim:
    """Entorno falso para _run_repetitions / run_*_benchmark."""

    def __init__(self, test, cpu_temp=lambda now: 40.0, gpu=None, watts=40.0, fans=3000,
                 caps=None):
        self.clock = Clock()
        self.t0 = self.clock.now
        sim = self

        class Cpu:
            def read(self):
                return {"avg": cpu_temp(sim.clock.now), "package": cpu_temp(sim.clock.now) + 1,
                        "freq_ghz": 3.0, "usage": 100, "model": "FakeCPU", "epp": "performance",
                        "governor": "performance", "throttle_count": 0, "throttle_ms": 0}

        class Gpu:
            def __init__(self, *_):
                pass

            def read(self):
                active = {"name": "FakeGPU", "temp": 50.0, "power": 5.0, "util": 1, "clock_mhz": 300}
                return {"active": active} if gpu is None else gpu

        class Fans:
            def __init__(self, *_):
                pass

            def read(self, profile=None):
                return [{"label": "cpu_fan", "rpm": fans}]

        class Rapl:
            def read_watts(self):
                return watts() if callable(watts) else watts

        bat = mock.Mock()
        bat.return_value.read.return_value = {"on_ac": False}
        patches = [
            mock.patch.object(bm, "scan", lambda: {}),
            mock.patch.object(bm, "Config", lambda: None),
            mock.patch.object(bm, "CpuReader", lambda *_: Cpu()),
            mock.patch.object(bm, "GpuReader", Gpu),
            mock.patch.object(bm, "FanReader", Fans),
            mock.patch.object(bm, "RaplReader", Rapl),
            mock.patch.object(bm, "BatteryReader", bat),
            mock.patch.object(bm, "guardian_status", lambda: {"mode": "off", "thermal_state": "ok"}),
            mock.patch.object(bm, "asus_profile", lambda: "performance"),
            mock.patch.object(bm, "ppd_profile", lambda: "performance"),
            mock.patch.object(bm, "load_caps", lambda p=None: caps or {}),
            mock.patch.object(bm, "_nvidia_driver", lambda: "550.0"),  # no leer /sys
            mock.patch.object(bm.time, "sleep", self.clock.sleep),
            mock.patch.object(bm.time, "monotonic", self.clock.monotonic),
        ]
        for p in patches:
            p.start()
            test.addCleanup(p.stop)


class ScriptLoad:
    """Carga falsa: work +1000 por lectura; `abort_when()` simula muerte/aborto."""

    def __init__(self, abort_when=None, work_error=None):
        self.n = 0
        self.starts = 0
        self.stops = 0
        self.abort_when = abort_when
        self.work_error = work_error

    def start(self):
        self.starts += 1
        self.n = 0

    def alive(self):
        return not (self.abort_when and self.abort_when())

    def work(self):
        if self.work_error:
            raise self.work_error
        self.n += 1000
        return self.n

    def stop(self):
        self.stops += 1


def _run(load, seconds=3, warmup=1, reps=1, cooldown=0, baseline=55.0, margin=10.0, params=None):
    return bm._run_repetitions(load, seconds, warmup, reps, cooldown, baseline, margin,
                               params or {"threads": 2})


# ------------------------------------------------------------------ _summarize

class Summarize(unittest.TestCase):
    def setUp(self):
        p = mock.patch.object(bm, "load_caps", lambda profile=None: {"cpu_fan": 6000, "gpu_fan": 5000})
        p.start()
        self.addCleanup(p.stop)

    def test_empty_samples_give_none_everywhere(self):
        out = bm._summarize([])
        self.assertIsNone(out["cpu_temp_max"])
        self.assertIsNone(out["gpu_watts_max"])
        self.assertIsNone(out["fan_cap"])
        self.assertIsNone(out["cap_respected"])
        self.assertEqual(out["fan_rpm_max"], {})
        self.assertEqual((out["throttle_events"], out["throttle_ms"]), (0, 0))

    def test_maxima_skip_missing_values(self):
        samples = [
            {"cpu_temp": 70.0, "gpu_temp": None, "cpu_watts": 80.0, "fans": {}},
            {"cpu_temp": 91.5, "gpu_temp": 66.0, "cpu_watts": None, "gpu_util": 0, "fans": {}},
            {"cpu_package": 95.0, "gpu_watts": 12.5, "fans": {}},
        ]
        out = bm._summarize(samples)
        self.assertEqual((out["cpu_temp_max"], out["cpu_package_max"]), (91.5, 95.0))
        self.assertEqual((out["gpu_temp_max"], out["gpu_watts_max"], out["gpu_util_max"]), (66.0, 12.5, 0))
        self.assertEqual(out["cpu_watts_max"], 80.0)

    def test_throttle_is_delta_between_first_and_last_sample(self):
        samples = [
            {"cpu_throttle_count": 4, "cpu_throttle_ms": 100, "fans": {}},
            {"cpu_throttle_count": 9, "cpu_throttle_ms": 460, "fans": {}},
            {"cpu_throttle_count": None, "cpu_throttle_ms": None, "fans": {}},
        ]
        out = bm._summarize(samples)
        # la última muestra sin contador cuenta como 0: el delta es negativo y queda visible
        self.assertEqual((out["throttle_events"], out["throttle_ms"]), (-4, -100))
        out = bm._summarize(samples[:2])
        self.assertEqual((out["throttle_events"], out["throttle_ms"]), (5, 360))

    def test_fan_cap_has_75_rpm_tolerance_and_ignores_unknown_labels(self):
        ok = bm._summarize([{"fans": {"cpu_fan": 6075}}, {"fans": {"cpu_fan": 5000, "other": 9999}}])
        self.assertTrue(ok["cap_respected"])
        self.assertEqual(ok["fan_cap"], {"cpu_fan": {"cap": 6000, "max": 6075, "ok": True}})
        self.assertEqual(ok["fan_rpm_max"], {"cpu_fan": 6075, "other": 9999})
        bad = bm._summarize([{"fans": {"cpu_fan": 6076, "gpu_fan": 100}}])
        self.assertFalse(bad["cap_respected"])
        self.assertFalse(bad["fan_cap"]["cpu_fan"]["ok"])
        self.assertTrue(bad["fan_cap"]["gpu_fan"]["ok"])

    def test_profile_is_forwarded_to_load_caps(self):
        seen = []
        with mock.patch.object(bm, "load_caps", lambda profile=None: seen.append(profile) or {}):
            bm._summarize([{"fans": {}}], "quiet")
        self.assertEqual(seen, ["quiet"])



class CollectSample(unittest.TestCase):
    def _readers(self, cpu_state, gpu_state, fans=()):
        cpu = mock.Mock()
        cpu.read.return_value = cpu_state
        gpu = mock.Mock()
        gpu.read.return_value = gpu_state
        fan = mock.Mock()
        fan.read.return_value = list(fans)
        rapl = mock.Mock()
        rapl.read_watts.return_value = 33.5
        return cpu, gpu, fan, rapl

    def test_fields_and_relative_time(self):
        clock = Clock(500.0)
        cpu, gpu, fan, rapl = self._readers(
            {"avg": 70.0, "package": 72.0, "freq_ghz": 3.2, "usage": 99, "throttle_count": 3, "throttle_ms": 40},
            {"active": {"temp": 60, "power": 90.0, "util": 97, "clock_mhz": 2100}},
            [{"label": "cpu_fan", "rpm": 4100}, {"label": "gpu_fan", "rpm": 3900}])
        with mock.patch.object(bm.time, "monotonic", clock.monotonic):
            s = bm._collect_sample(cpu, gpu, fan, rapl, 498.25, "quiet")
        fan.read.assert_called_once_with("quiet")
        self.assertEqual(s, {
            "t": 1.75, "cpu_temp": 70.0, "cpu_package": 72.0, "cpu_watts": 33.5, "cpu_freq_ghz": 3.2,
            "cpu_util": 99, "cpu_throttle_count": 3, "cpu_throttle_ms": 40,
            "gpu_temp": 60, "gpu_watts": 90.0, "gpu_util": 97, "gpu_clock_mhz": 2100,
            "fans": {"cpu_fan": 4100, "gpu_fan": 3900},
        })

    def test_missing_gpu_and_cpu_fields_become_none(self):
        clock = Clock(10.0)
        cpu, gpu, fan, rapl = self._readers({}, {"active": None})
        with mock.patch.object(bm.time, "monotonic", clock.monotonic):
            s = bm._collect_sample(cpu, gpu, fan, rapl, 10.0)
        self.assertEqual(s["t"], 0.0)
        for key in ("cpu_temp", "cpu_package", "cpu_util", "gpu_temp", "gpu_watts", "gpu_util", "gpu_clock_mhz"):
            self.assertIsNone(s[key], key)
        self.assertEqual(s["fans"], {})


# --------------------------------------------------------- _run_repetitions

class RunRepetitionsSim(unittest.TestCase):
    def test_sample_cadence_and_exact_throughput_with_fake_clock(self):
        sim = Sim(self)
        load = ScriptLoad()
        run = _run(load, seconds=3, warmup=1, reps=2, cooldown=4)
        # prime RAPL (0.5 s) + una espera de cooldown entre repeticiones + 1 s por muestra
        self.assertEqual(sim.clock.sleeps[0], 0.5)
        self.assertEqual(sim.clock.sleeps.count(4), 1)
        self.assertEqual((load.starts, load.stops), (2, 2))
        # por repetición: 1 muestra de warm-up + 3 medidas + 1 final (cuenta como medida)
        per_rep = [[s for s in run["samples"] if s["rep"] == r] for r in (1, 2)]
        for rep in per_rep:
            self.assertEqual([s["warmup"] for s in rep], [True, False, False, False, False])
            self.assertEqual([s["work"] for s in rep], [1000, 2000, 3000, 4000, 5000])
        self.assertEqual([len(m) for m in run["measured_reps"]], [4, 4])
        # 3000 iteraciones en 3 s de reloj simulado
        self.assertEqual([r["score_ips"] for r in run["runs"]], [1000.0, 1000.0])
        # el segundo run arranca tras 1+3+... s + cooldown: tiempos monótonos
        ts = [s["t"] for s in run["samples"]]
        self.assertEqual(ts, sorted(ts))
        self.assertGreater(per_rep[1][0]["t"] - per_rep[0][-1]["t"], 4 - 1e-9)

    def test_zero_warmup_has_no_warm_samples(self):
        Sim(self)
        run = _run(ScriptLoad(), seconds=2, warmup=0)
        self.assertFalse(any(s["warmup"] for s in run["samples"]))
        self.assertEqual(len(run["measured"]), 3)  # 2 en el bucle + la final

    def test_zero_seconds_still_takes_final_sample(self):
        Sim(self)
        run = _run(ScriptLoad(), seconds=0, warmup=0)
        self.assertEqual(len(run["samples"]), 1)
        self.assertIsNone(run["runs"][0]["score_ips"])  # una sola muestra: sin Δt

    def test_no_repetitions_yields_empty_run(self):
        Sim(self)
        load = ScriptLoad()
        run = _run(load, reps=0)
        self.assertEqual((run["samples"], run["measured"], run["runs"], load.starts), ([], [], [], 0))

    def test_hot_start_boundary_is_strict(self):
        Sim(self, cpu_temp=lambda now: 65.0)  # límite 55 + 10 = 65: no es "mayor"
        run = _run(ScriptLoad())
        self.assertEqual(run["warnings"], [])
        Sim(self, cpu_temp=lambda now: 65.1)
        run = _run(ScriptLoad())
        self.assertEqual(run["warnings"], [{"code": "start_hot", "rep": 1, "cpu_temp": 65.1, "limit": 65.0}])

    def test_hot_start_unknown_temperature_never_warns(self):
        Sim(self)
        with mock.patch.object(bm, "CpuReader", lambda *_: mock.Mock(read=lambda: {"avg": None})):
            run = _run(ScriptLoad())
        self.assertEqual(run["warnings"], [])
        self.assertFalse(run["runs"][0]["hot_start"])
        self.assertIsNone(run["samples"][0]["cpu_temp"])

    def test_conditions_battery_and_missing_battery(self):
        Sim(self)
        self.assertEqual(_run(ScriptLoad())["conditions"]["power_source"], "battery")
        Sim(self)
        bm.BatteryReader.return_value.read.return_value = None
        c = _run(ScriptLoad())["conditions"]
        self.assertIsNone(c["power_source"])
        self.assertEqual(c["gpu_driver"], "550.0")
        self.assertEqual(c["schema"], bm.SCHEMA_VERSION)
        self.assertEqual(c["ambient_start"], {"cpu_temp": 40.0, "gpu_temp": 50.0})
        self.assertEqual(c["guardian"], {"mode": "off", "thermal_state": "ok"})

    def test_conditions_without_active_gpu(self):
        Sim(self, gpu={"active": None})
        c = _run(ScriptLoad())["conditions"]
        self.assertIsNone(c["gpu_name"])
        self.assertEqual(c["ambient_start"]["gpu_temp"], None)


class ThermalAbortAndCancel(unittest.TestCase):
    def test_thermal_abort_stops_early_and_keeps_peak(self):
        # la CPU sube 5 °C/s desde 60; a 95 °C la carga "aborta" (alive() False)
        sim = Sim(self, cpu_temp=lambda now: 60.0 + 5.0 * (now - 1000.0))
        load = ScriptLoad()
        load.abort_when = lambda: 60.0 + 5.0 * (sim.clock.now - 1000.0) >= 95.0
        run = _run(load, seconds=30, warmup=2)
        self.assertEqual(load.stops, 1)
        measured = run["measured"]
        self.assertLess(len(measured), 30)  # no llegó a los 30 s pedidos
        # el aborto se decide al empezar la iteración: la última muestra ya está en/pasado el umbral
        self.assertGreaterEqual(run["samples"][-1]["cpu_temp"], 95.0)
        self.assertLess(max(s["cpu_temp"] for s in run["samples"][:-1]), 100.0)
        summary = bm._summarize(measured)
        self.assertGreaterEqual(summary["cpu_temp_max"], 95.0)
        # sigue habiendo una repetición registrada con su score
        self.assertEqual(len(run["runs"]), 1)

    def test_load_dead_from_the_start_still_records_one_final_sample(self):
        Sim(self)
        load = ScriptLoad(abort_when=lambda: True)
        run = _run(load, seconds=10, warmup=5)
        self.assertEqual(len(run["samples"]), 1)
        self.assertFalse(run["samples"][0]["warmup"])
        self.assertEqual((load.starts, load.stops), (1, 1))

    def test_cancellation_stops_the_load_and_propagates(self):
        Sim(self)
        load = ScriptLoad(work_error=KeyboardInterrupt())
        with self.assertRaises(KeyboardInterrupt):
            _run(load, reps=3)
        self.assertEqual((load.starts, load.stops), (1, 1))  # la carga se detiene; no hay 2.ª repetición

    def test_reader_failure_midrun_still_stops_the_load(self):
        Sim(self)
        load = ScriptLoad(work_error=OSError("sensor desapareció"))
        with self.assertRaises(OSError):
            _run(load)
        self.assertEqual(load.stops, 1)


# ------------------------------------------------------------------ _finish

class Finish(unittest.TestCase):
    def setUp(self):
        p = mock.patch.object(bm, "load_caps", lambda profile=None: {})
        p.start()
        self.addCleanup(p.stop)

    def _run_dict(self, scores, threads=None):
        reps = []
        runs = []
        for i, score in enumerate(scores, 1):
            reps.append([{"t": float(j), "rep": i, "warmup": False, "cpu_temp": 70.0 + i + j}
                         for j in range(3)])
            runs.append({"rep": i, "score_ips": score})
        conditions = {} if threads is None else {"threads": threads}
        return {"samples": [s for r in reps for s in r], "measured": [s for r in reps for s in r],
                "measured_reps": reps, "runs": runs, "warnings": [{"code": "start_hot"}],
                "conditions": conditions, "started_at": "2026-10-14T00:00:00+00:00", "profile": None}

    def test_result_shape_and_throughput(self):
        res = bm._finish("cpu", "tool", 30, 5, 2, self._run_dict([1000.0, 1100.0], threads=4), {"x": 1})
        self.assertTrue(res["ok"])
        self.assertEqual((res["schema"], res["kind"], res["seconds"], res["warmup_seconds"],
                          res["repetitions"], res["tool"], res["x"]), (2, "cpu", 30, 5, 2, "tool", 1))
        self.assertEqual(res["throughput"], {
            "unit": "iter/s", "score_ips": 1050.0, "per_thread_ips": 262.5,
            "per_rep": [1000.0, 1100.0], "cv_pct": 6.734,
        })
        self.assertNotIn("per_rep", res["stats"])
        self.assertEqual(res["stats"]["percentile_method"], "linear-inclusive")
        self.assertIn("stats", res["runs"][0])
        self.assertEqual(res["runs"][0]["stats"]["cpu_temp"]["n"], 3)
        self.assertEqual(res["warnings"], [{"code": "start_hot"}])
        self.assertEqual(res["summary"]["cpu_temp_max"], 74.0)
        json.dumps(res, allow_nan=False)

    def test_no_scores_means_no_throughput(self):
        res = bm._finish("gpu", "g", 10, 0, 1, self._run_dict([None]), {})
        self.assertNotIn("throughput", res)

    def test_missing_threads_default_to_one_and_none_scores_are_skipped(self):
        res = bm._finish("cpu", "t", 10, 0, 2, self._run_dict([None, 800.0]), {})
        self.assertEqual(res["throughput"]["per_thread_ips"], 800.0)
        self.assertEqual(res["throughput"]["per_rep"], [800.0])
        self.assertIsNone(res["throughput"]["cv_pct"])


# --------------------------------------------------------------- run_*_benchmark

class RunCpuBenchmark(unittest.TestCase):
    def test_full_cpu_run_with_fake_load(self):
        Sim(self)
        made = []

        def fake_load(workers):
            load = ScriptLoad()
            load.workers = workers
            made.append(load)
            return load

        with mock.patch.object(bm, "_CpuLoad", fake_load):
            res = bm.run_cpu_benchmark(seconds=3, workers=3, warmup=1, reps=2, cooldown=0)
        self.assertEqual([m.workers for m in made], [3])
        self.assertEqual(res["tool"], "CPU al 100% · 3 hilos en paralelo")
        self.assertEqual((res["kind"], res["repetitions"], res["seconds"]), ("cpu", 2, 3))
        self.assertEqual(res["conditions"]["threads"], 3)
        self.assertEqual(res["throughput"]["score_ips"], 1000.0)
        self.assertEqual(res["throughput"]["per_thread_ips"], 333.3)
        self.assertEqual(res["stats"]["cv_across_reps_pct"]["cpu_temp"], 0.0)  # mismas temperaturas en ambas reps
        json.dumps(res, allow_nan=False)

    def test_workers_default_to_cpu_count(self):
        Sim(self)
        seen = []
        with mock.patch.object(bm, "_CpuLoad", lambda w: seen.append(w) or ScriptLoad()), \
                mock.patch.object(bm.os, "cpu_count", lambda: 12):
            bm.run_cpu_benchmark(seconds=1, warmup=0, reps=1, cooldown=0)
            self.assertEqual(seen, [12])
        with mock.patch.object(bm, "_CpuLoad", lambda w: seen.append(w) or ScriptLoad()), \
                mock.patch.object(bm.os, "cpu_count", lambda: None):
            bm.run_cpu_benchmark(seconds=1, warmup=0, reps=1, cooldown=0)
        self.assertEqual(seen, [12, 1])


class GpuLoadPlan(unittest.TestCase):
    def _plan(self, available):
        with mock.patch.object(bm.shutil, "which", lambda n: f"/fake/{n}" if n in available else None):
            return bm._gpu_load_plan()

    def test_preference_order(self):
        self.assertEqual(self._plan({"glmark2", "vkmark", "vkcube", "glxgears"}),
                         ([["/fake/glmark2", "--off-screen"]], "glmark2 --off-screen"))
        self.assertEqual(self._plan({"vkmark", "vkcube", "glxgears"}), ([["/fake/vkmark"]], "vkmark"))
        cmds, label = self._plan({"vkcube", "glxgears"})
        self.assertEqual(len(cmds), bm.GPU_LOAD_INSTANCES)
        self.assertEqual(cmds[0], ["/fake/vkcube", "--present_mode", "0", "--width", "1920", "--height", "1080"])
        self.assertIsNot(cmds[0], cmds[1])  # listas independientes
        self.assertEqual(label, "vkcube ×4 (immediate 1080p)")
        cmds, label = self._plan({"glxgears"})
        self.assertEqual(cmds, [["/fake/glxgears", "-fullscreen"]] * 4)
        self.assertEqual(label, "glxgears ×4")

    def test_none_when_nothing_installed(self):
        self.assertIsNone(self._plan(set()))


class RunGpuBenchmark(unittest.TestCase):
    def test_no_tool_returns_error_without_running_anything(self):
        with mock.patch.object(bm, "_gpu_load_plan", lambda: None), \
                mock.patch.object(bm, "_run_repetitions", side_effect=AssertionError("no debe correr")):
            res = bm.run_gpu_benchmark()
        self.assertFalse(res["ok"])
        self.assertEqual(res["kind"], "gpu")
        self.assertIn("glmark2", res["err"])

    def _go(self, gpu=None, **kw):
        Sim(self, gpu=gpu)
        loads = []

        def fake_gpu_load(cmds):
            load = ScriptLoad()
            load.work = lambda: None  # sin métrica de trabajo, como _GpuLoad real
            load.commands = cmds
            loads.append(load)
            return load

        with mock.patch.object(bm, "_gpu_load_plan", lambda: ([["/fake/vkcube"]] * 2, "vkcube ×2")), \
                mock.patch.object(bm, "_GpuLoad", fake_gpu_load):
            return bm.run_gpu_benchmark(seconds=2, warmup=0, cooldown=0, **kw), loads

    def test_success_has_no_throughput_and_reports_instances(self):
        res, loads = self._go()
        self.assertTrue(res["ok"])
        self.assertEqual((res["kind"], res["tool"], res["instances"]), ("gpu", "vkcube ×2", 2))
        self.assertEqual(res["conditions"]["threads"], 2)
        self.assertEqual(res["summary"]["gpu_temp_max"], 50.0)
        self.assertNotIn("throughput", res)
        self.assertNotIn("work", res["samples"][0])
        self.assertEqual(loads[0].commands, [["/fake/vkcube"]] * 2)

    def test_dgpu_without_telemetry_is_reported_with_tool_name(self):
        res, _ = self._go(gpu={"active": {"name": "X"}})
        self.assertFalse(res["ok"])
        self.assertIn("vkcube ×2", res["err"])
        self.assertIn("Hybrid/dGPU", res["err"])

    def test_zero_repetitions_report_no_samples(self):
        res, _ = self._go(reps=0)
        self.assertEqual(res, {"ok": False, "kind": "gpu", "err": "No pude capturar muestras del benchmark GPU."})

    def test_partial_telemetry_is_enough(self):
        res, _ = self._go(gpu={"active": {"util": 0}})
        self.assertTrue(res["ok"])  # util=0 sigue siendo telemetría (no None)


# ------------------------------------------------- cargas con Popen registrado

class FakeProc:
    def __init__(self, cmd, **kw):
        self.cmd, self.kw = cmd, kw
        self.alive = True
        self.signals = []
        self.waits = []
        self.hang = False  # wait() agota el tiempo hasta recibir kill
        self.killed = False

    def poll(self):
        return None if self.alive else 0

    def send_signal(self, sig):
        self.signals.append(sig)

    def terminate(self):
        self.signals.append(signal.SIGTERM)

    def kill(self):
        self.killed = True
        self.alive = False

    def wait(self, timeout=None):
        self.waits.append(timeout)
        if self.hang and not self.killed:
            raise subprocess.TimeoutExpired(self.cmd, timeout)
        self.alive = False
        return 0


class CpuLoadClass(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="bench-sim-"))
        self.procs = []

        def popen(cmd, **kw):
            proc = FakeProc(cmd, **kw)
            self.procs.append(proc)
            return proc

        for p in (mock.patch.object(bm.subprocess, "Popen", popen),
                  mock.patch.object(bm.tempfile, "mkdtemp", lambda prefix="": str(self.tmp / "load"))):
            p.start()
            self.addCleanup(p.stop)
        (self.tmp / "load").mkdir()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))

    def test_burn_script_is_valid_python_and_never_executed_here(self):
        code = compile(bm.CPU_BURN, "<burn>", "exec")
        self.assertIn("pwrite", code.co_names)
        self.assertIn(str(bm.CPU_BURN_BATCH).replace("_", ""), bm.CPU_BURN.replace("_", ""))

    def test_start_spawns_one_isolated_worker_per_core(self):
        load = bm._CpuLoad(3)
        load.start()
        self.assertEqual(len(self.procs), 3)
        for i, proc in enumerate(self.procs):
            self.assertEqual(proc.cmd, [sys.executable, "-c", bm.CPU_BURN, str(self.tmp / "load" / str(i))])
            self.assertIs(proc.kw["stdin"], subprocess.DEVNULL)
            self.assertIs(proc.kw["stdout"], subprocess.DEVNULL)
            self.assertTrue(proc.kw["start_new_session"])
        self.assertTrue(load.alive())

    def test_work_sums_complete_files_and_ignores_partial_or_missing(self):
        load = bm._CpuLoad(4)
        load.start()
        d = self.tmp / "load"
        (d / "0").write_bytes(struct.pack("<Q", 300_000))
        (d / "1").write_bytes(struct.pack("<Q", 100_000))
        (d / "2").write_bytes(b"\x01\x02\x03")  # escritura a medias
        # el 3 aún no existe
        self.assertEqual(load.work(), 400_000)

    def test_stop_terminates_kills_stragglers_and_removes_dir(self):
        load = bm._CpuLoad(3)
        load.start()
        self.procs[0].alive = False  # ya terminó solo
        self.procs[2].hang = True
        load.stop()
        self.assertEqual(self.procs[0].signals, [])  # no se señala a un proceso muerto
        self.assertEqual(self.procs[1].signals, [signal.SIGTERM])
        self.assertEqual(self.procs[2].signals, [signal.SIGTERM])
        self.assertTrue(self.procs[2].killed)
        self.assertFalse((self.tmp / "load").exists())
        self.assertEqual(load.dir, "")
        load.stop()  # idempotente


class GpuLoadClass(unittest.TestCase):
    def setUp(self):
        self.procs = []

        def popen(cmd, **kw):
            proc = FakeProc(cmd, **kw)
            self.procs.append(proc)
            return proc

        p = mock.patch.object(bm.subprocess, "Popen", popen)
        p.start()
        self.addCleanup(p.stop)

    def test_start_disables_vsync_and_isolates_process_group(self):
        load = bm._GpuLoad([["/fake/a", "-x"], ["/fake/b"]])
        with mock.patch.dict(bm.os.environ, {"HOME": "/h"}):
            load.start()
        self.assertEqual([p.cmd for p in self.procs], [["/fake/a", "-x"], ["/fake/b"]])
        for proc in self.procs:
            self.assertIs(proc.kw["stdin"], subprocess.DEVNULL)
            self.assertTrue(proc.kw["start_new_session"])
            self.assertEqual(proc.kw["env"]["vblank_mode"], "0")
            self.assertEqual(proc.kw["env"]["__GL_SYNC_TO_VBLANK"], "0")
            self.assertEqual(proc.kw["env"]["HOME"], "/h")
        self.assertIsNone(load.work())

    def test_alive_while_any_process_runs(self):
        load = bm._GpuLoad([["a"], ["b"]])
        self.assertFalse(load.alive())  # sin lanzar
        load.start()
        self.assertTrue(load.alive())
        self.procs[0].alive = False
        self.assertTrue(load.alive())
        self.procs[1].alive = False
        self.assertFalse(load.alive())

    def test_stop_term_then_kill_on_timeout(self):
        load = bm._GpuLoad([["a"], ["b"], ["c"]])
        load.start()
        self.procs[0].alive = False
        self.procs[2].hang = True
        load.stop()
        self.assertEqual(self.procs[0].signals, [])
        self.assertEqual(self.procs[1].signals, [signal.SIGTERM])
        self.assertTrue(self.procs[2].killed)
        self.assertFalse(self.procs[1].killed)


class NvidiaDriver(unittest.TestCase):
    def test_reads_nvidia_then_amdgpu_from_fake_paths(self):
        seen = []

        def reader(values):
            def read_str(path):
                seen.append(str(path))
                return values.get(str(path))
            return read_str

        with mock.patch.object(bm, "read_str", reader({"/sys/module/nvidia/version": "550.54"})):
            self.assertEqual(bm._nvidia_driver(), "550.54")
        self.assertEqual(seen, ["/sys/module/nvidia/version"])
        seen.clear()
        with mock.patch.object(bm, "read_str", reader({"/sys/module/amdgpu/version": "6.1"})):
            self.assertEqual(bm._nvidia_driver(), "6.1")
        self.assertEqual(seen, ["/sys/module/nvidia/version", "/sys/module/amdgpu/version"])
        with mock.patch.object(bm, "read_str", reader({})):
            self.assertIsNone(bm._nvidia_driver())


class TerminateProcess(unittest.TestCase):
    def test_noop_when_already_exited(self):
        proc = FakeProc(["x"])
        proc.alive = False
        bm._terminate_process(proc)
        self.assertEqual((proc.signals, proc.waits), ([], []))

    def test_sigterm_then_wait(self):
        proc = FakeProc(["x"])
        bm._terminate_process(proc)
        self.assertEqual(proc.signals, [signal.SIGTERM])
        self.assertEqual(proc.waits, [5])
        self.assertFalse(proc.killed)

    def test_kill_after_timeout(self):
        proc = FakeProc(["x"])
        proc.hang = True
        bm._terminate_process(proc)
        self.assertTrue(proc.killed)
        self.assertEqual(proc.waits, [5, 5])


# ----------------------------------------------------------------------- CLI

class Cli(unittest.TestCase):
    def _main(self, argv, **patches):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = bm.main(argv)
        return rc, json.loads(buf.getvalue())

    def test_cpu_args_are_clamped_and_forwarded(self):
        calls = []
        with mock.patch.object(bm, "run_cpu_benchmark", lambda **kw: calls.append(kw) or {"ok": True}):
            rc, out = self._main(["cpu", "--seconds", "20", "--warmup", "-3", "--reps", "0",
                                  "--cooldown", "-1", "--idle-baseline", "50.5", "--start-margin", "7",
                                  "--workers", "6"])
        self.assertEqual((rc, out), (0, {"ok": True}))
        self.assertEqual(calls, [{"workers": 6, "seconds": 20, "warmup": 0, "reps": 1, "cooldown": 0,
                                  "idle_baseline": 50.5, "margin": 7.0}])

    def test_gpu_defaults(self):
        calls = []
        with mock.patch.object(bm, "run_gpu_benchmark", lambda **kw: calls.append(kw) or {"ok": False}):
            rc, out = self._main(["gpu"])
        self.assertEqual((rc, out), (0, {"ok": False}))
        self.assertEqual(calls, [{"seconds": 45, "warmup": bm.WARMUP_S, "reps": 1, "cooldown": bm.COOLDOWN_S,
                                  "idle_baseline": bm.IDLE_BASELINE_C, "margin": bm.START_MARGIN_C}])

    def test_end_to_end_cpu_json_on_stdout_with_fake_everything(self):
        Sim(self)
        with mock.patch.object(bm, "_CpuLoad", lambda w: ScriptLoad()):
            rc, out = self._main(["cpu", "--seconds", "2", "--warmup", "0", "--reps", "1",
                                  "--cooldown", "0", "--workers", "2"])
        self.assertEqual(rc, 0)
        self.assertTrue(out["ok"])
        self.assertEqual(out["schema"], 2)
        self.assertEqual(out["conditions"]["threads"], 2)

    def test_invalid_arguments_exit_with_usage_error(self):
        for argv in ([], ["ram"], ["cpu", "--seconds", "abc"], ["gpu", "--workers", "2"]):
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as ctx:
                    bm.main(argv)
                self.assertEqual(ctx.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
