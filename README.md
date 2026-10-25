# Wind Desk

A decision-time replay and forecast accuracy portal for GB national wind. Built for the January 2026 day-ahead purchasing challenge with React, TypeScript and Python/FastAPI.

**Live app:** https://q7m4x9n2.vercel.app · **Repository:** https://github.com/KumarManuSaraswat/q7m4x9n2

**Video demo:** pending upload.

## What the product does

- Reconstructs the latest forecast **available at a chosen decision cutoff**, for each next-day delivery hour.
- Shows publication timestamps, forecast age, coverage and downloadable CSV.
- Separates the decision view from retrospective actuals and monthly error evaluation.
- Reports MAE, RMSE, signed bias and P90 absolute error with explicit missing-data handling.
- Uses only the requested Elexon WINDFOR and FUELHH WIND datasets. No synthetic fallback.

## Start with Docker

Install Docker and start its engine, then:

```sh
docker compose up --build
```

Open http://localhost:8000. API documentation: http://localhost:8000/docs.

## Local development

Python 3.12 and Node 22+ are recommended. A real historical snapshot is included, so startup does not depend on Elexon availability.

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
npm ci
```

Run these in two terminals:

```sh
uvicorn app:app --reload
npm run dev
```

Open the Vite URL (normally http://127.0.0.1:5173); `/api` requests proxy to FastAPI on port 8000. For the single-server production shape, run `npm run build`, then `uvicorn app:app` and visit port 8000.

## Refresh the data

```sh
python scripts/fetch_data.py
```

Downloads forecasts published 31 December–31 January and actuals for 2 January–1 February. Daily requests have bounded retries and timeouts. Inclusive API-boundary duplicates are removed. `data/manifest.json` records retrieval time, source, counts and a SHA-256 of `snapshot.json`. Restart the server after refresh: the immutable snapshot is cached per process. Data is not refreshed inside user requests.

## Methodology and assumptions

1. **Decision month, not delivery month:** decisions on 1–31 January 2026 correspond to delivery on 2 January–1 February. All dates are UTC; London is GMT during this period.
2. **As-of selection:** per target hour, select the greatest `publishTime <= decision cutoff`. Publication time proxies availability; network/ingestion latency is not modelled. 10:00 UTC is an illustrative default, not a verified exchange-specific gate closure. The cutoff is configurable.
3. **Resolution:** this snapshot’s WINDFOR records are hourly. FUELHH is half-hourly. Treat the forecast as representative of its hour; average actuals at HH:00 and HH:30. Both are required. This alignment assumption is visible in the app. No interpolation or zero-filling is used.
4. **Actual revisions:** the latest downloaded actual publication per start time is used for scoring. Actuals are retrospective, not decision inputs.
5. **Metrics:** error = forecast − actual in MW. MAE = mean absolute error; RMSE = square root of mean squared error; bias = mean signed error. P90 uses nearest rank. Only paired hours count. Empty samples return null, not zero. The monthly denominator is 744 hourly opportunities.
6. **Energy:** sum hourly MW × 1 h to obtain MWh. Forecast daily energy is null unless all 24 hours exist. Wind shortfall sums positive errors in MWh; surplus does not offset it.
7. **Interpretation:** positive error means less wind arrived than forecast. This can create additional replacement-energy need, all else equal. Without demand, contracted positions or prices, the app cannot calculate the complete buy volume, costs or savings. The source’s wind coverage is not a full utility portfolio.
8. **No claimed prospective uncertainty band:** January errors describe the entire historical sample, including dates later than a selected decision. They are labelled retrospective and must not be represented as information available on that decision date. A future calibrated risk feature would require a prior-only training window and out-of-sample validation.

## Architecture and files

| Path | Responsibility |
| --- | --- |
| `src/main.tsx`, `src/style.css` | React dashboard, chart interactions, accessible filters, loading/error states |
| `backend/analysis.py` | Pure as-of selection, time alignment and metrics |
| `app.py` | FastAPI validation, cached snapshot, JSON/CSV endpoints and local static hosting |
| `scripts/fetch_data.py` | Reproducible Elexon download, retries, deduplication and manifest |
| `data/` | Real API snapshot and provenance manifest |
| `tests/test_analysis.py` | Temporal, numerical, missingness, boundary and API tests |
| `Dockerfile`, `compose.yaml` | Multi-stage frontend build and non-root Python container |
| `vercel.json` | Vercel FastAPI deployment with React build assets in `dist/` |
| `.github/workflows/ci.yml` | Python tests, TypeScript/frontend build and Docker build |

Browser → same-origin FastAPI → in-memory indexed immutable snapshot. Offline ingestion → Elexon API → snapshot + manifest. This deliberately avoids a database and background queue for a fixed one-month pilot. FastAPI exposes schema-based validation and `/docs`; missing data returns a useful 503. React aborts obsolete fetches when filters change. No credentials are required at runtime.

## Verification

```sh
python -m pytest -q
npm run build
docker build -t wind-desk .
```

Tests exercise inclusive cutoff boundaries, future forecast exclusion, missing half-hours, actual revisions, fuel filtering, zero generation, error sign, MWh conversion, January/February scope, API validation and CSV shape. CI repeats these checks without making requests to Elexon.

## Deploy to Vercel

The FastAPI project builds React into `dist/` and registers it through `app.frontend()`. Vercel promotes those assets to its CDN; FastAPI serves the same directory locally and in Docker. The Python function packages the snapshot. `.vercelignore` excludes local build outputs to prevent stale asset packaging; Vercel builds fresh assets from source.

```sh
npm ci
vercel --prod
```

Use the FastAPI framework preset, build command `npm ci --include=dev && npm run build`, and Python 3.12. Ensure `data/` is included in deployment. Vercel uses its Python runtime; Docker is the reproducible local/alternative hosting path. Verify `/`, `/api/health`, `/api/report`, `/api/export` and `/docs` without authentication before submission.

## Sources

- [Elexon WINDFOR API](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)
- [Elexon FUELHH API](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream)
- [Vercel FastAPI deployment](https://vercel.com/docs/frameworks/backend/fastapi)

## AI assistance

OpenAI Codex assisted with requirements interpretation, API exploration, application code, tests and documentation.

## Deliberate limits

Fixed January decision window; hourly alignment assumption; no forecast calibration, market price, demand, portfolio sizing, authentication or live trading. Source corrections may change a future snapshot. The pilot is a retrospective analytical tool, not an automated procurement system.
