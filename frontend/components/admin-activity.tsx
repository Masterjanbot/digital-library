"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen, CalendarDays, Clock3, FolderOpen, MoonStar, Minus, Sunrise, Sun, Sunset,
  Timer, TrendingDown, TrendingUp, UserCheck, UserMinus, UserPlus, Users, type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api";
import {
  ReadingActivityComboChart,
  CategorySessionsBarChart,
  UserSessionsAreaChart,
} from "@/components/analytics-charts";
import { AnalyticsChartCard } from "@/components/chart-card";
import { SectionHeader } from "@/components/section-header";
import { DashboardStatsCard } from "@/components/stats-card";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/empty-state";
import type { ReadingActivityOverview, ReadingUserDetail } from "@/lib/types";

type Period = "7d" | "30d" | "6m";
const PERIODS: Period[] = ["7d", "30d", "6m"];
const PERIOD_KEY = { "7d": "period7d", "30d": "period30d", "6m": "period6m" } as const;
const PEAK_KEY = { night: "peakNight", morning: "peakMorning", afternoon: "peakAfternoon", evening: "peakEvening" } as const;

const WEEKDAY_REF = Date.UTC(2024, 0, 1); // Monday
const DAY_MS = 24 * 60 * 60 * 1000;

export function AdminActivitySection() {
  const t = useTranslations("userActivity");
  const locale = useLocale();
  const intlLocale = locale === "fa" ? "fa-IR" : "en-US";
  const [period, setPeriod] = useState<Period>("30d");
  const [chosenUserId, setChosenUserId] = useState<number | null>(null);

  const overview = useQuery({
    queryKey: ["admin-reading-analytics", period],
    queryFn: async () =>
      (await api.get<ReadingActivityOverview>("/admin/analytics/overview/", { params: { period } })).data,
    staleTime: 60_000,
  });

  // Effective selection: the user's choice when it is in the current period's
  // leaderboard, otherwise the leading reader. No effect needed.
  const topReaderIds = overview.data?.top_readers.map((reader) => reader.id) ?? [];
  const selectedUserId = chosenUserId != null && topReaderIds.includes(chosenUserId)
    ? chosenUserId
    : topReaderIds[0] ?? null;

  const userDetail = useQuery({
    queryKey: ["admin-reading-analytics-user", selectedUserId, period],
    queryFn: async () =>
      (await api.get<ReadingUserDetail>(`/admin/analytics/users/${selectedUserId}/`, { params: { period } })).data,
    enabled: selectedUserId != null,
    staleTime: 60_000,
  });

  const data = overview.data;
  const formatNumber = (value: number) => value.toLocaleString(intlLocale);
  const formatDuration = (seconds: number) => {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${formatNumber(hours)}${t("hoursShort")} ${formatNumber(minutes)}${t("minutesShort")}`;
    return `${formatNumber(minutes)}${t("minutesShort")}`;
  };
  const formatDay = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "—";
  const weekdayName = (isoWeekday: number) =>
    new Intl.DateTimeFormat(intlLocale, { weekday: "long" }).format(new Date(WEEKDAY_REF + (isoWeekday - 1) * DAY_MS));
  const peakIcon = (peak: NonNullable<typeof data>["insights"]["peak_period"]): LucideIcon => {
    switch (peak) {
      case "night": return MoonStar;
      case "morning": return Sunrise;
      case "afternoon": return Sun;
      case "evening": return Sunset;
      default: return Sun;
    }
  };

  const insights = data?.insights;
  const hasSessions = (data?.totals.sessions ?? 0) > 0;
  const maxCategorySessions = Math.max(1, ...(data?.top_categories.map((row) => row.sessions) ?? [1]));

  return (
    <section aria-label={t("sectionTitle")} className="mt-8">
      {/* Section header + period selector */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">{t("sectionTitle")}</h2>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={t("sectionTitle")}>
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              className="period-pill"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {t(PERIOD_KEY[value])}
            </button>
          ))}
        </div>
      </div>

      {overview.isError && (
        <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {t("loadError")}
        </p>
      )}

      {overview.isLoading || !data ? (
        <div className="mt-4"><LoadingSkeleton variant="cards" rows={4} /></div>
      ) : (
        <>
          {/* KPI row — compact summary of real tracked reading behavior */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <DashboardStatsCard label={t("activeReaders")} value={data.totals.active_readers} icon={Users} accent="clay" />
            <DashboardStatsCard label={t("readingSessions")} value={data.totals.sessions} icon={BookOpen} accent="forest" />
            <DashboardStatsCard label={t("readingTime")} value={formatDuration(data.totals.read_seconds)} icon={Clock3} accent="sage" hint={t("readingTimeHint")} />
            <DashboardStatsCard label={t("avgSession")} value={formatDuration(data.totals.avg_session_seconds)} icon={Timer} accent="gold" hint={t("avgSessionHint")} />
          </div>

          {/* Insights — only reliably calculable signals */}
          {hasSessions && insights && (
            <div className="mt-4 flex flex-wrap items-stretch gap-2">
              {insights.most_active_weekday != null && (
                <div className="insight-chip">
                  <span className="insight-chip-icon"><CalendarDays size={15} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("insightMostActiveDay")}</span>
                    <strong className="block truncate text-sm capitalize">{weekdayName(insights.most_active_weekday)}</strong>
                  </span>
                </div>
              )}
              {insights.peak_period && (
                <div className="insight-chip">
                  <span className="insight-chip-icon">{(() => { const Icon = peakIcon(insights.peak_period); return <Icon size={15} aria-hidden="true" />; })()}</span>
                  <span className="min-w-0">
                    <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("insightPeakPeriod")}</span>
                    <strong className="block truncate text-sm">{t(PEAK_KEY[insights.peak_period])}</strong>
                  </span>
                </div>
              )}
              {insights.most_popular_category && (
                <div className="insight-chip">
                  <span className="insight-chip-icon"><FolderOpen size={15} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("insightPopularCategory")}</span>
                    <strong className="block truncate text-sm">{insights.most_popular_category}</strong>
                  </span>
                </div>
              )}
              <div className="insight-chip">
                <span className="insight-chip-icon"><UserCheck size={15} aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("insightReturningReaders")}</span>
                  <strong className="block text-sm tabular-nums">{formatNumber(data.totals.returning_readers)}</strong>
                </span>
              </div>
              <div className="insight-chip">
                <span className="insight-chip-icon"><UserPlus size={15} aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("insightNewReaders")}</span>
                  <strong className="block text-sm tabular-nums">{formatNumber(data.totals.new_readers)}</strong>
                </span>
              </div>
              {data.totals.declining_readers > 0 && (
                <div className="insight-chip">
                  <span className="insight-chip-icon"><UserMinus size={15} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("insightDecliningReaders")}</span>
                    <strong className="block text-sm tabular-nums">{formatNumber(data.totals.declining_readers)}</strong>
                  </span>
                </div>
              )}
              {insights.overall_trend && (
                <div className="insight-chip">
                  <span className="insight-chip-icon">
                    {insights.overall_trend === "up" ? <TrendingUp size={15} aria-hidden="true" /> : insights.overall_trend === "down" ? <TrendingDown size={15} aria-hidden="true" /> : <Minus size={15} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("insightTrend")}</span>
                    <strong className="block text-sm">
                      {t(insights.overall_trend === "up" ? "trendUp" : insights.overall_trend === "down" ? "trendDown" : "trendFlat")}
                      {data.totals.engagement_trend_pct != null && (
                        <span className="ms-1.5 tabular-nums text-slate-500 dark:text-slate-400">
                          {data.totals.engagement_trend_pct > 0 ? "+" : ""}{data.totals.engagement_trend_pct}%
                        </span>
                      )}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Reading over time — line + area combination, single axis */}
          <AnalyticsChartCard
            className="mt-4"
            eyebrow={t("eyebrow")}
            title={t("activityOverTime")}
            isEmpty={!hasSessions}
            emptyMessage={t("noReadingActivity")}
          >
            <ReadingActivityComboChart
              data={data.series}
              locale={locale}
              granularity={data.granularity}
              seriesName={t("sessionsSeries")}
              readersSeriesName={t("readersSeries")}
              readingTimeName={t("readingTimeTooltip")}
            />
          </AnalyticsChartCard>

          <div className="mt-4 grid gap-4 xl:grid-cols-12">
            {/* Most popular categories */}
            <AnalyticsChartCard
              className="xl:col-span-5"
              eyebrow={t("catShare")}
              title={t("categoriesTitle")}
              isEmpty={data.top_categories.length === 0}
              emptyMessage={t("noReadingActivity")}
            >
              <CategorySessionsBarChart
                data={data.top_categories}
                locale={locale}
                seriesName={t("catSessions")}
                uncategorizedLabel={t("uncategorized")}
              />
              <ul className="mt-4 space-y-2.5">
                {data.top_categories.map((row) => (
                  <li key={row.category ?? "__uncategorized__"}>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-ink">{row.category ?? t("uncategorized")}</span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                        {formatNumber(row.sessions)} · {row.percent}% · {formatNumber(row.active_readers)} {t("catReaders").toLowerCase()}
                      </span>
                    </div>
                    <div className="bar-track mt-1.5" aria-hidden="true">
                      <div className="bar-fill bar-fill-teal" style={{ width: `${Math.round((row.sessions / maxCategorySessions) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </AnalyticsChartCard>

            {/* Most active readers — ranked engagement */}
            <AnalyticsChartCard className="xl:col-span-7" eyebrow={t("eyebrow")} title={t("topReaders")} isEmpty={data.top_readers.length === 0} emptyMessage={t("noReadingActivity")}>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-start text-[11px] uppercase tracking-[.12em] text-slate-500 dark:text-slate-400">
                      <th scope="col" className="px-2 py-2 text-start font-semibold">{t("rank")}</th>
                      <th scope="col" className="px-2 py-2 text-start font-semibold">{t("reader")}</th>
                      <th scope="col" className="px-2 py-2 text-end font-semibold">{t("colSessions")}</th>
                      <th scope="col" className="px-2 py-2 text-end font-semibold">{t("colBooks")}</th>
                      <th scope="col" className="px-2 py-2 text-end font-semibold">{t("colReadTime")}</th>
                      <th scope="col" className="px-2 py-2 text-end font-semibold">{t("colLastActivity")}</th>
                      <th scope="col" className="px-2 py-2 text-end font-semibold">{t("colEngagement")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.top_readers.map((reader, index) => (
                      <tr key={reader.id} className="align-middle">
                        <td className="px-2 py-2.5 tabular-nums text-slate-400">{index + 1}</td>
                        <td className="px-2 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <span className="activity-leader-avatar" aria-hidden="true">
                              {(reader.full_name || reader.username).trim().charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink">{reader.full_name}</span>
                              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">@{reader.username}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-end tabular-nums font-semibold text-ink">{formatNumber(reader.sessions)}</td>
                        <td className="px-2 py-2.5 text-end tabular-nums text-slate-600 dark:text-slate-300">{formatNumber(reader.books)}</td>
                        <td className="px-2 py-2.5 text-end tabular-nums text-slate-600 dark:text-slate-300">{formatDuration(reader.read_seconds)}</td>
                        <td className="px-2 py-2.5 text-end text-[11px] text-slate-500 dark:text-slate-400">{formatDay(reader.last_activity)}</td>
                        <td className="px-2 py-2.5 text-end">
                          <span className={`engagement-badge ${reader.engagement === "high" ? "engagement-high" : reader.engagement === "medium" ? "engagement-mid" : "engagement-low"}`}>
                            {t(reader.engagement === "high" ? "engagementHigh" : reader.engagement === "medium" ? "engagementMedium" : "engagementLow")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-400">{t("topReadersNote")}</p>
            </AnalyticsChartCard>
          </div>

          {/* Individual reader drill-down */}
          <section className="dashboard-panel mt-4" aria-label={t("userActivityTitle")}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeader eyebrow={t("eyebrow")} title={t("userActivityTitle")} />
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-500 dark:text-slate-400">
                {t("selectUser")}
                <select
                  className="form-control !w-auto min-w-[180px] text-sm normal-case tracking-normal"
                  value={selectedUserId ?? ""}
                  onChange={(event) => setChosenUserId(Number(event.target.value))}
                >
                  {data.top_readers.map((reader) => (
                    <option key={reader.id} value={reader.id}>
                      {reader.full_name} (@{reader.username})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {userDetail.isLoading ? (
              <div className="mt-4"><LoadingSkeleton variant="cards" rows={2} /></div>
            ) : userDetail.data ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-3">
                      <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("readingSessions")}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatNumber(userDetail.data.totals.sessions)}</p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-3">
                      <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("booksOpened")}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatNumber(userDetail.data.totals.books_opened)}</p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-3">
                      <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("readingTime")}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatDuration(userDetail.data.totals.read_seconds)}</p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-3">
                      <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("daysActive")}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatNumber(userDetail.data.totals.days_active)}</p>
                    </div>
                  </div>
                  {userDetail.data.top_categories.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-500 dark:text-slate-400">{t("mostReadCategory")}</p>
                      <ul className="mt-1.5 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                        {userDetail.data.top_categories.map((row) => (
                          <li key={row.category ?? "__uncategorized__"} className="flex items-baseline justify-between gap-2">
                            <span className="truncate">{row.category ?? t("uncategorized")}</span>
                            <span className="shrink-0 tabular-nums text-slate-400">{row.percent}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {userDetail.data.recent_sessions.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-500 dark:text-slate-400">{t("recentSessions")}</p>
                      <ul className="mt-1.5 divide-y divide-slate-100 dark:divide-slate-800">
                        {userDetail.data.recent_sessions.slice(0, 5).map((sessionRow) => (
                          <li key={sessionRow.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                            <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{sessionRow.book_title}</span>
                            <span className="shrink-0 tabular-nums text-slate-400">
                              {formatDay(sessionRow.started_at)} · {formatDuration(sessionRow.duration_seconds)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="lg:col-span-8">
                  {userDetail.data.totals.sessions > 0 ? (
                    <UserSessionsAreaChart
                      data={userDetail.data.series}
                      locale={locale}
                      granularity={userDetail.data.granularity}
                      seriesName={t("sessionsSeries")}
                    />
                  ) : (
                    <EmptyState description={t("noUserActivity")} />
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{t("insightTrend")}: <strong className="text-ink">{userDetail.data.totals.engagement_trend_pct != null ? `${userDetail.data.totals.engagement_trend_pct > 0 ? "+" : ""}${userDetail.data.totals.engagement_trend_pct}%` : "—"}</strong></span>
                    <span aria-hidden="true">·</span>
                    <span>{t("avgSession")}: <strong className="text-ink">{formatDuration(userDetail.data.totals.avg_session_seconds)}</strong></span>
                    {userDetail.data.totals.last_activity && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{t("colLastActivity")}: <strong className="text-ink">{formatDay(userDetail.data.totals.last_activity)}</strong></span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}
