"""Walk-forward backtest (FR-ENG-7, decisions.md E5): does "95% safe" hold on riders' real weeks?

For each rider with at least 12 weeks, from week 8 on: compute the salary using only the weeks before, pay it, move
the rest into (or out of) the buffer, and step to the next real week. The headline number holds each salary for the
next 12 real paydays (what "95% safe" promises) and counts how often the buffer went below zero. The one-payday
check (`*_ran_short_pct`) is always 0 for Coinvoy, because that payday's income is already known, so don't quote it.
The same replay runs for the naive baseline ("average of the last 4 weeks, minus 20%"), and we report how often the
real week landed inside the slow–busy band (P10–P90, target about 80%).

    uv run --directory ml python -m scripts.backtest ../private_data/histories.csv   # real, consented histories
    uv run --directory ml python -m scripts.backtest --synthetic 30                  # dry run, labelled synthetic
    ... --rate-model gbm   # replay with the pooled model (train it first); keep it only if it beats "shrink"

CSV columns: rider_id, week_start (YYYY-MM-DD Monday), net_sen, hours (optional). Results go to results/ (git-ignored).
Publish the real number on slide 4 even if it misses 95%.
"""

import argparse
import csv
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from app.engine.forecast import WeekObs, prior_for
from app.engine.salary import HORIZON, Inputs, solve

RESULTS = Path(__file__).resolve().parents[1] / "results"
START = 8  # weeks of history before the first replayed salary


def load(path: Path) -> dict[str, list[tuple[date, int, float | None]]]:
    riders: dict[str, list] = defaultdict(list)
    with path.open() as f:
        for r in csv.DictReader(f):
            riders[r["rider_id"]].append((date.fromisoformat(r["week_start"]), int(r["net_sen"]),
                                         float(r["hours"]) if r.get("hours") else None))
    return {k: sorted(v) for k, v in riders.items()}


def synthetic(n: int) -> dict[str, list]:
    """Labelled synthetic riders: AR(1) weekly luck plus a Ramadan-like dip, RM400–RM950 a week."""
    rng = np.random.default_rng(42)
    out = {}
    for i in range(n):
        mean, sd, rho = rng.uniform(55_000, 75_000), rng.uniform(0.15, 0.35), rng.uniform(0.2, 0.6)
        x, weeks = 0.0, []
        for w in range(30):
            x = rho * x + rng.normal(0, sd * np.sqrt(1 - rho**2))
            dip = 0.8 if 14 <= w < 18 else 1.0
            weeks.append((date(2026, 1, 5) + timedelta(weeks=w), int(mean * np.exp(x) * dip), 45.0))
        out[f"synthetic-{i:02d}"] = weeks
    return out


def held_short(weeks: list, t: int, buffer: int, salary: int) -> bool | None:
    """The real "95% safe" claim: keep this salary for the next 12 real paydays (no new money). Did the buffer dip
    below zero? None when fewer than 12 real weeks are left, so a short tail can't flatter the result."""
    if t - 1 + HORIZON > len(weeks):
        return None
    b = buffer
    for k in range(HORIZON):
        b += weeks[t - 1 + k][1] - salary
        if b < 0:
            return True
    return False


def replay(weeks: list, method: str, rate_model: str = "shrink") -> dict:
    buffer, short, covered, salaries = 0, 0, 0, []
    held, held_n = 0, 0
    for t in range(START, len(weeks)):
        history = weeks[:t]
        last_net = history[-1][1]
        if method == "coinvoy":
            res = solve(Inputs(week_start=weeks[t][0], last_week_net_sen=last_net,
                               history=tuple(WeekObs(n, h, d) for d, n, h in history),
                               prior=prior_for(["other"], None), planned_hours=history[-1][2] or 45.0,
                               buffer_sen=buffer, cuti_sen=0, seed=t, rate_model=rate_model))
            salary = res.salary_sen
            covered += res.band["low"] <= weeks[t][1] <= res.band["high"]
        else:
            salary = round(np.mean([n for _, n, _ in history[-4:]]) * 0.8 / 100) * 100
        h = held_short(weeks, t, buffer, salary)
        if h is not None:
            held_n += 1
            held += h
        buffer += last_net - salary
        short += buffer < 0  # 0 for Coinvoy by construction: this payday's income is already known
        salaries.append(salary)
    steps = len(weeks) - START
    return {"steps": steps, "short": short, "covered": covered, "median_salary_sen": int(np.median(salaries)),
            "held": held, "held_n": held_n}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?", type=Path)
    ap.add_argument("--synthetic", type=int, default=0)
    ap.add_argument("--rate-model", choices=["shrink", "gbm"], default="shrink")
    args = ap.parse_args()
    if not args.csv and not args.synthetic:
        ap.error("give a histories CSV, or --synthetic N for a dry run")
    riders = synthetic(args.synthetic) if args.synthetic else load(args.csv)
    riders = {k: v for k, v in riders.items() if len(v) >= 12}
    label = ("SYNTHETIC" if args.synthetic else "real") + ("" if args.rate_model == "shrink" else "-gbm")
    rows = []
    for rid, weeks in riders.items():
        c, b = replay(weeks, "coinvoy", args.rate_model), replay(weeks, "baseline")
        rows.append({"rider": rid, "weeks_replayed": c["steps"], "coinvoy_short_weeks": c["short"],
                     "baseline_short_weeks": b["short"], "band_covered": c["covered"],
                     "salaries_tested_12wk": c["held_n"], "coinvoy_short_12wk": c["held"],
                     "baseline_short_12wk": b["held"],
                     "coinvoy_median_salary_sen": c["median_salary_sen"],
                     "baseline_median_salary_sen": b["median_salary_sen"]})
    if not rows:
        raise SystemExit("no rider has 12+ weeks")
    steps = sum(r["weeks_replayed"] for r in rows)
    summary = {
        "data": label, "riders": len(rows), "weeks_replayed": steps,
        "coinvoy_ran_short_pct": round(100 * sum(r["coinvoy_short_weeks"] for r in rows) / steps, 1),
        "baseline_ran_short_pct": round(100 * sum(r["baseline_short_weeks"] for r in rows) / steps, 1),
        "salaries_tested_12wk": (held := sum(r["salaries_tested_12wk"] for r in rows)),
        "coinvoy_short_12wk_pct": round(100 * sum(r["coinvoy_short_12wk"] for r in rows) / held, 1) if held else None,
        "baseline_short_12wk_pct": round(100 * sum(r["baseline_short_12wk"] for r in rows) / held, 1) if held else None,
        "band_coverage_pct": round(100 * sum(r["band_covered"] for r in rows) / steps, 1),
        "coinvoy_median_salary_rm": round(np.median([r["coinvoy_median_salary_sen"] for r in rows]) / 100),
        "baseline_median_salary_rm": round(np.median([r["baseline_median_salary_sen"] for r in rows]) / 100),
    }
    RESULTS.mkdir(exist_ok=True)
    stamp = f"{date.today():%Y%m%d}_{label.lower()}"
    with (RESULTS / f"backtest_{stamp}.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    chart(summary, RESULTS / f"backtest_{stamp}.png")
    for k, v in summary.items():
        print(f"{k:28} {v}")


def chart(s: dict, out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6, 3.2), dpi=150)
    names = ["Coinvoy", "4-week average − 20%"]
    vals = [s["coinvoy_short_12wk_pct"], s["baseline_short_12wk_pct"]]
    bars = ax.barh(names, vals, color=["#4E7A00", "#8A8E85"])
    ax.axvline(5, color="#B91C1C", linestyle="--", linewidth=1)
    ax.text(5, 1.45, " target ≤ 5%", color="#B91C1C", fontsize=8, va="bottom")
    ax.bar_label(bars, labels=[f"{v}%" for v in vals], padding=3, fontsize=9)
    ax.invert_yaxis()  # Coinvoy on top
    ax.set_xlabel("salaries where the buffer went below zero within 12 real weeks (%)")
    # Running short less only matters if the salary isn't simply smaller, so show both.
    fig.text(0.01, 0.01, f"median weekly salary: Coinvoy RM{s['coinvoy_median_salary_rm']} · "
             f"baseline RM{s['baseline_median_salary_rm']} · "
             f"slow–busy band held {s['band_coverage_pct']}% of real weeks",
             fontsize=7, color="#5B5E57")
    ax.set_title(f"Walk-forward backtest, {s['riders']} riders, {s['salaries_tested_12wk']} salaries held 12 weeks "
                 f"({s['data']} data)",
                 fontsize=9)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout(rect=(0, 0.05, 1, 1))
    fig.savefig(out)


if __name__ == "__main__":
    main()
