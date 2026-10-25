import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Area,
  Line,
  ComposedChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Wind,
  ArrowUpRight,
  Download,
  CheckCircle2,
  Clock3,
  Info,
  Activity,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import "./style.css";

type Metrics = {
  count: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  p90_abs: number | null;
  shortfall_mwh: number | null;
};
type Row = {
  start: string;
  hour: string;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  published: string | null;
  age_hours: number | null;
};
type Report = {
  decision_date: string;
  delivery_date: string;
  cutoff: string;
  rows: Row[];
  daily: Metrics;
  monthly: Metrics;
  days: (Metrics & { date: string })[];
  forecast_hours: number;
  forecast_mwh: number | null;
  manifest: {
    retrieved_at: string;
    sha256: string;
    forecast_rows: number;
    actual_rows: number;
  };
};
const number = (n: number | null | undefined, digits = 0) =>
  n == null
    ? "—"
    : n.toLocaleString("en-GB", { maximumFractionDigits: digits });
const dateLabel = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
function App() {
  const [date, setDate] = useState("2026-01-15"),
    [cutoff, setCutoff] = useState("10:00"),
    [tab, setTab] = useState("desk"),
    [actuals, setActuals] = useState(false),
    [data, setData] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const control = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/report?decision_date=${date}&cutoff=${cutoff}`, {
      signal: control.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 503
              ? "The Elexon snapshot is unavailable. Please refresh the data on the server."
              : "Unable to load the report. Please try again.",
          );
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!control.signal.aborted) setLoading(false);
      });
    return () => control.abort();
  }, [date, cutoff, retry]);
  const stats = tab === "accuracy" ? data?.monthly : data?.daily;
  const query = `decision_date=${date}&cutoff=${cutoff}`;
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/" aria-label="Wind Desk home">
          <span className="brand-icon">
            <Wind size={25} />
          </span>
          wind<span>desk</span>
        </a>
        <div className="workspace-label">ENERGY INTELLIGENCE</div>
        <nav aria-label="Main navigation">
          {[
            ["desk", "Decision desk", CalendarDays],
            ["accuracy", "Forecast accuracy", Activity],
            ["method", "Method & sources", Info],
          ].map(([id, label, Icon]) => (
            <button
              key={String(id)}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(String(id))}
            >
              {React.createElement(Icon, { size: 18 })}
              {String(label)}
              {tab === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" /> JANUARY 2026 PILOT
          <p>
            GB national wind
            <br />
            Elexon Insights data
          </p>
          <div className="small-rule" />
          Built for decisions.
          <br />
          Grounded in evidence.
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />{" "}
            <strong>
              {tab === "desk"
                ? "Decision desk"
                : tab === "accuracy"
                  ? "Forecast accuracy"
                  : "Method & sources"}
            </strong>
          </div>
          <span className="pilot">HISTORICAL REPLAY</span>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <p className="eyebrow">A CLEARER VIEW OF TOMORROW</p>
              <h1>
                {tab === "desk"
                  ? "Wind intelligence. Before you buy."
                  : tab === "accuracy"
                    ? "Know the forecast’s track record."
                    : "Every number has a provenance."}
              </h1>
              <p className="subtitle">
                {tab === "desk"
                  ? "Replay the wind forecast available at your day-ahead decision cutoff."
                  : tab === "accuracy"
                    ? "A consistent, hindsight-free forecast selection across January decision dates."
                    : "The assumptions, calculations and boundaries behind this pilot."}
              </p>
            </div>
            <span className="round-wind">
              <Wind size={36} />
            </span>
          </div>
          <section className="controls" aria-label="Report filters">
            <label>
              Decision date
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => {
                  const day = `2026-01-${String(i + 1).padStart(2, "0")}`;
                  return (
                    <option key={day} value={day}>
                      {dateLabel(day)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Decision cutoff · UTC
              <select
                value={cutoff}
                onChange={(e) => setCutoff(e.target.value)}
              >
                {["08:00", "09:00", "10:00", "11:00", "12:00", "16:00"].map(
                  (t) => (
                    <option key={t}>{t}</option>
                  ),
                )}
              </select>
            </label>
            <div className="delivery">
              <ArrowUpRight size={18} />
              <div>
                <small>Next-day delivery</small>
                <strong>
                  {data && !loading
                    ? dateLabel(data.delivery_date)
                    : "Updating…"}
                </strong>
              </div>
            </div>
            <a
              className={`export ${loading || error ? "disabled" : ""}`}
              aria-disabled={loading || !!error}
              href={`/api/export?${query}`}
            >
              <Download size={16} /> Export day CSV
            </a>
          </section>
          {error ? (
            <div className="error" role="alert">
              <h2>We couldn’t load the report</h2>
              <p>{error}</p>
              <button onClick={() => setRetry(retry + 1)}>Try again</button>
            </div>
          ) : loading ? (
            <div className="loading" role="status">
              <Wind className="spin" /> Preparing your decision snapshot…
            </div>
          ) : (
            data && (
              <>
                {tab === "method" ? (
                  <section className="method-grid">
                    <article className="panel">
                      <p className="eyebrow">01 / TIME & SCOPE</p>
                      <h2>A fair historical replay</h2>
                      <p>
                        Decision dates are 1–31 January 2026. Delivery dates are
                        2 January–1 February. January is GMT, so Europe/London
                        and UTC coincide.
                      </p>
                      <p>
                        For each delivery hour, choose the most recent WINDFOR
                        publication with{" "}
                        <code>publishTime ≤ decision cutoff</code>. Later
                        forecasts are excluded. The default 10:00 cutoff is an
                        illustrative operating assumption, not a claim about a
                        specific exchange gate closure.
                      </p>
                      <p>
                        Selected publication timestamps appear in the audit
                        table. Elexon’s publication time is used as the
                        availability proxy; ingestion latency is not modelled.
                      </p>
                    </article>
                    <article className="panel">
                      <p className="eyebrow">02 / ALIGNMENT</p>
                      <h2>Compare like with like</h2>
                      <p>
                        The downloaded WINDFOR records are hourly. FUELHH wind
                        actuals are half-hourly. The hourly actual is the mean
                        of the two corresponding half-hours, requiring both
                        values.
                      </p>
                      <p>
                        Each forecast is treated as representative of its hour.
                        This is an explicit alignment assumption. Missing values
                        stay missing, never zero. Metrics use paired hours only.
                        Latest downloaded actual revisions are used for
                        retrospective scoring.
                      </p>
                    </article>
                    <article className="panel">
                      <p className="eyebrow">03 / ERROR DEFINITIONS</p>
                      <h2>From MW to meaningful error</h2>
                      <p>
                        <strong>Error = forecast − actual.</strong> A positive
                        error means wind underdelivered relative to forecast,
                        increasing the replacement energy needed, all else
                        equal.
                      </p>
                      <p>
                        MAE = mean absolute error. RMSE weights large misses
                        more heavily. Bias = mean signed error. P90 is the
                        nearest-rank 90th percentile of absolute errors.
                      </p>
                      <p>
                        Hourly MW × 1 hour gives MWh. Wind shortfall sums
                        positive hourly errors, without netting surpluses. These
                        are historical diagnostics, not calibrated future risk
                        bounds.
                      </p>
                    </article>
                    <article className="panel">
                      <p className="eyebrow">04 / DATA & LIMITS</p>
                      <h2>Two datasets. Clear boundaries.</h2>
                      <p>
                        <a
                          href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Elexon WINDFOR ↗
                        </a>{" "}
                        and{" "}
                        <a
                          href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream"
                          target="_blank"
                          rel="noreferrer"
                        >
                          FUELHH (WIND) ↗
                        </a>{" "}
                        only. This represents the Elexon series, not every
                        embedded wind installation or a utility’s contracted
                        portfolio.
                      </p>
                      <p>
                        No demand, prices, other renewables or portfolio
                        positions are supplied. The app cannot calculate a
                        complete procurement volume or financial savings.
                      </p>
                      <p>
                        Retrieved{" "}
                        {new Date(data.manifest.retrieved_at).toLocaleString(
                          "en-GB",
                          { timeZone: "UTC" },
                        )}{" "}
                        UTC · {number(data.manifest.forecast_rows)} forecast
                        rows · {number(data.manifest.actual_rows)} actual rows.
                      </p>
                      <details>
                        <summary>Snapshot SHA-256</summary>
                        <code className="hash">{data.manifest.sha256}</code>
                      </details>
                    </article>
                  </section>
                ) : (
                  <>
                    <div className="status">
                      <CheckCircle2 size={16} />
                      <strong>
                        {data.forecast_hours}/24 delivery hours available
                      </strong>
                      <span>
                        Forecasts published by {cutoff} UTC on {dateLabel(date)}
                      </span>
                      <span className="status-end">
                        <Clock3 size={14} /> As-of selection
                      </span>
                    </div>
                    <section className="cards" aria-label="Key metrics">
                      {tab === "desk" ? (
                        <>
                          <Metric
                            label="Forecast wind energy"
                            value={number(
                              data.forecast_mwh == null
                                ? null
                                : data.forecast_mwh / 1000,
                              1,
                            )}
                            unit="GWh"
                            note="Next-day total · all 24 hours required"
                          />
                          <Metric
                            label="Average forecast output"
                            value={number(
                              data.forecast_mwh == null
                                ? null
                                : data.forecast_mwh / 24,
                            )}
                            unit="MW"
                            note="Available at the selected cutoff"
                          />
                          <Metric
                            label="Latest selected publication"
                            value={
                              data.rows
                                .map((r) => r.published)
                                .filter((p): p is string => p !== null)
                                .sort()
                                .at(-1)
                                ?.slice(11, 16) || "—"
                            }
                            unit="UTC"
                            note="See hourly table for each vintage"
                          />
                          <Metric
                            label="January mean absolute error"
                            value={number(data.monthly.mae)}
                            unit="MW"
                            note={`${data.monthly.count}/744 paired hours · retrospective`}
                            accent
                          />
                        </>
                      ) : (
                        <>
                          <Metric
                            label="Mean absolute error"
                            value={number(stats?.mae)}
                            unit="MW"
                            note="Typical absolute hourly miss"
                          />
                          <Metric
                            label="Root mean square error"
                            value={number(stats?.rmse)}
                            unit="MW"
                            note="More sensitive to larger errors"
                          />
                          <Metric
                            label="Forecast bias"
                            value={number(stats?.bias)}
                            unit="MW"
                            note="Positive = wind overforecast"
                          />
                          <Metric
                            label="90th percentile absolute error"
                            value={number(stats?.p90_abs)}
                            unit="MW"
                            note="Historical sample · not a prediction band"
                            accent
                          />
                        </>
                      )}
                    </section>
                    <section className="panel chart-panel">
                      <div className="panel-heading">
                        <div>
                          <p className="eyebrow">
                            {tab === "desk"
                              ? "DELIVERY PROFILE"
                              : "MONTHLY BACKTEST"}
                          </p>
                          <h2>
                            {tab === "desk"
                              ? `Wind outlook · ${dateLabel(data.delivery_date)}`
                              : "How did the forecast perform each day?"}
                          </h2>
                          <p>
                            {tab === "desk"
                              ? "Hourly power · MW · timestamps in UTC"
                              : `Decision dates · January 2026 · ${cutoff} UTC cutoff · ${data.monthly.count}/744 matched hours`}
                          </p>
                        </div>
                        {tab === "desk" && (
                          <label className="toggle">
                            <input
                              type="checkbox"
                              checked={actuals}
                              onChange={(e) => setActuals(e.target.checked)}
                            />{" "}
                            Reveal actuals <span>Retrospective</span>
                          </label>
                        )}
                      </div>
                      <div className="legend">
                        <span>
                          <i className="teal" />
                          {tab === "desk" ? "Available forecast" : "Daily MAE"}
                        </span>
                        {tab === "desk" && actuals && (
                          <span>
                            <i className="orange" />
                            Actual generation
                          </span>
                        )}
                        <span className="chart-unit">MW</span>
                      </div>
                      <div
                        className="chart"
                        role="img"
                        aria-label={
                          tab === "desk"
                            ? "Hourly forecast chart; values are available in the table below"
                            : "Daily mean absolute forecast error; values are available in the table below"
                        }
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          {tab === "desk" ? (
                            <ComposedChart
                              data={data.rows}
                              margin={{
                                top: 10,
                                right: 15,
                                bottom: 10,
                                left: 5,
                              }}
                            >
                              <defs>
                                <linearGradient
                                  id="windFill"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#188c83"
                                    stopOpacity={0.2}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#188c83"
                                    stopOpacity={0.015}
                                  />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                vertical={false}
                                stroke="#e8eeee"
                                strokeDasharray="3 4"
                              />
                              <XAxis
                                dataKey="hour"
                                tickLine={false}
                                axisLine={false}
                                interval={3}
                                tick={{ fontSize: 12, fill: "#74848a" }}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 12, fill: "#74848a" }}
                                tickFormatter={(v) => number(v)}
                              />
                              <Tooltip
                                formatter={(v: number, n: string) => [
                                  `${number(v)} MW`,
                                  n === "forecast" ? "Forecast" : "Actual",
                                ]}
                                contentStyle={{
                                  borderRadius: 10,
                                  border: "1px solid #dce7e4",
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="forecast"
                                stroke="#138b80"
                                strokeWidth={3}
                                fill="url(#windFill)"
                                isAnimationActive={false}
                              />
                              {actuals && (
                                <Line
                                  type="monotone"
                                  dataKey="actual"
                                  stroke="#d18c42"
                                  strokeWidth={2}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              )}
                            </ComposedChart>
                          ) : (
                            <BarChart
                              data={data.days}
                              margin={{
                                top: 10,
                                right: 15,
                                bottom: 10,
                                left: 5,
                              }}
                            >
                              <CartesianGrid
                                vertical={false}
                                stroke="#e8eeee"
                                strokeDasharray="3 4"
                              />
                              <XAxis
                                dataKey="date"
                                tickFormatter={(v) => v.slice(-2)}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 12 }}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 12 }}
                              />
                              <Tooltip
                                labelFormatter={(v) => `Decision ${v}`}
                                formatter={(v: number) => [
                                  `${number(v)} MW`,
                                  "MAE",
                                ]}
                              />
                              <Bar
                                dataKey="mae"
                                fill="#258f85"
                                radius={[4, 4, 0, 0]}
                                isAnimationActive={false}
                              />
                              <ReferenceLine
                                y={data.monthly.mae ?? 0}
                                stroke="#c28343"
                                strokeDasharray="4 4"
                              />
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </section>
                    <section className="insights">
                      <div className="insight-icon">
                        <Info size={21} />
                      </div>
                      <div>
                        <h3>
                          {tab === "desk"
                            ? "A wind view, not a complete purchase instruction"
                            : "Interpret the error in the direction of the decision"}
                        </h3>
                        <p>
                          {tab === "desk"
                            ? "Use the available wind profile to inform your position. Demand and contracted supply are outside this pilot, so a total buy volume cannot be inferred."
                            : `Positive bias means forecast wind exceeded realized wind. January’s cumulative positive wind error was ${number(data.monthly.shortfall_mwh)} MWh across matched hours; this is an observed wind shortfall, not a recommended reserve.`}
                        </p>
                      </div>
                      <button onClick={() => setTab("method")}>
                        Read methodology <ArrowUpRight size={16} />
                      </button>
                    </section>
                    <section className="panel table-panel">
                      <div className="panel-heading">
                        <div>
                          <p className="eyebrow">
                            {tab === "desk"
                              ? "FORECAST AUDIT TRAIL"
                              : "DAILY SCORECARD"}
                          </p>
                          <h2>
                            {tab === "desk"
                              ? "Inspect the decision inputs"
                              : "Compare each January decision"}
                          </h2>
                        </div>
                        <span className="table-count">
                          {tab === "desk"
                            ? "24 delivery hours"
                            : "31 decision dates"}
                        </span>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              {(tab === "desk"
                                ? [
                                    "Delivery hour UTC",
                                    "Forecast MW",
                                    "Publication UTC",
                                    ...(actuals
                                      ? ["Actual MW", "Error MW"]
                                      : []),
                                    "Age at cutoff",
                                  ]
                                : [
                                    "Decision date",
                                    "Matched hours",
                                    "MAE · MW",
                                    "RMSE · MW",
                                    "Bias · MW",
                                  ]
                              ).map((h) => (
                                <th key={h}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tab === "desk"
                              ? data.rows.map((r) => (
                                  <tr key={r.start}>
                                    <td>
                                      {r.hour}–
                                      {String(
                                        (Number(r.hour.slice(0, 2)) + 1) % 24,
                                      ).padStart(2, "0")}
                                      :00
                                    </td>
                                    <td className="forecast-number">
                                      {number(r.forecast)}
                                    </td>
                                    <td>
                                      {r.published
                                        ? r.published
                                            .slice(0, 16)
                                            .replace("T", " ")
                                        : "Unavailable"}
                                    </td>
                                    {actuals && (
                                      <>
                                        <td>{number(r.actual)}</td>
                                        <td
                                          className={
                                            (r.error ?? 0) > 0 ? "positive" : ""
                                          }
                                        >
                                          {number(r.error)}
                                        </td>
                                      </>
                                    )}
                                    <td>{number(r.age_hours, 1)} h</td>
                                  </tr>
                                ))
                              : data.days.map((d) => (
                                  <tr key={d.date}>
                                    <td>
                                      <button
                                        className="date-link"
                                        onClick={() => {
                                          setDate(d.date);
                                          setTab("desk");
                                          setActuals(true);
                                        }}
                                      >
                                        {dateLabel(d.date)} ↗
                                      </button>
                                    </td>
                                    <td>{d.count}/24</td>
                                    <td>{number(d.mae)}</td>
                                    <td>{number(d.rmse)}</td>
                                    <td
                                      className={
                                        d.bias && d.bias > 0 ? "positive" : ""
                                      }
                                    >
                                      {number(d.bias)}
                                    </td>
                                  </tr>
                                ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}
                <footer>
                  <span>
                    <span className="live-dot" /> Elexon Insights · saved
                    historical snapshot
                  </span>
                  <span>Decision dates: 1–31 Jan 2026 · All times UTC</span>
                </footer>
              </>
            )
          )}
        </div>
      </main>
    </div>
  );
}
function Metric({
  label,
  value,
  unit,
  note,
  accent = false,
}: {
  label: string;
  value: string | undefined;
  unit: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={`metric ${accent ? "accent" : ""}`}>
      <h3>{label}</h3>
      <div className="metric-value">
        {value}
        <span>{unit}</span>
      </div>
      <p>{note}</p>
    </article>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
