"""Download a reproducible snapshot; never generate synthetic fallback data."""

import hashlib
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets/"


def fetch(dataset, params):
    url = BASE + dataset + "/stream?" + urlencode(params)
    for attempt in range(4):
        try:
            with urlopen(
                Request(url, headers={"Accept": "application/json"}), timeout=60
            ) as response:
                rows = json.load(response)
            if not isinstance(rows, list):
                raise ValueError("Expected a dataset array")
            return rows
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2**attempt)


def main():
    actuals, forecasts = [], []
    # Prior publication day supports early January 1 cutoffs; Jan 31 decisions deliver Feb 1.
    for i in range(33):
        day = datetime(2025, 12, 31) + timedelta(days=i)
        following = day + timedelta(days=1)
        if day < datetime(2026, 2, 1):
            forecasts.extend(
                fetch(
                    "WINDFOR",
                    {
                        "publishDateTimeFrom": day.isoformat() + "Z",
                        "publishDateTimeTo": following.isoformat() + "Z",
                    },
                )
            )
        if day >= datetime(2026, 1, 2):
            actuals.extend(
                fetch(
                    "FUELHH",
                    {
                        "settlementDateFrom": day.date().isoformat(),
                        "settlementDateTo": day.date().isoformat(),
                        "fuelType": "WIND",
                    },
                )
            )
        print(
            f"{day.date()}: {len(forecasts)} forecasts, {len(actuals)} actuals",
            flush=True,
        )
    # Deduplicate inclusive API boundary rows, preserving every distinct revision.
    forecasts = list(
        {
            (r["startTime"], r["publishTime"], r["generation"]): r for r in forecasts
        }.values()
    )
    actuals = [r for r in actuals if r["fuelType"] == "WIND"]
    data = {"forecasts": forecasts, "actuals": actuals}
    payload = json.dumps(data, separators=(",", ":")).encode()
    directory = ROOT / "data"
    directory.mkdir(exist_ok=True)
    (directory / "snapshot.json").write_bytes(payload)
    manifest = {
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "forecast_rows": len(forecasts),
        "actual_rows": len(actuals),
        "source": BASE,
        "decision_start": "2026-01-01",
        "decision_end": "2026-01-31",
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
