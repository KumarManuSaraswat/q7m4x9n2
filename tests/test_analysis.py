from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from app import app
from backend.analysis import day_rows, index_data, metrics, report


def fixture_data():
    return {
        "forecasts": [
            {
                "startTime": "2026-01-02T00:00:00Z",
                "publishTime": "2026-01-01T09:00:00Z",
                "generation": 100,
            },
            {
                "startTime": "2026-01-02T00:00:00Z",
                "publishTime": "2026-01-01T10:00:00Z",
                "generation": 120,
            },
            {
                "startTime": "2026-01-02T00:00:00Z",
                "publishTime": "2026-01-01T10:01:00Z",
                "generation": 999,
            },
        ],
        "actuals": [
            {
                "startTime": "2026-01-02T00:00:00Z",
                "publishTime": "2026-01-02T00:30:00Z",
                "generation": 80,
                "fuelType": "WIND",
            },
            {
                "startTime": "2026-01-02T00:30:00Z",
                "publishTime": "2026-01-02T01:00:00Z",
                "generation": 100,
                "fuelType": "WIND",
            },
        ],
    }


def test_cutoff_inclusive_and_future_excluded():
    rows = day_rows(*index_data(fixture_data()), "2026-01-01", "10:00")
    assert rows[0]["forecast"] == 120
    assert rows[0]["actual"] == 90
    assert rows[0]["error"] == 30
    assert rows[0]["age_hours"] == 0
    assert len(rows) == 24
    assert rows[1]["forecast"] is None


def test_missing_half_hour_is_not_zero_or_imputed():
    data = fixture_data()
    data["actuals"].pop()
    rows = day_rows(*index_data(data), "2026-01-01", "10:00")
    assert rows[0]["actual"] is None
    assert metrics(rows)["count"] == 0
    assert metrics(rows)["mae"] is None


def test_conflicting_forecast_revision_is_rejected():
    data = fixture_data()
    data["forecasts"].append(dict(data["forecasts"][0], generation=555))
    with pytest.raises(ValueError, match="Conflicting"):
        index_data(data)


def test_unexpected_forecast_resolution_is_rejected():
    data = fixture_data()
    data["forecasts"][0]["startTime"] = "2026-01-02T00:30:00Z"
    with pytest.raises(ValueError, match="hourly"):
        index_data(data)


def test_latest_actual_revision_and_fuel_filter():
    data = fixture_data()
    data["actuals"].extend(
        [
            {
                "startTime": "2026-01-02T00:00:00Z",
                "publishTime": "2026-01-03T00:00:00Z",
                "generation": 120,
                "fuelType": "WIND",
            },
            {
                "startTime": "2026-01-02T00:00:00Z",
                "publishTime": "2026-01-04T00:00:00Z",
                "generation": 900,
                "fuelType": "GAS",
            },
        ]
    )
    assert day_rows(*index_data(data), "2026-01-01", "10:00")[0]["actual"] == 110


def test_metrics_sign_units_and_missing_pairs():
    result = metrics(
        [
            {"forecast": 120, "actual": 100},
            {"forecast": 80, "actual": 100},
            {"forecast": 0, "actual": 0},
            {"forecast": None, "actual": 1},
        ]
    )
    assert result["count"] == 3
    assert result["mae"] == pytest.approx(40 / 3)
    assert result["rmse"] == pytest.approx((800 / 3) ** 0.5)
    assert result["bias"] == 0
    assert result["shortfall_mwh"] == 20
    assert result["p90_abs"] == 20


def test_january_decision_boundary_and_no_forecasts():
    result = report(
        index_data({"actuals": [], "forecasts": []}), "2026-01-31", "10:00", {}
    )
    assert result["delivery_date"] == "2026-02-01"
    assert result["rows"][-1]["start"] == "2026-02-01T23:00:00+00:00"
    assert result["forecast_mwh"] is None
    assert result["monthly"]["count"] == 0


@pytest.mark.parametrize(
    "query",
    [
        "decision_date=2026-02-01",
        "decision_date=2026-01-32",
        "cutoff=25:00",
        "cutoff=10:99",
    ],
)
def test_invalid_api_inputs(query):
    assert TestClient(app).get("/api/report?" + query).status_code == 422


def test_real_snapshot_and_csv():
    client = TestClient(app)
    response = client.get("/api/report?decision_date=2026-01-31&cutoff=10:00")
    assert response.status_code == 200
    data = response.json()
    assert len(data["rows"]) == 24
    assert data["monthly"]["count"] <= 744
    cutoff = datetime(2026, 1, 31, 10, tzinfo=timezone.utc)
    for row in data["rows"]:
        if row["published"]:
            assert datetime.fromisoformat(row["published"]) <= cutoff
    exported = client.get("/api/export?decision_date=2026-01-31&cutoff=10:00")
    assert exported.status_code == 200
    assert len(exported.text.splitlines()) == 25
    assert "published" in exported.text.splitlines()[0]
