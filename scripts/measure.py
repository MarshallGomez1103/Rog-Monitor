#!/usr/bin/env python3
"""Cost of a process tree: CPU, RSS/PSS, ctx switches, IO, subprocess churn (stdlib, Linux).

  measure.py --cmd "python3 -m rog_monitor --json-stream --interval 1" --duration 60
  measure.py --pid 1234 --duration 60

The tree (root + all descendants) is re-scanned every --scan s (default 0.02) so short-lived
children are counted; full metrics are sampled every 1 s. Prints a markdown row, then JSON.
Limits: a child that lives < --scan may be missed; reads are same-user only.
"""
import argparse, json, os, resource, shlex, statistics, subprocess, sys, threading, time

HZ = os.sysconf("SC_CLK_TCK")
KB = 1024


def stat(pid):  # -> (comm, ppid, cpu_ticks, reaped_child_ticks)
    with open(f"/proc/{pid}/stat") as f:
        s = f.read()
    r = s.rfind(")")
    x = s[r + 2:].split()
    return s[s.find("(") + 1:r], int(x[1]), int(x[11]) + int(x[12]), int(x[13]) + int(x[14])


def scan(root, seen, tree):  # {pid: stat} for root + descendants; `seen` = pids known to be outside the tree
    now = {int(d) for d in os.listdir("/proc") if d.isdigit()}
    seen &= now
    out = {}
    for p in tree:  # known members: refresh
        if p in now:
            try:
                out[p] = stat(p)
            except OSError:
                pass
    new = {}
    for p in now - seen - set(out):  # unclassified pids
        try:
            new[p] = stat(p)
        except OSError:
            pass
    grew = True
    while grew:  # a new pid joins if its parent is in the tree (parent may itself be new)
        grew = False
        for p, st in list(new.items()):
            if p == root or st[1] in out:
                out[p] = new.pop(p)
                grew = True
    seen.update(new)
    return out


def cmdline(pid, comm):
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            c = f.read().replace(b"\0", b" ").decode(errors="replace").strip()
        return (c or f"[{comm}]")[:110]
    except OSError:
        return f"[{comm}]"


def kv(path, keys):
    out = {}
    try:
        with open(path) as f:
            for line in f:
                k, _, v = line.partition(":")
                if k in keys:
                    out[k] = int(v.split()[0])
    except (OSError, ValueError):
        pass
    return out


def sample(pids):  # instantaneous / cumulative counters summed over the tree
    rss = pss = ctx = rb = wb = wch = nthr = 0
    ctxd = {}
    for p in pids:
        m = kv(f"/proc/{p}/smaps_rollup", ("Rss", "Pss"))
        rss += m.get("Rss", 0)
        pss += m.get("Pss", 0)
        io = kv(f"/proc/{p}/io", ("read_bytes", "write_bytes", "wchar"))
        rb += io.get("read_bytes", 0)
        wb += io.get("write_bytes", 0)
        wch += io.get("wchar", 0)
        try:
            tids = os.listdir(f"/proc/{p}/task")
        except OSError:
            continue
        nthr += len(tids)
        for t in tids:  # ctx switches are per-thread in /proc/PID/status
            c = kv(f"/proc/{p}/task/{t}/status", ("voluntary_ctxt_switches", "nonvoluntary_ctxt_switches"))
            ctxd[(p, t)] = sum(c.values())
    return dict(rss=rss * KB, pss=pss * KB, rb=rb, wb=wb, wch=wch, thr=nthr), ctxd


def forks():  # system-wide fork counter, context for the spawn count
    with open("/proc/stat") as f:
        return next(int(l.split()[1]) for l in f if l.startswith("processes"))


def pct(v, q):
    v = sorted(v)
    return v[min(len(v) - 1, int(q * len(v)))] if v else 0.0


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--cmd")
    g.add_argument("--pid", type=int)
    ap.add_argument("--duration", type=float, default=60)
    ap.add_argument("--scan", type=float, default=0.02)
    ap.add_argument("--label", default="")
    a = ap.parse_args()

    proc, stamps = None, []
    if a.cmd:
        proc = subprocess.Popen(shlex.split(a.cmd), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        root = proc.pid

        def rd():
            for _ in proc.stdout:
                stamps.append(time.monotonic())
        threading.Thread(target=rd, daemon=True).start()
    else:
        root = a.pid

    t0, f0 = time.monotonic(), forks()
    me0 = resource.getrusage(resource.RUSAGE_SELF)
    base, last, born, label, reaped0 = {}, {}, set(), {}, {}
    first, seen, tree = True, set(), {}
    series = []  # per-second dicts
    prev = None
    ctx_prev, nxt = {}, t0 + 1
    try:
        while time.monotonic() - t0 < a.duration:
            tree = scan(root, seen, tree)
            if not tree:
                print("root exited", file=sys.stderr)
                break
            for p, (comm, ppid, cpu, rp) in tree.items():
                if p not in last:
                    base[p] = 0 if not first and p != root else cpu
                    reaped0[p] = rp
                    if not first and p != root:
                        born.add(p)
                last[p] = cpu
                if p in born:
                    label[p] = cmdline(p, comm)
            first = False
            now = time.monotonic()
            if now >= nxt:
                nxt += 1
                s, ctxd = sample(list(tree))
                s["t"] = now
                s["cpu"] = sum(last[p] - base[p] for p in last) / HZ
                s["ctx"] = sum(max(0, c - ctx_prev.get(k, c if k[0] not in born else 0)) for k, c in ctxd.items())
                ctx_prev = ctxd
                s["procs"] = len(tree)
                series.append(s)
            time.sleep(a.scan)
    finally:
        t1 = time.monotonic()
        if proc:
            proc.terminate()
            try:
                proc.wait(5)
            except subprocess.TimeoutExpired:
                proc.kill()
    f1 = forks()
    me1 = resource.getrusage(resource.RUSAGE_SELF)

    wall = t1 - t0
    if len(series) < 2:
        sys.exit("not enough samples")
    cpu_s = [(b["cpu"] - x["cpu"]) / (b["t"] - x["t"]) * 100 for x, b in zip(series, series[1:])]
    cpu_tot = (series[-1]["cpu"] - series[0]["cpu"]) / (series[-1]["t"] - series[0]["t"]) * 100
    span = series[-1]["t"] - series[0]["t"]
    ctx_rate = sum(s["ctx"] for s in series[1:]) / span
    mb = 1 << 20
    churn = {}
    for p in born:
        churn[label[p]] = churn.get(label[p], 0) + 1
    r = {
        "label": a.label or (a.cmd or f"pid {a.pid}"),
        "duration_s": round(wall, 1),
        "cpu_pct_mean": round(cpu_tot, 2), "cpu_pct_p95": round(pct(cpu_s, .95), 2), "cpu_pct_max": round(max(cpu_s), 2),
        "rss_mb_mean": round(statistics.mean(s["rss"] for s in series) / mb, 1),
        "pss_mb_mean": round(statistics.mean(s["pss"] for s in series) / mb, 1),
        "pss_mb_max": round(max(s["pss"] for s in series) / mb, 1),
        "ctx_per_s": round(ctx_rate, 1),
        "procs_mean": round(statistics.mean(s["procs"] for s in series), 1),
        "threads_mean": round(statistics.mean(s["thr"] for s in series), 1),
        "sys_forks_per_s": round((f1 - f0) / wall, 1),
        "spawned": len(born), "spawned_per_s": round(len(born) / wall, 2),
        "spawned_by_cmd": dict(sorted(churn.items(), key=lambda kv: -kv[1])),
        "read_bytes_per_s": round((series[-1]["rb"] - series[0]["rb"]) / span),
        "write_bytes_per_s": round((series[-1]["wb"] - series[0]["wb"]) / span),
        "wchar_per_s": round((series[-1]["wch"] - series[0]["wch"]) / span),
        "measure_self_cpu_pct": round(((me1.ru_utime + me1.ru_stime) - (me0.ru_utime + me0.ru_stime)) / wall * 100, 2),
    }
    if proc:
        gaps = [(b - x) * 1000 for x, b in zip(stamps, stamps[1:])]
        r.update(lines=len(stamps), lines_per_s=round(len(stamps) / wall, 2),
                 gap_ms_mean=round(statistics.mean(gaps), 1) if gaps else None,
                 gap_ms_p95=round(pct(gaps, .95), 1) if gaps else None)
    print("| label | dur s | CPU% mean | p95 | max | RSS MB | PSS MB | ctx/s | procs | spawned (/s) | read B/s | write B/s | lines/s | gap mean/p95 ms |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    print(f"| {r['label']} | {r['duration_s']} | {r['cpu_pct_mean']} | {r['cpu_pct_p95']} | {r['cpu_pct_max']} | "
          f"{r['rss_mb_mean']} | {r['pss_mb_mean']} | {r['ctx_per_s']} | {r['procs_mean']} | "
          f"{r['spawned']} ({r['spawned_per_s']}) | {r['read_bytes_per_s']} | {r['write_bytes_per_s']} | "
          f"{r.get('lines_per_s', '-')} | {r.get('gap_ms_mean', '-')}/{r.get('gap_ms_p95', '-')} |")
    print(json.dumps(r))


main()
