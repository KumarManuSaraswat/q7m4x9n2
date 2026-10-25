"""Pure, testable as-of selection and hourly wind error calculations. Units: MW."""

import math
from datetime import datetime, timedelta


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def metrics(rows):
    paired = [r for r in rows if r["forecast"] is not None and r["actual"] is not None]
    errors = [r["forecast"] - r["actual"] for r in paired]
    if not errors:
        return {
            "count": 0,
            "mae": None,
            "rmse": None,
            "bias": None,
            "p90_abs": None,
            "shortfall_mwh": None,
        }
    absolute = sorted(abs(e) for e in errors)
    return {
        "count": len(errors),
        "mae": sum(absolute) / len(errors),
        "rmse": math.sqrt(sum(e * e for e in errors) / len(errors)),
        "bias": sum(errors) / len(errors),
        "p90_abs": absolute[math.ceil(0.9 * len(errors)) - 1],
        "shortfall_mwh": sum(max(e, 0) for e in errors),
    }


def index_data(data):
    forecasts, actuals = {}, {}
    for row in data["forecasts"]:
        start, published = timestamp(row["startTime"]), timestamp(row["publishTime"])
        value = float(row["generation"])
        if not math.isfinite(value):
            raise ValueError("Non-finite forecast")
        if start.minute or start.second or start.microsecond:
            raise ValueError("Expected hourly WINDFOR timestamps")
        existing = forecasts.get(start, {}).get(published)
        if existing is not None and existing != value:
            raise ValueError("Conflicting forecast values at the same publication time")
        forecasts.setdefault(start, {})[published] = value
    for row in data["actuals"]:
        if row.get("fuelType") != "WIND":
            continue
        start, published = timestamp(row["startTime"]), timestamp(row["publishTime"])
        value = float(row["generation"])
        if not math.isfinite(value):
            raise ValueError("Non-finite actual")
        if start not in actuals or published > actuals[start][0]:
            actuals[start] = (published, value)
    return forecasts, actuals


def day_rows(forecasts, actuals, decision_date, cutoff):
    decision = timestamp(f"{decision_date}T{cutoff}:00+00:00")
    delivery = decision.replace(hour=0, minute=0) + timedelta(days=1)
    rows = []
    for hour in range(24):
        start = delivery + timedelta(hours=hour)
        eligible = [
            (p, v) for p, v in forecasts.get(start, {}).items() if p <= decision
        ]
        selected = max(eligible, default=None)
        halves = [actuals.get(start), actuals.get(start + timedelta(minutes=30))]
        actual = (
            sum(h[1] for h in halves) / 2
            if all(h is not None for h in halves)
            else None
        )
        value = selected[1] if selected else None
        rows.append(
            {
                "start": start.isoformat(),
                "hour": start.strftime("%H:%M"),
                "forecast": value,
                "actual": actual,
                "error": (
                    value - actual if value is not None and actual is not None else None
                ),
                "published": selected[0].isoformat() if selected else None,
                "age_hours": (
                    (decision - selected[0]).total_seconds() / 3600
                    if selected
                    else None
                ),
            }
        )
    return rows


def report(index, decision_date, cutoff, manifest):
    forecasts, actuals = index
    days = []
    all_rows = []
    for day in range(1, 32):
        date = f"2026-01-{day:02d}"
        rows = day_rows(forecasts, actuals, date, cutoff)
        all_rows.extend(rows)
        days.append({"date": date, **metrics(rows)})
    rows = day_rows(forecasts, actuals, decision_date, cutoff)
    selected = [r for r in rows if r["forecast"] is not None]
    return {
        "decision_date": decision_date,
        "delivery_date": (
            timestamp(decision_date + "T00:00:00+00:00") + timedelta(days=1)
        )
        .date()
        .isoformat(),
        "cutoff": cutoff,
        "rows": rows,
        "daily": metrics(rows),
        "monthly": metrics(all_rows),
        "days": days,
        "forecast_hours": len(selected),
        "forecast_mwh": (
            sum(r["forecast"] for r in selected) if len(selected) == 24 else None
        ),
        "manifest": manifest,
    }
