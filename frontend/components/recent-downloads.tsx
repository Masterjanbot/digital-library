"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, CalendarDays, Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";
import type { Download as DownloadItem, Paginated } from "@/lib/types";
import { SectionHeader } from "@/components/section-header";
import { EmptyState } from "@/components/empty-state";
import { LoadingSkeleton } from "@/components/loading-skeleton";

/**
 * Recently downloaded books with covers — real data from the user's
 * download history (/downloads/, the same source as the downloads page).
 */
export function RecentDownloads({ limit = 4 }: { limit?: number }) {
  const t = useTranslations("downloadStats");
  const locale = useLocale();
  const dateFormatter = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["downloads", "recent", limit],
    queryFn: async () =>
      (await api.get<Paginated<DownloadItem>>("/downloads/", { params: { page_size: limit, ordering: "-downloaded_at" } })).data,
  });
  const items = data?.results ?? [];

  return (
    <section className="dashboard-panel mt-6" aria-label={t("recentDownloads")}>
      <SectionHeader
        eyebrow={t("myEyebrow")}
        title={t("recentDownloads")}
        action={
          <Link href="/my-downloads" className="inline-flex items-center gap-1 text-sm font-semibold text-brand transition hover:text-brand-dark">
            {t("viewHistory")}<ArrowUpRight size={15} />
          </Link>
        }
      />
      {isLoading && <div className="mt-4"><LoadingSkeleton variant="cards" rows={4} /></div>}
      {isError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{t("loadError")}</p>}
      {data && items.length === 0 && (
        <div className="mt-4">
          <EmptyState icon={BookOpen} description={t("myNoDownloads")} action={
            <Link href="/catalog" className="button-link">{t("exploreLibrary")}</Link>
          } />
        </div>
      )}
      {items.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/books/${item.book}`} className="cover-card group h-full">
                <span className="cover-frame">
                  {item.cover_url ? (
                    <Image src={item.cover_url} alt="" fill sizes="80px" unoptimized className="object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                  ) : (
                    <BookOpen size={26} className="absolute inset-0 m-auto text-slate-400" strokeWidth={1.5} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold leading-snug text-ink group-hover:text-brand">{item.book_title}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
                    {item.book_author.join(", ") || t("unknownAuthor")}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[.7rem] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{dateFormatter.format(new Date(item.downloaded_at))}</span>
                    <span className="inline-flex items-center gap-1"><Download size={12} />{t("timesDownloaded", { count: item.times_downloaded ?? 1 })}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
