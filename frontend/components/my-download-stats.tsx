"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarClock, Download, History, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api";
import type { MyDownloadStats } from "@/lib/types";
import { SectionHeader } from "@/components/section-header";
import { DashboardStatsCard } from "@/components/stats-card";
import { AnalyticsChartCard } from "@/components/chart-card";
import { Link } from "@/i18n/routing";
import { ArrowUpRight } from "lucide-react";
import {
  DailyDownloadsLineChart,
  MonthlyDownloadsBarChart,
  DownloadDistributionDonut,
} from "@/components/analytics-charts";
import { RefreshCw } from "lucide-react";

const SIX = 6;

export function MyDownloadStatsPanel() {
  const t = useTranslations("downloadStats");
  const locale = useLocale();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-download-stats"],
    queryFn: async () => (await api.get<MyDownloadStats>("/me/download-stats/")).data,
  });

  const last30Total = data ? data.downloads_by_day.reduce((sum, day) => sum + day.count, 0) : 0;
  const last7Total = data ? data.downloads_by_day.slice(-7).reduce((sum, day) => sum + day.count, 0) : 0;

  // Personal download distribution — only when meaningful (some downloads exist).
  const donutEntries = data
    ? [...new Map(data.recent.map((item) => [item.book, item] as const)).values()]
        .map((item) => ({ name: item.book_title, value: item.times_downloaded ?? 1 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, SIX)
    : [];
  const showDonut = donutEntries.length > 0 && donutEntries.some((entry) => entry.value > 0);

  return (
    <section className="mt-7" aria-label={t("myTitle")}>
      <SectionHeader
        eyebrow={t("myEyebrow")}
        title={t("myTitle")}
        action={
          <Link href="/my-downloads" className="inline-flex items-center gap-1 text-sm font-semibold text-brand transition hover:text-brand-dark">
            {t("viewHistory")}<ArrowUpRight size={15} />
          </Link>
        }
      />

      {isError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{t("loadError")}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardStatsCard label={t("myTotalEvents")} value={data?.total_events ?? 0} icon={Download} accent="forest" />
        <DashboardStatsCard label={t("myUniqueBooks")} value={data?.unique_books ?? 0} icon={BookOpen} accent="sage" />
        <DashboardStatsCard label={t("downloadsLast7")} value={last7Total} icon={History} accent="gold" />
        <DashboardStatsCard label={t("downloadsLast30")} value={last30Total} icon={TrendingUp} accent="clay" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <AnalyticsChartCard
          className={showDonut ? "xl:col-span-7" : "xl:col-span-12"}
          eyebrow={t("activity")}
          title={t("last30Days")}
          isLoading={isLoading}
          isEmpty={Boolean(data) && last30Total === 0}
          emptyMessage={t("myNoDownloads")}
          aside={<CalendarClock size={17} className="text-sage" aria-hidden="true" />}
        >
          {data && <DailyDownloadsLineChart data={data.downloads_by_day} locale={locale} seriesName={t("chartAriaLabel")} />}
        </AnalyticsChartCard>

        {showDonut && (
          <AnalyticsChartCard
            className="xl:col-span-5"
            eyebrow={t("distribution")}
            title={t("distributionTitle")}
            isLoading={isLoading}
          >
            <DownloadDistributionDonut entries={donutEntries} locale={locale} totalLabel={t("myTotalEvents")} />
          </AnalyticsChartCard>
        )}
      </div>

      {/* Monthly rollup — rendered only when there is data to aggregate */}
      {(isLoading || last30Total > 0) && (
        <div className="mt-4">
          <AnalyticsChartCard
            eyebrow={t("activity")}
            title={t("monthlyDownloads")}
            isLoading={isLoading}
            aside={<RefreshCw size={15} className="text-sage" aria-hidden="true" />}
          >
            {data && (
              <>
                <MonthlyDownloadsBarChart data={data.downloads_by_day} locale={locale} seriesName={t("monthlyDownloads")} />
                <p className="mt-2 text-[11px] text-slate-400">{t("monthlyNote")}</p>
              </>
            )}
          </AnalyticsChartCard>
        </div>
      )}
    </section>
  );
}
