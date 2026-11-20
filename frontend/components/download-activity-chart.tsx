"use client";

import { useTranslations } from "next-intl";
import { DailyDownloadsLineChart } from "@/components/analytics-charts";

export type DayCount = { day: string; count: number };

/**
 * Downloads per day over the last 30 days — Recharts line chart.
 * Single series → no legend; identity comes from the surrounding heading.
 */
export function DownloadActivityChart({ data, locale }: { data: DayCount[]; locale: string }) {
  const t = useTranslations("downloadStats");
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <figure aria-label={t("chartAriaLabel")}>
      <figcaption className="text-sm text-slate-500 dark:text-slate-400">
        {t("chartCaption", { total })}
      </figcaption>
      <div className="mt-3">
        <DailyDownloadsLineChart data={data} locale={locale} seriesName={t("chartAriaLabel")} />
      </div>
    </figure>
  );
}
