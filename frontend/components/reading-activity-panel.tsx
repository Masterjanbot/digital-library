"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight, BookOpen, BookOpenCheck, CalendarDays, CheckCircle2, Clock3, FolderOpen,
  History, Minus, TrendingDown, TrendingUp, Timer, type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { MyReadingDurationChart } from "@/components/analytics-charts";
import { AnalyticsChartCard } from "@/components/chart-card";
import { DashboardStatsCard } from "@/components/stats-card";
import { SectionHeader } from "@/components/section-header";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { MyReadingStats } from "@/lib/types";

type Period = "7d" | "30d" | "6m";
const PERIODS: Period[] = ["7d", "30d", "6m"];
const PERIOD_KEY = { "7d": "daily", "30d": "monthly", "6m": "sixMonths" } as const;
const TREND_KEY = { up: "trendUp", down: "trendDown", flat: "trendFlat" } as const;

const WEEKDAY_REF = Date.UTC(2024, 0, 1); // 2024-01-01 was a Monday
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Personal reading activity for the authenticated user.
 *
 * Every figure comes from the user's own validated ReadingSession /
 * ReadingProgress records via /api/reading/stats/ — downloads never count,
 * and no user_id is ever sent from the client.
 */
export function ReadingActivityPanel() {
  const t = useTranslations("readingDash");
  const locale = useLocale();
  const intlLocale = locale === "fa" ? "fa-IR" : "en-US";
  const [period, setPeriod] = useState<Period>("30d");

  const stats = useQuery({
    queryKey: ["my-reading-stats", period],
    queryFn: async () =>
      (await api.get<MyReadingStats>("/reading/stats/", { params: { period } })).data,
    staleTime: 60_000,
  });

  const data = stats.data;
  const formatNumber = (value: number) => value.toLocaleString(intlLocale);
  const formatDurationLong = (seconds: number) => {
    const totalMinutes = Math.floor(seconds / 60);
    if (totalMinutes < 1) return t("lessThanMinute");
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(t("durationHours", { count: hours }));
    if (minutes > 0) parts.push(t("durationMinutes", { count: minutes }));
    return parts.join(t("durationJoin"));
  };
  const formatAxisTick = (seconds: number) => {
    if (seconds >= 3600) {
      const hours = Math.round((seconds / 3600) * 10) / 10;
      return `${hours.toLocaleString(intlLocale)}${t("hoursShort")}`;
    }
    return `${Math.round(seconds / 60).toLocaleString(intlLocale)}${t("minutesShort")}`;
  };
  const formatDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso))
      : t("emptyValue");
  const weekdayName = (isoWeekday: number) =>
    new Intl.DateTimeFormat(intlLocale, { weekday: "long" }).format(new Date(WEEKDAY_REF + (isoWeekday - 1) * DAY_MS));

  const lifetime = data?.lifetime;
  const totals = data?.totals;
  const insights = data?.insights;
  const hasSessions = (lifetime?.sessions ?? 0) > 0;

  return (
    <section aria-label={t("sectionTitle")} className="mt-6">
      {/* Section header + period selector */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{t("sectionEyebrow")}</p>
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

      {stats.isError && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <span>{t("loadError")}</span>
          <button type="button" className="period-pill !border-amber-300 dark:!border-amber-800" onClick={() => stats.refetch()}>
            {t("retry")}
          </button>
        </div>
      )}

      {stats.isLoading ? (
        <div className="mt-4">
          <LoadingSkeleton variant="cards" rows={4} />
          <div className="mt-4"><LoadingSkeleton variant="chart" /></div>
        </div>
      ) : !data ? (
        // The error banner above already explains; don't leave a skeleton spinning forever.
        null
      ) : (
        <>
          {/* Lifetime KPI cards — real records, never downloads */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <DashboardStatsCard label={t("booksRead")} value={lifetime?.books_read ?? 0} icon={BookOpenCheck} accent="forest" hint={t("booksReadHint")} />
            <DashboardStatsCard label={t("readingTimeTotal")} value={formatDurationLong(lifetime?.read_seconds ?? 0)} icon={Clock3} accent="sage" hint={t("readingTimeHint")} />
            <DashboardStatsCard label={t("inProgressLifetime")} value={lifetime?.books_in_progress ?? 0} icon={BookOpen} accent="gold" hint={t("inProgressHint")} />
            <DashboardStatsCard label={t("activeDays")} value={lifetime?.days_active ?? 0} icon={CalendarDays} accent="clay" hint={t("activeDaysHint")} />
          </div>

          {/* Reading activity over time */}
          <AnalyticsChartCard
            className="mt-4"
            eyebrow={data.granularity === "month" ? t("granularityMonth") : t("granularityDay")}
            title={t("chartTitle")}
            isEmpty={(totals?.sessions ?? 0) === 0}
            emptyMessage={t("emptyChart")}
          >
            {/* Summary strip — same selected range as the chart */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-3">
                <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("summaryTotalTime")}</p>
                <p className="mt-1 text-base font-semibold leading-6 tabular-nums text-ink">{formatDurationLong(totals?.read_seconds ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-3">
                <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("summaryActiveDays")}</p>
                <p className="mt-1 text-base font-semibold leading-6 tabular-nums text-ink">{formatNumber(totals?.days_active ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-3">
                <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("summarySessions")}</p>
                <p className="mt-1 text-base font-semibold leading-6 tabular-nums text-ink">{formatNumber(totals?.sessions ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-3">
                <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{period === "6m" ? t("summaryAvgMonthly") : t("summaryAvgDaily")}</p>
                <p className="mt-1 text-base font-semibold leading-6 tabular-nums text-ink">
                  {formatDurationLong(period === "6m" ? (totals?.avg_monthly_seconds ?? 0) : (totals?.avg_daily_seconds ?? 0))}
                </p>
              </div>
            </div>
            <MyReadingDurationChart
              data={data.series}
              locale={locale}
              granularity={data.granularity}
              seriesName={t("summaryTotalTime")}
              sessionsName={t("summarySessions")}
              formatDuration={formatDurationLong}
              formatAxis={formatAxisTick}
            />
            <p className="mt-3 text-[11px] leading-5 text-slate-400">{t("chartSubtitle")}</p>
          </AnalyticsChartCard>

          {/* Your most read books — ranked by validated reading time */}
          <AnalyticsChartCard
            className="mt-4"
            title={t("mostReadTitle")}
            isEmpty={data.most_read.length === 0}
            emptyMessage={t("emptyMostRead")}
          >
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {data.most_read.map((book, index) => (
                <li key={book.id} className="cover-card group relative h-full flex-col !items-stretch gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rank-chip" aria-hidden="true">{index + 1}</span>
                    {book.completed && (
                      <span className="engagement-badge engagement-high"><CheckCircle2 size={11} aria-hidden="true" />{t("completedBadge")}</span>
                    )}
                  </div>
                  <Link href={`/reader/${book.id}`} className="flex flex-1 flex-col">
                    <span className="cover-frame mx-auto">
                      {book.cover_url ? (
                        <Image
                          src={book.cover_url}
                          alt=""
                          fill
                          sizes="80px"
                          unoptimized
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <BookOpen size={26} className="absolute inset-0 m-auto text-slate-400" strokeWidth={1.5} />
                      )}
                    </span>
                    <span className="mt-2 block truncate text-sm font-semibold leading-snug text-ink transition group-hover:text-brand">{book.title}</span>
                    {book.authors.length > 0 && (
                      <span className="mt-0.5 block truncate text-[.7rem] text-slate-500 dark:text-slate-400">{book.authors.join(", ")}</span>
                    )}
                  </Link>
                  <div className="mt-auto">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[.68rem] text-slate-500 dark:text-slate-400">
                      <span className="tabular-nums">{formatDurationLong(book.read_seconds)}</span>
                      <span className="tabular-nums">{t("metaSessions", { count: book.sessions })}</span>
                    </div>
                    {book.progress_percentage != null && (
                      <>
                        <div className="bar-track mt-1.5" aria-hidden="true">
                          <div className="bar-fill" style={{ width: `${Math.min(100, book.progress_percentage)}%` }} />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[.68rem] text-slate-500 dark:text-slate-400">
                          <span>{t("progress")}: <span className="tabular-nums">{Math.round(book.progress_percentage)}%</span></span>
                          <span>{t("lastRead")}: <span className="tabular-nums">{formatDate(book.last_read_at)}</span></span>
                        </div>
                      </>
                    )}
                    {book.progress_percentage == null && (
                      <p className="mt-1 text-[.68rem] text-slate-500 dark:text-slate-400">{t("lastRead")}: <span className="tabular-nums">{formatDate(book.last_read_at)}</span></p>
                    )}
                    {!book.completed && (
                      <Link href={`/reader/${book.id}`} className="mt-2 inline-flex items-center gap-1 text-[.72rem] font-semibold text-brand transition hover:text-brand-dark">
                        {t("continueReading")}<ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </AnalyticsChartCard>

          {/* Recent reading activity — the authenticated user's own sessions */}
          <AnalyticsChartCard
            className="mt-4"
            title={t("recentTitle")}
            isEmpty={data.recent.length === 0}
            emptyMessage={t("emptyRecent")}
          >
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recent.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <Link href={`/reader/${item.book}`} className="cover-frame !h-16 !w-11 !rounded-md" aria-hidden="true" tabIndex={-1}>
                    {item.cover_url ? (
                      <Image src={item.cover_url} alt="" fill sizes="44px" unoptimized className="object-cover" />
                    ) : (
                      <BookOpen size={18} className="absolute inset-0 m-auto text-slate-400" strokeWidth={1.5} />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/reader/${item.book}`} className="block truncate text-sm font-semibold text-ink transition hover:text-brand">
                      {item.book_title}
                    </Link>
                    {item.authors.length > 0 && (
                      <p className="mt-0.5 truncate text-[.7rem] text-slate-500 dark:text-slate-400">{item.authors.join(", ")}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[.68rem] text-slate-500 dark:text-slate-400">
                      <span className="tabular-nums">{formatDate(item.started_at)}</span>
                      {item.duration_seconds > 0 && <span className="tabular-nums">{formatDurationLong(item.duration_seconds)}</span>}
                      {item.progress_percentage != null && (
                        <span className="inline-flex min-w-[120px] items-center gap-2">
                          <span className="bar-track !h-1.5 w-16" aria-hidden="true">
                            <span className="bar-fill block" style={{ width: `${Math.min(100, item.progress_percentage)}%` }} />
                          </span>
                          <span className="tabular-nums">{Math.round(item.progress_percentage)}%</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <Link href={`/reader/${item.book}`} className="shrink-0 text-[.72rem] font-semibold text-brand transition hover:text-brand-dark" aria-label={t("continueReading")}>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </AnalyticsChartCard>

          {/* Your reading insights */}
          <section className="dashboard-panel mt-4" aria-label={t("insightsTitle")}>
            <SectionHeader title={t("insightsTitle")} />
            {!hasSessions || !insights ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("insightsEmpty")}</p>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {insights.most_frequent_book && (
                  <InsightChip icon={BookOpen} label={t("mostFrequentBook")} value={insights.most_frequent_book.title} />
                )}
                {insights.most_active_weekday != null && (
                  <InsightChip icon={CalendarDays} label={t("mostActiveDay")} value={weekdayName(insights.most_active_weekday)} />
                )}
                {insights.favorite_category && (
                  <InsightChip icon={FolderOpen} label={t("favoriteCategory")} value={insights.favorite_category} />
                )}
                <InsightChip icon={CheckCircle2} label={t("completedBooks")} value={formatNumber(insights.completed_books)} />
                <InsightChip icon={Timer} label={t("totalSessionsLifetime")} value={formatNumber(insights.total_sessions)} />
                <InsightChip
                  icon={CalendarDays}
                  label={t("consistency")}
                  value={`${formatNumber(insights.consistency_pct)}%`}
                  hint={t("consistencyHint")}
                />
                <InsightChip
                  icon={insights.trend === "up" ? TrendingUp : insights.trend === "down" ? TrendingDown : Minus}
                  label={t("trend")}
                  value={
                    insights.trend
                      ? `${t(TREND_KEY[insights.trend])}${
                          totals?.engagement_trend_pct != null
                            ? ` ${totals.engagement_trend_pct > 0 ? "+" : ""}${formatNumber(totals.engagement_trend_pct)}%`
                            : ""
                        }`
                      : t("trendUnavailable")
                  }
                />
              </div>
            )}
          </section>

          {/* Compact link to download history — downloads no longer dominate */}
          <Link
            href="/my-downloads"
            className="group mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3.5 transition hover:border-[color:var(--border-strong,#31466A)] hover:shadow-[var(--shadow-soft)]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="insight-chip-icon !h-9 !w-9"><History size={16} aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink transition group-hover:text-brand">{t("downloadHistory")}</span>
                <span className="block truncate text-[.7rem] text-slate-500 dark:text-slate-400">{t("downloadHistoryHint")}</span>
              </span>
            </span>
            <ArrowUpRight size={17} aria-hidden="true" className="shrink-0 text-slate-400 transition group-hover:text-brand" />
          </Link>
        </>
      )}
    </section>
  );
}

function InsightChip({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="insight-chip" title={hint}>
      <span className="insight-chip-icon"><Icon size={15} aria-hidden="true" /></span>
      <span className="min-w-0">
        <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{label}</span>
        <strong className="block truncate text-sm">{value}</strong>
      </span>
    </div>
  );
}
