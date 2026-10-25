import csv
import hashlib
import io
import json
import logging
from functools import lru_cache
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from backend.analysis import index_data, report

ROOT = Path(__file__).parent
app = FastAPI(
    title="Wind Desk API",
    version="1.0.0",
    description="January 2026 decision-date replay using Elexon WINDFOR and FUELHH only.",
)
log = logging.getLogger("winddesk")


@lru_cache(maxsize=1)
def snapshot():
    try:
        payload = (ROOT / "data/snapshot.json").read_bytes()
        manifest = json.loads((ROOT / "data/manifest.json").read_text())
        if hashlib.sha256(payload).hexdigest() != manifest["sha256"]:
            raise ValueError("Snapshot checksum mismatch")
        return index_data(json.loads(payload)), manifest
    except (OSError, ValueError, KeyError) as exc:
        log.exception("Snapshot unavailable")
        raise HTTPException(
            503, "Data snapshot unavailable. Run scripts/fetch_data.py."
        ) from exc


@app.get("/api/health")
def health():
    _, manifest = snapshot()
    return {"status": "ok", "snapshot": manifest["sha256"]}


@app.get("/api/report")
def get_report(
    decision_date: str = Query(
        "2026-01-15", pattern=r"^2026-01-(0[1-9]|[12][0-9]|3[01])$"
    ),
    cutoff: str = Query("10:00", pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$"),
):
    index, manifest = snapshot()
    return report(index, decision_date, cutoff, manifest)


@app.get("/api/export")
def export(
    decision_date: str = Query(
        "2026-01-15", pattern=r"^2026-01-(0[1-9]|[12][0-9]|3[01])$"
    ),
    cutoff: str = Query("10:00", pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$"),
):
    result = get_report(decision_date, cutoff)
    out = io.StringIO()
    writer = csv.DictWriter(
        out,
        fieldnames=[
            "decision_date",
            "cutoff_utc",
            "start",
            "hour",
            "forecast",
            "actual",
            "error",
            "published",
            "age_hours",
        ],
    )
    writer.writeheader()
    writer.writerows(
        dict(r, decision_date=decision_date, cutoff_utc=cutoff) for r in result["rows"]
    )
    return Response(
        out.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="wind-{decision_date}.csv"'
        },
    )


app.frontend("/", directory=ROOT / "dist", check_dir=False)
