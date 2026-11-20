"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { BookOpen, Download, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useSession } from "@/hooks/use-session";
import type { Paginated } from "@/lib/types";

const PAGE_SIZE = 10;

type DownloadItem = {
  id: number;
  book: number;
  book_title: string;
  book_author: string[];
  is_premium: boolean;
  book_type: string;
  cover_url: string | null;
  downloaded_at: string;
  times_downloaded?: number;
};

export function MyDownloads() {
  const t = useTranslations("workspace");
  const common = useTranslations("common");
  const nav = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const { authenticated } = useSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    if (!authenticated) router.replace("/login");
  }, [authenticated, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["downloads", search, filterType, page],
    queryFn: async () => {
      const params: Record<string, string | undefined> = {
        page_size: String(PAGE_SIZE),
        page: String(page),
      };
      if (search.trim()) params.search = search.trim();
      if (filterType === "Premium") params.is_premium = "true";
      else if (filterType === "Free") params.is_premium = "false";
      return (await api.get<Paginated<DownloadItem>>("/downloads/", { params })).data;
    },
    enabled: authenticated,
  });

  const totalPages = Math.max(1, Math.ceil((data?.count || 0) / PAGE_SIZE));
  const Arrow = locale === "en" ? "←" : "→";

  async function handleDownload(bookId: number) {
    try {
      const resp = await api.post(`/books/${bookId}/download/`, {}, { responseType: "blob" as const });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `book-${bookId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Error handled by toast or silent - user can retry from page
    }
  }

  if (!authenticated) return null;
  if (isLoading) return <div className="p-16 text-center text-slate-500">{common("loading")}</div>;
  if (isError) return <p role="alert" className="mx-auto max-w-xl p-16 text-center text-red-700">Could not load your downloads.</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">{nav("myDownloads")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("intro")}</p>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Field
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("search")}
            className="pl-10"
          />
        </label>
        <select
          aria-label={t("filterStatus")}
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">{t("allStatuses")}</option>
          <option value="Free">{t("free")}</option>
          <option value="Premium">{t("premium")}</option>
        </select>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">
              <div className="loading-skeleton h-16 w-12 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="loading-skeleton h-4 w-3/4" />
                <div className="loading-skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && !data?.results.length && (
        <div className="mt-8 rounded-2xl border border-dashed p-12 text-center text-slate-500">
          <BookOpen size={32} className="mx-auto mb-3 text-brand/50" />
          <p>{t("emptyBooks")}</p>
        </div>
      )}

      {/* Results */}
      {!!data?.results.length && (
        <ul className="mt-6 divide-y divide-slate-100">
          {data.results.map((item) => (
            <li key={item.id} className="py-4">
              <div className="flex items-start gap-4">
                <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {item.cover_url ? (
                    <Image src={item.cover_url} alt="" fill sizes="48px" unoptimized className="object-cover" />
                  ) : (
                    <BookOpen size={24} className="absolute inset-0 m-auto text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{item.book_title}</p>
                    {(item.times_downloaded ?? 1) > 1 && (
                      <span className="shrink-0 rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark dark:text-emerald-100">
                        ×{item.times_downloaded}
                      </span>
                    )}
                    {item.is_premium && (
                      <span className="shrink-0 rounded-full bg-gold-light px-2 py-0.5 text-xs font-medium text-gold-dark">
                        {item.book_type}
                      </span>
                    )}
                    {!item.is_premium && (
                      <span className="shrink-0 rounded-full bg-sage-light px-2 py-0.5 text-xs font-medium text-sage-dark">
                        {item.book_type}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {item.book_author.join(", ") || t("unknownAuthor")}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(item.downloaded_at).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US")}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => handleDownload(item.book)}
                  disabled={isLoading}
                >
                  <Download size={14} />
                  {t("download")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {!!data?.count && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">
            {data.count} · {t("page")} {page} / {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              {Arrow} {t("previous")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((v) => v + 1)}
            >
              {t("next")} {Arrow}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
