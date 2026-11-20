"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Book, Paginated } from "@/lib/types";
import { Field } from "@/components/ui/field";
import { BookCard } from "@/components/book-card";
import { Button } from "@/components/ui/button";

export function BookCatalog({ limit, ordering: initialOrdering = "-created_at", featured = false, premiumOnly = false }: { limit?: number; ordering?: string; featured?: boolean; premiumOnly?: boolean }) {
  const t = useTranslations("catalog");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [ordering, setOrdering] = useState(initialOrdering);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["books", search, category, ordering, page, limit, featured, premiumOnly],
    queryFn: async () => (await api.get<Paginated<Book>>("/books/", {
      params: {
        search,
        category: category || undefined,
        is_featured: featured ? true : undefined,
        is_premium: premiumOnly ? true : undefined,
        ordering,
        page,
        page_size: limit || 20,
      },
    })).data,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<Paginated<{ id: number; name: string }>>("/categories/", { params: { page_size: 100 } })).data.results,
    enabled: !limit,
  });
  const pageSize = limit || 20;
  const pageCount = Math.max(1, Math.ceil((data?.count || 0) / pageSize));

  return (
    <section>
      {!limit && <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow">{premiumOnly ? t("premiumEyebrow") : "PAPERTRAIL LIBRARY"}</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{premiumOnly ? t("premiumTitle") : t("title")}</h1></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="relative block sm:col-span-3"><Search className="absolute start-3 top-3.5 text-slate-400" size={17} /><Field value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("search")} className="ps-10" /></label>
          <select aria-label={t("category")} value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">{t("category")}</option>{categories?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select aria-label={t("sort")} value={ordering} onChange={(event) => { setOrdering(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="-created_at">{t("newest")}</option><option value="title">{t("titleSort")}</option></select>
        </div>
      </div>}
      {isLoading && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: pageSize }, (_, index) => <div key={index} className="loading-skeleton aspect-[3/4] min-h-72" />)}</div>}
      {isError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{t("error")}</p>}
      {!isLoading && !isError && !data?.results.length && <div className="rounded-2xl border border-dashed p-12 text-center text-slate-500">{t("empty")}</div>}
      {!!data?.results.length && <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 ${limit === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>{data.results.slice(0, limit).map((book) => <BookCard key={book.id} book={book} />)}</div>}
      {!limit && !!data?.count && <div className="mt-7 flex items-center justify-between">
        <span className="text-sm text-slate-500">{data.count} books · {t("page")} {page} / {pageCount}</span>
        <div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="secondary" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
      </div>}
    </section>
  );
}
