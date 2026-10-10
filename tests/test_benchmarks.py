"""CP-7.05..7.07: estadística pura del benchmark (series fijas) y bucle con warm-up/repeticiones."""

import statistics
import unittest
from unittest import mock

from rog_monitor import benchmarks as bm

SERIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]


class Percentiles(unittest.TestCase):
    def test_linear_inclusive_exact_values(self):
        # h = (n-1)*q/100 sobre la serie ordenada, interpolando entre vecinos
        self.assertEqual(bm.percentile(SERIES, 0), 1)
        self.assertEqual(bm.percentile(SERIES, 50), 5.5)
        self.assertAlmostEqual(bm.percentile(SERIES, 95), 9.55)
        self.assertAlmostEqual(bm.percentile(SERIES, 99), 9.91)
        self.assertEqual(bm.percentile(SERIES, 100), 10)

    def test_matches_statistics_quantiles_inclusive(self):
        data = [61.5, 70.0, 72.25, 80.0, 88.0, 90.5, 91.0, 91.0, 95.5]
        cuts = statistics.quantiles(data, n=100, method="inclusive")
        for q in (50, 95, 99):
            self.assertAlmostEqual(bm.percentile(data, q), cuts[q - 1])

    def test_order_independent_and_edge_cases(self):
        self.assertEqual(bm.percentile([10, 1, 5], 50), 5)
        self.assertEqual(bm.percentile([42], 99), 42)
        self.assertIsNone(bm.percentile([], 50))


class Describe(unittest.TestCase):
    def test_full_stats(self):
        self.assertEqual(bm.describe(SERIES), {
            "n": 10, "mean": 5.5, "min": 1, "max": 10, "stdev": 3.028,
            "p50": 5.5, "p95": 9.55, "p99": 9.91,
        })

    def test_skips_none_and_handles_empty_or_single(self):
        self.assertEqual(bm.describe([None, 4.0, None])["stdev"], None)
        self.assertEqual(bm.describe([None, 4.0])["p50"], 4.0)
        self.assertIsNone(bm.describe([]))
        self.assertIsNone(bm.describe([None]))

    def test_cv_percent(self):
        # stdev muestral de [10, 12] = 1.41421; media 11 -> 12.856 %
        self.assertEqual(bm.cv_percent([10, 12]), 12.856)
        self.assertEqual(bm.cv_percent([5, 5, 5]), 0.0)
        self.assertIsNone(bm.cv_percent([5]))
        self.assertIsNone(bm.cv_percent([0, 0]))


def _mk(t, rep=1, warm=False, **kw):
    return {"t": t, "rep": rep, "warmup": warm, **kw}


class BuildStats(unittest.TestCase):
    def test_per_rep_aggregate_and_cv(self):
        rep1 = [_mk(i, cpu_temp=v) for i, v in enumerate([80, 82, 84])]
        rep2 = [_mk(i, rep=2, cpu_temp=v) for i, v in enumerate([90, 92, 94])]
        st = bm.build_stats([rep1, rep2])
        self.assertEqual(st["percentile_method"], "linear-inclusive")
        self.assertEqual(st["per_rep"][0]["cpu_temp"]["mean"], 82)
        self.assertEqual(st["per_rep"][1]["cpu_temp"]["p50"], 92)
        agg = st["aggregate"]["cpu_temp"]
        self.assertEqual((agg["n"], agg["mean"], agg["min"], agg["max"]), (6, 87, 80, 94))
        # medias 82 y 92: stdev = 7.0711, media 87 -> 8.128 %
        self.assertEqual(st["cv_across_reps_pct"], {"cpu_temp": 8.128})
        self.assertNotIn("gpu_temp", agg)  # magnitud ausente: no aparece

    def test_single_rep_has_no_cv(self):
        st = bm.build_stats([[_mk(0, cpu_watts=50.0), _mk(1, cpu_watts=60.0)]])
        self.assertIsNone(st["cv_across_reps_pct"])
        self.assertEqual(st["aggregate"]["cpu_watts"]["mean"], 55.0)


class Throughput(unittest.TestCase):
    def test_delta_work_over_delta_t(self):
        s = [_mk(5.0, work=1000), _mk(6.0, work=1600), _mk(15.0, work=10_000)]
        self.assertEqual(bm.throughput(s), 900.0)  # 9000 iter / 10 s

    def test_none_without_work_or_span(self):
        self.assertIsNone(bm.throughput([_mk(1.0), _mk(2.0)]))
        self.assertIsNone(bm.throughput([_mk(1.0, work=5)]))
        self.assertIsNone(bm.throughput([_mk(1.0, work=5), _mk(1.0, work=9)]))


class FakeLoad:
    """Carga falsa: work crece 1000 por lectura, sin procesos reales."""

    def __init__(self):
        self.n = 0
        self.starts = 0

    def start(self):
        self.starts += 1
        self.n = 0

    def alive(self):
        return True

    def work(self):
        self.n += 1000
        return self.n

    def stop(self):
        pass


class _Gpu:
    def __init__(self, *_):
        pass

    def read(self):
        return {"active": {"name": "G", "temp": 50.0, "power": 5.0, "util": 1, "clock_mhz": 300}}


class _Fans:
    def __init__(self, *_):
        pass

    def read(self, profile=None):
        return [{"label": "cpu_fan", "rpm": 3000}]


class _Rapl:
    def read_watts(self):
        return 40.0


class RunRepetitions(unittest.TestCase):
    def _run(self, start_temp, reps=1):
        class Cpu:
            def read(self):
                return {"avg": start_temp, "package": start_temp, "freq_ghz": 3.0, "usage": 100,
                        "model": "CPU", "epp": "performance", "governor": "performance"}

        clock = iter(x * 0.5 for x in range(10_000))  # monotonic falso: 0.5 s por llamada
        patches = [
            mock.patch.object(bm, "scan", lambda: {}),
            mock.patch.object(bm, "Config", lambda: None),
            mock.patch.object(bm, "CpuReader", lambda *_: Cpu()),
            mock.patch.object(bm, "GpuReader", _Gpu),
            mock.patch.object(bm, "FanReader", _Fans),
            mock.patch.object(bm, "RaplReader", _Rapl),
            mock.patch.object(bm, "guardian_status", lambda: {"mode": "protect"}),
            mock.patch.object(bm, "asus_profile", lambda: "performance"),
            mock.patch.object(bm, "ppd_profile", lambda: "performance"),
            mock.patch.object(bm, "load_caps", lambda p=None: {"cpu_fan": 6700}),
            mock.patch.object(bm.time, "sleep", lambda s: None),
            mock.patch.object(bm.time, "monotonic", lambda: next(clock)),
        ]
        bat = mock.patch.object(bm, "BatteryReader")
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        bat_cls = bat.start()
        self.addCleanup(bat.stop)
        bat_cls.return_value.read.return_value = {"on_ac": True}
        load = FakeLoad()
        run = bm._run_repetitions(load, 3, 2, reps, 0, 45.0, 10.0, {"threads": 4, "seconds": 3})
        return run, load

    def test_warmup_excluded_and_conditions_recorded(self):
        run, _ = self._run(40.0)
        warm = [s for s in run["samples"] if s["warmup"]]
        meas = run["measured"]
        self.assertTrue(warm and meas)
        self.assertEqual(len(run["samples"]), len(warm) + len(meas))
        self.assertTrue(all(not s["warmup"] for s in meas))
        c = run["conditions"]
        self.assertEqual(c["power_source"], "ac")
        self.assertEqual(c["asus_profile"], "performance")
        self.assertEqual(c["epp"], "performance")
        self.assertEqual(c["gpu_name"], "G")
        self.assertEqual(c["guardian"]["mode"], "protect")
        self.assertEqual(c["fan_caps"], {"cpu_fan": 6700})
        self.assertEqual(c["threads"], 4)
        self.assertEqual(run["warnings"], [])
        self.assertIsNotNone(run["runs"][0]["score_ips"])

    def test_hot_start_warns_but_still_runs(self):
        run, _ = self._run(80.0)  # 80 > 45 + 10
        self.assertEqual(run["warnings"][0]["code"], "start_hot")
        self.assertEqual(run["warnings"][0]["limit"], 55.0)
        self.assertTrue(run["runs"][0]["hot_start"])
        self.assertTrue(run["measured"])

    def test_repetitions_tag_samples_and_restart_load(self):
        run, load = self._run(40.0, reps=3)
        self.assertEqual(load.starts, 3)
        self.assertEqual([r["rep"] for r in run["runs"]], [1, 2, 3])
        self.assertEqual(len(run["measured_reps"]), 3)
        self.assertTrue(all(run["measured_reps"]))
        self.assertEqual({s["rep"] for s in run["samples"]}, {1, 2, 3})


if __name__ == "__main__":
    unittest.main()
