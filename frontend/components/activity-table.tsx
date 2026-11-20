"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import type { BookDownloadStat, RecentDownloadActivity } from "@/lib/types";

const PAGE_SIZE = 5;

/**
 * Admin activity table: who downloaded what, when, and the book's total
 * download events. Authors and per-book event counts are enriched from the
 * already-fetched books statistics (matched by book id — no N+1).
 */
export function ActivityTable({
  events,
  bookStats,
}: {
  events: RecentDownloadActivity[];
  bookStats: BookDownloadStat[];
}) {
  const t = useTranslations("downloadStats");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const metaByBook = useMemo(() => {
    const map = new Map<number, { authors: string[]; downloads: number }>();
    for (const book of bookStats) map.set(book.id, { authors: book.authors, downloads: book.downloads });
    return map;
  }, [bookStats]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) => {
      const meta = metaByBook.get(event.book_id);
      const haystack = [event.username, event.book_title, ...(meta?.authors ?? [])].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [events, query, metaByBook]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const dateFormatter = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const formatNumber = (value: number) => value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder={t("filterActivity")}
            aria-label={t("filterActivity")}
            className="form-control !pl-10"
          />
        </label>
        <Link href="/admin/downloads" className="text-sm font-semibold text-brand transition hover:text-brand-dark">
          {t("viewFullStats")}
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-panel mt-4">
          <Users size={26} className="mx-auto mb-2 text-sage" strokeWidth={1.6} />
          {t("noActivity")}
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col">{t("colUser")}</th>
                  <th scope="col">{t("colBook")}</th>
                  <th scope="col">{t("colDownloadDate")}</th>
                  <th scope="col" className="text-end">{t("colEvents")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((event) => {
                  const meta = metaByBook.get(event.book_id);
                  return (
                    <tr key={event.id}>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-[.7rem] font-bold uppercase text-brand-dark dark:bg-slate-700 dark:text-emerald-100">
                            {event.username.slice(0, 2)}
                          </span>
                          <span className="font-medium text-ink">@{event.username}</span>
                        </span>
                      </td>
                      <td>
                        <Link href={`/books/${event.book_id}`} className="font-medium text-ink transition hover:text-brand">
                          {event.book_title}
                        </Link>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                          {meta?.authors.length ? meta.authors.join(", ") : t("authorNotTracked")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-slate-600 dark:text-slate-300">{dateFormatter.format(new Date(event.downloaded_at))}</td>
                      <td className="text-end">
                        {meta ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold tabular-nums text-brand-dark dark:bg-slate-700 dark:text-emerald-100">
                            <Download size={12} />{formatNumber(meta.downloads)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("page")} {currentPage} / {totalPages}</p>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg border border-[var(--border)] p-2 text-slate-500 transition enabled:hover:bg-slate-50 disabled:opacity-40 dark:enabled:hover:bg-slate-800" disabled={currentPage <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))} aria-label={t("previous")}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" className="rounded-lg border border-[var(--border)] p-2 text-slate-500 transition enabled:hover:bg-slate-50 disabled:opacity-40 dark:enabled:hover:bg-slate-800" disabled={currentPage >= totalPages} onClick={() => setPage((v) => Math.min(totalPages, v + 1))} aria-label={t("next")}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
