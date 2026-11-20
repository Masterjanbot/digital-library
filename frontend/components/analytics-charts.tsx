"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Legend,
} from "recharts";
import type { DownloadStatsDay, BookDownloadStat, ReadingActivitySeriesPoint, MyReadingStatsPoint } from "@/lib/types";

/**
 * Brand chart palette.
 * Single-series charts carry identity in the card title (no legend needed).
 * The donut encodes magnitude as a sequential single-hue blue ramp —
 * monotonic in luminance, validated for CVD-safe adjacency.
 */
export const CHART = {
  navy: "#142B4A",
  royal: "#2457A7",
  blue: "#3478C9",
  teal: "#238F91",
  sky: "#64A9E8",
  muted: "#7186A3",
  grid: "rgba(100,116,139,.32)",
  sequential: ["#2C5C91", "#3972A8", "#4D8BB9", "#6FA5CC", "#90BADA", "#B3D3EA"] as const,
};

type Locale = string;

function intl(locale: Locale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", options);
}

export function formatCompactDay(locale: Locale, day: string) {
  return intl(locale, { month: "short", day: "numeric" }).format(new Date(`${day}T00:00:00Z`));
}

export function formatFullDay(locale: Locale, day: string) {
  return intl(locale, { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T00:00:00Z`));
}

function localizeNumber(locale: Locale, value: number) {
  return value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
}

function TooltipShell({ label, rows }: { label?: string; rows: { name: string; value: string; color: string }[] }) {
  return (
    <div className="chart-tooltip" role="tooltip">
      {label && <p className="chart-tooltip-label">{label}</p>}
      {rows.map((row) => (
        <p key={row.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: row.color }} />
            <span className="text-slate-500 dark:text-slate-400">{row.name}</span>
          </span>
          <span className="font-semibold tabular-nums">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

const axisTick = { fill: CHART.muted, fontSize: 11 } as const;

export function DailyDownloadsLineChart({
  data,
  locale,
  seriesName,
}: {
  data: DownloadStatsDay[];
  locale: Locale;
  seriesName: string;
}) {
  const rows = useMemo(
    () => data.map((d) => ({ ...d, label: formatFullDay(locale, d.day), tick: formatCompactDay(locale, d.day) })),
    [data, locale],
  );
  return (
    <div className="chart-frame" style={{ height: 190 }} role="img" aria-label={seriesName}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 4" />
          <XAxis dataKey="tick" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={34} />
          <Tooltip
            cursor={{ stroke: CHART.teal, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !item) return null;
              return (
                <TooltipShell
                  label={item.label}
                  rows={[{ name: seriesName, value: localizeNumber(locale, item.count), color: CHART.blue }]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke={CHART.blue}
            strokeWidth={2.4}
            dot={false}
            activeDot={{ r: 5, fill: CHART.sky, stroke: CHART.blue, strokeWidth: 1.6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <thead><tr><th>{seriesName}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.day}><td>{r.label}: {r.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Monthly buckets derived from the (real) 30-day daily series — at most two buckets. */
export function aggregateMonthly(data: DownloadStatsDay[], locale: Locale) {
  const buckets = new Map<string, { key: string; label: string; count: number }>();
  for (const { day, count } of data) {
    const key = day.slice(0, 7);
    const [year, month] = key.split("-").map(Number);
    const label = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { month: "short", year: "numeric" }).format(
      new Date(year, (month || 1) - 1, 1),
    );
    const bucket = buckets.get(key) ?? { key, label, count: 0 };
    bucket.count += count;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function MonthlyDownloadsBarChart({
  data,
  locale,
  seriesName,
}: {
  data: DownloadStatsDay[];
  locale: Locale;
  seriesName: string;
}) {
  const rows = useMemo(() => aggregateMonthly(data, locale), [data, locale]);
  return (
    <div className="chart-frame" style={{ height: 210 }} role="img" aria-label={seriesName}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="32%">
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 4" />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={34} />
          <Tooltip
            cursor={{ fill: "rgba(120, 146, 125, 0.14)" }}
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !item) return null;
              return (
                <TooltipShell
                  label={item.label}
                  rows={[{ name: seriesName, value: localizeNumber(locale, item.count), color: CHART.teal }]}
                />
              );
            }}
          />
          <Bar dataKey="count" name={seriesName} fill={CHART.teal} radius={[7, 7, 2, 2]} maxBarSize={88} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <thead><tr><th>{seriesName}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key}><td>{r.label}: {r.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function TopBooksHorizontalBarChart({
  data,
  locale,
  seriesName,
}: {
  data: BookDownloadStat[];
  locale: Locale;
  seriesName: string;
}) {
  const rows = useMemo(
    () =>
      [...data]
        .filter((book) => book.downloads > 0)
        .sort((a, b) => b.downloads - a.downloads)
        .slice(0, 5)
        .map((book) => ({ id: book.id, title: book.title.length > 34 ? `${book.title.slice(0, 34)}…` : book.title, downloads: book.downloads }))
        .reverse(),
    [data],
  );
  const height = Math.max(150, rows.length * 46 + 24);
  return (
    <div className="chart-frame" style={{ height }} role="img" aria-label={seriesName}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barCategoryGap="26%">
          <CartesianGrid horizontal={false} stroke={CHART.grid} strokeDasharray="3 4" />
          <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} hide={false} />
          <YAxis type="category" dataKey="title" tick={{ ...axisTick, fontSize: 12 }} tickLine={false} axisLine={false} width={168} />
          <Tooltip
            cursor={{ fill: "rgba(22, 61, 50, 0.07)" }}
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !item) return null;
              return (
                <TooltipShell
                  label={item.title}
                  rows={[{ name: seriesName, value: localizeNumber(locale, item.downloads), color: CHART.blue }]}
                />
              );
            }}
          />
          <Bar dataKey="downloads" name={seriesName} fill={CHART.blue} radius={[2, 7, 7, 2]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <thead><tr><th>{seriesName}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{r.title}: {r.downloads}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function formatBucketLabel(locale: Locale, bucket: string, granularity: "day" | "month") {
  if (granularity === "month") {
    const [year, month] = bucket.split("-").map(Number);
    return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { month: "short", year: "2-digit" }).format(
      new Date(year || 2024, (month || 1) - 1, 1),
    );
  }
  return formatCompactDay(locale, bucket);
}

export function ReadingActivityComboChart({
  data,
  locale,
  granularity,
  seriesName,
  readersSeriesName,
  readingTimeName,
}: {
  data: ReadingActivitySeriesPoint[];
  locale: Locale;
  granularity: "day" | "month";
  seriesName: string;
  readersSeriesName: string;
  readingTimeName: string;
}) {
  const rows = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        tick: formatBucketLabel(locale, d.bucket, granularity),
        label: formatBucketLabel(locale, d.bucket, granularity),
      })),
    [data, locale, granularity],
  );
  const gradientId = "readingActivityArea";
  return (
    <div className="chart-frame" style={{ height: 240 }} role="img" aria-label={seriesName}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.blue} stopOpacity={0.34} />
              <stop offset="100%" stopColor={CHART.blue} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 4" />
          <XAxis dataKey="tick" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={34} />
          <Tooltip
            cursor={{ stroke: CHART.teal, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !item) return null;
              const minutes = Math.round(item.read_seconds / 60);
              return (
                <TooltipShell
                  label={item.label}
                  rows={[
                    { name: seriesName, value: localizeNumber(locale, item.sessions), color: CHART.blue },
                    { name: readersSeriesName, value: localizeNumber(locale, item.active_readers), color: CHART.sky },
                    { name: readingTimeName, value: `${localizeNumber(locale, minutes)} min`, color: CHART.teal },
                  ]}
                />
              );
            }}
          />
          <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="sessions"
            name={seriesName}
            stroke={CHART.blue}
            strokeWidth={2.4}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 5, fill: CHART.sky, stroke: CHART.blue, strokeWidth: 1.6 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="active_readers"
            name={readersSeriesName}
            stroke={CHART.sky}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 5, fill: CHART.sky, stroke: CHART.blue, strokeWidth: 1.4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <thead><tr><th>{seriesName}</th><th>{readersSeriesName}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bucket}>
              <td>{r.label}: {r.sessions}</td>
              <td>{r.active_readers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CategorySessionsBarChart({
  data,
  locale,
  seriesName,
  uncategorizedLabel,
}: {
  data: { category: string | null; sessions: number; percent: number }[];
  locale: Locale;
  seriesName: string;
  uncategorizedLabel: string;
}) {
  const rows = useMemo(
    () =>
      [...data]
        .filter((row) => row.sessions > 0)
        .slice(0, 5)
        .map((row) => ({
          name: row.category ?? uncategorizedLabel,
          sessions: row.sessions,
          percent: row.percent,
        }))
        .reverse(),
    [data, uncategorizedLabel],
  );
  const height = Math.max(150, rows.length * 46 + 24);
  return (
    <div className="chart-frame" style={{ height }} role="img" aria-label={seriesName}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 44, left: 4, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid horizontal={false} stroke={CHART.grid} strokeDasharray="3 4" />
          <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} hide />
          <YAxis type="category" dataKey="name" tick={{ ...axisTick, fontSize: 12 }} tickLine={false} axisLine={false} width={168} />
          <Tooltip
            cursor={{ fill: "rgba(22, 61, 50, 0.07)" }}
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !item) return null;
              return (
                <TooltipShell
                  label={item.name}
                  rows={[{ name: seriesName, value: `${localizeNumber(locale, item.sessions)} · ${item.percent}%`, color: CHART.teal }]}
                />
              );
            }}
          />
          <Bar dataKey="sessions" name={seriesName} fill={CHART.teal} radius={[2, 7, 7, 2]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <thead><tr><th>{seriesName}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}: {r.sessions} ({r.percent}%)</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function UserSessionsAreaChart({
  data,
  locale,
  granularity,
  seriesName,
}: {
  data: ReadingActivitySeriesPoint[];
  locale: Locale;
  granularity: "day" | "month";
  seriesName: string;
}) {
  const rows = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        tick: formatBucketLabel(locale, d.bucket, granularity),
        label: formatBucketLabel(locale, d.bucket, granularity),
      })),
    [data, locale, granularity],
  );
  const gradientId = "userSessionsArea";
  return (
    <div className="chart-frame" style={{ height: 150 }} role="img" aria-label={seriesName}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.blue} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART.blue} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 4" />
          <XAxis dataKey="tick" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={30} />
          <Tooltip
            cursor={{ stroke: CHART.teal, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !item) return null;
              return <TooltipShell label={item.label} rows={[{ name: seriesName, value: localizeNumber(locale, item.sessions), color: CHART.blue }]} />;
            }}
          />
          <Area
            type="monotone"
            dataKey="sessions"
            name={seriesName}
            stroke={CHART.blue}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <thead><tr><th>{seriesName}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.bucket}><td>{r.label}: {r.sessions}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Personal reading-duration chart: daily AreaChart (7d/30d) or monthly BarChart (6m). */
export function MyReadingDurationChart({
  data,
  locale,
  granularity,
  seriesName,
  sessionsName,
  formatDuration,
  formatAxis,
}: {
  data: MyReadingStatsPoint[];
  locale: Locale;
  granularity: "day" | "month";
  seriesName: string;
  sessionsName: string;
  formatDuration: (seconds: number) => string;
  formatAxis: (seconds: number) => string;
}) {
  const rows = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        tick:
          granularity === "month"
            ? formatBucketLabel(locale, d.bucket, "month")
            : data.length <= 8
              ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { weekday: "short", day: "numeric" }).format(
                  new Date(`${d.bucket}T00:00:00Z`),
                )
              : formatCompactDay(locale, d.bucket),
        label:
          granularity === "month"
            ? formatBucketLabel(locale, d.bucket, "month")
            : formatFullDay(locale, d.bucket),
      })),
    [data, locale, granularity],
  );
  const gradientId = "myReadingDurationArea";
  const tooltip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: (typeof rows)[number] }> }) => {
    const item = payload?.[0]?.payload;
    if (!active || !item) return null;
    return (
      <TooltipShell
        label={item.label}
        rows={[
          { name: seriesName, value: formatDuration(item.read_seconds), color: CHART.blue },
          { name: sessionsName, value: localizeNumber(locale, item.sessions), color: CHART.sky },
        ]}
      />
    );
  };
  const xAxis = (
    <XAxis dataKey="tick" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={granularity === "month" ? 8 : 26} />
  );
  const yAxis = (
    <YAxis
      allowDecimals={false}
      tick={axisTick}
      tickLine={false}
      axisLine={false}
      width={44}
      tickFormatter={(value) => formatAxis(Number(value))}
    />
  );
  return (
    <div className="chart-frame" style={{ height: 230 }} role="img" aria-label={seriesName}>
      <ResponsiveContainer width="100%" height="100%">
        {granularity === "month" ? (
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 4" />
            {xAxis}
            {yAxis}
            <Tooltip cursor={{ fill: "rgba(52, 120, 201, 0.10)" }} content={tooltip} />
            <Bar dataKey="read_seconds" name={seriesName} fill={CHART.blue} radius={[7, 7, 2, 2]} maxBarSize={56} isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.blue} stopOpacity={0.34} />
                <stop offset="100%" stopColor={CHART.blue} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 4" />
            {xAxis}
            {yAxis}
            <Tooltip cursor={{ stroke: CHART.teal, strokeDasharray: "3 3" }} content={tooltip} />
            <Area
              type="monotone"
              dataKey="read_seconds"
              name={seriesName}
              stroke={CHART.blue}
              strokeWidth={2.4}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 5, fill: CHART.sky, stroke: CHART.blue, strokeWidth: 1.6 }}
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
      <table className="sr-only">
        <thead><tr><th>{seriesName}</th><th>{sessionsName}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bucket}>
              <td>{r.label}: {formatDuration(r.read_seconds)}</td>
              <td>{r.sessions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type DonutEntry = { name: string; value: number };

export function DownloadDistributionDonut({
  entries,
  locale,
  totalLabel,
}: {
  entries: DonutEntry[];
  locale: Locale;
  totalLabel: string;
}) {
  const rows = useMemo(() => entries.filter((entry) => entry.value > 0).slice(0, 6), [entries]);
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows]);
  if (rows.length === 0 || total === 0) return null;
  return (
    <div>
      <div className="chart-frame" style={{ height: 172 }} role="img" aria-label={totalLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={74}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {rows.map((row, index) => (
                <Cell key={`${row.name}-${index}`} fill={CHART.sequential[index % CHART.sequential.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const item = payload?.[0];
                if (!active || !item) return null;
                const value = Number(item.value ?? 0);
                const share = total ? Math.round((value / total) * 100) : 0;
                return (
                  <TooltipShell
                    label={String(item.name ?? "")}
                    rows={[{ name: totalLabel, value: `${localizeNumber(locale, value)} · ${share}%`, color: CHART.blue }]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{localizeNumber(locale, total)}</p>
          <p className="text-[10px] uppercase tracking-[.14em] text-slate-500 dark:text-slate-400">{totalLabel}</p>
        </div>
      </div>
      <ul className="chart-legend mt-3 justify-center">
        {rows.map((row, index) => (
          <li key={`${row.name}-${index}`}>
            <span>
              <i aria-hidden="true" style={{ background: CHART.sequential[index % CHART.sequential.length] }} />
              <span className="max-w-[11rem] truncate">{row.name}</span>
              <strong className="tabular-nums text-[color:var(--text-muted)]">{localizeNumber(locale, row.value)}</strong>
            </span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <thead><tr><th>{totalLabel}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}: {r.value}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
