"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, BookOpen, Download, Search, Users, X, ArrowUpDown, ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useRouter } from "@/i18n/routing";
import { Link } from "@/i18n/routing";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { DashboardNav } from "@/components/dashboard-nav";
import { DownloadActivityChart } from "@/components/download-activity-chart";
import { EmptyState } from "@/components/empty-state";
import { DashboardStatsCard } from "@/components/stats-card";
import { DashboardHeader } from "@/components/dashboard-header";
import type {
  AdminDownloadOverview,
  BookDownloadStat,
  Paginated,
  UserDownloadHistoryItem,
  UserDownloadStat,
} from "@/lib/types";

type Profile = { role: string; is_superuser: boolean };
type Tab = "overview" | "books" | "users";

const PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 5;

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function formatDate(value: string | null, locale: string, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function formatNumber(value: number, locale: string) {
  return value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
}

function Pagination({
  count,
  page,
  pageSize,
  onPage,
}: {
  count: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("downloadStats");
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (count <= pageSize) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
      <p className="text-sm text-slate-500">{count} · {t("page")} {page} / {totalPages}</p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t("previous")}
        </Button>
        <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

function BookTable({ rows, locale, showRank = true }: { rows: BookDownloadStat[]; locale: string; showRank?: boolean }) {
  const t = useTranslations("downloadStats");
  if (!rows.length) return <EmptyState icon={BookOpen} description={t("noBooks")} />;
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)]">
      <table className="data-table min-w-[720px]">
        <thead>
          <tr>
            {showRank && <th className="px-4 py-3 text-start">{t("colRank")}</th>}
            <th className="px-4 py-3 text-start">{t("colTitle")}</th>
            <th className="px-4 py-3 text-end">{t("colDownloads")}</th>
            <th className="px-4 py-3 text-end">{t("colUniqueUsers")}</th>
            <th className="px-4 py-3 text-start">{t("colLastDownload")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((book) => (
            <tr key={book.id} className="align-top">
              {showRank && (
                <td className="px-4 py-3">
                  <span className="rank-chip">{book.rank}</span>
                </td>
              )}
              <td className="px-4 py-3">
                <Link href={`/books/${book.id}`} className="font-medium hover:text-brand">
                  {book.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {book.authors.join(", ") || t("unknownAuthor")}
                  {book.category_name ? ` · ${book.category_name}` : ""}
                </p>
              </td>
              <td className="px-4 py-3 text-end font-semibold tabular-nums">{formatNumber(book.downloads, locale)}</td>
              <td className="px-4 py-3 text-end tabular-nums text-slate-600">{formatNumber(book.unique_users, locale)}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(book.last_download_at, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminDownloadStats() {
  const t = useTranslations("downloadStats");
  const common = useTranslations("common");
  const nav = useTranslations("nav");
  const adminT = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const { authenticated } = useSession();

  const [tab, setTab] = useState<Tab>("overview");
  const [bookSearch, setBookSearch] = useState("");
  const [bookOrdering, setBookOrdering] = useState("-downloads");
  const [bookPage, setBookPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [userOrdering, setUserOrdering] = useState("-last_download_at");
  const [userPage, setUserPage] = useState(1);
  const [historyUser, setHistoryUser] = useState<UserDownloadStat | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  const debouncedBookSearch = useDebounced(bookSearch.trim());
  const debouncedUserSearch = useDebounced(userSearch.trim());
  const debouncedHistorySearch = useDebounced(historySearch.trim());

  useEffect(() => {
    if (!authenticated) router.replace("/login");
  }, [authenticated, router]);

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<Profile>("/auth/profile/")).data,
    enabled: authenticated,
  });
  const isAdmin = Boolean(profile.data?.is_superuser || profile.data?.role === "admin");

  const overview = useQuery({
    queryKey: ["admin-download-overview"],
    queryFn: async () => (await api.get<AdminDownloadOverview>("/admin/download-stats/overview/")).data,
    enabled: authenticated && isAdmin && tab === "overview",
  });
  const books = useQuery({
    queryKey: ["admin-download-books", debouncedBookSearch, bookOrdering, bookPage],
    queryFn: async () => (await api.get<Paginated<BookDownloadStat>>("/admin/download-stats/books/", {
      params: {
        search: debouncedBookSearch || undefined,
        ordering: bookOrdering,
        page: bookPage,
        page_size: PAGE_SIZE,
      },
    })).data,
    enabled: authenticated && isAdmin && tab === "books",
  });
  const users = useQuery({
    queryKey: ["admin-download-users", debouncedUserSearch, userOrdering, userPage],
    queryFn: async () => (await api.get<Paginated<UserDownloadStat>>("/admin/download-stats/users/", {
      params: {
        search: debouncedUserSearch || undefined,
        ordering: userOrdering,
        page: userPage,
        page_size: PAGE_SIZE,
      },
    })).data,
    enabled: authenticated && isAdmin && tab === "users",
  });
  const history = useQuery({
    queryKey: ["admin-download-history", historyUser?.id, debouncedHistorySearch, historyPage],
    queryFn: async () => (await api.get<Paginated<UserDownloadHistoryItem>>(`/admin/download-stats/users/${historyUser!.id}/history/`, {
      params: {
        search: debouncedHistorySearch || undefined,
        page: historyPage,
        page_size: HISTORY_PAGE_SIZE,
      },
    })).data,
    enabled: authenticated && isAdmin && !!historyUser,
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setHistoryUser(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const metricCards = useMemo(() => (overview.data ? [
    { label: t("totalEvents"), value: overview.data.total_download_events, icon: Download, accent: "forest" as const },
    { label: t("downloadedBooks"), value: overview.data.total_downloaded_books, icon: BookOpen, accent: "gold" as const },
    { label: t("downloadingUsers"), value: overview.data.total_downloading_users, icon: Users, accent: "sage" as const },
  ] : []), [overview.data, t]);

  if (!authenticated) return null;
  if (profile.isLoading) return <p className="p-16 text-center text-slate-500">{common("loading")}</p>;
  if (profile.isError || !profile.data) return <p role="alert" className="p-16 text-center text-red-700">{adminT("loadError")}</p>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">{adminT("accessDeniedTitle")}</h1>
        <p className="mt-3 text-slate-600">{adminT("accessDenied")}</p>
        <Link href="/admin" className="mt-6 inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">{nav("adminDashboard")}</Link>
      </div>
    );
  }

  const tabButton = (value: Tab, label: string) => (
    <button
      key={value}
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        tab === value ? "bg-brand text-white shadow-card" : "text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-7 px-4 py-8 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:px-8">
      <aside className="dashboard-rail">
        <div className="dashboard-profile">
          <span className="dashboard-avatar"><BarChart3 size={17} /></span>
          <div><p className="font-semibold">{t("title")}</p><p className="text-xs capitalize text-slate-500">{profile.data.role}</p></div>
        </div>
        <DashboardNav canManage canManageUsers canManageCatalogMetadata />
      </aside>

      <div className="min-w-0">
        <DashboardHeader variant="quiet" eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />

        <div role="tablist" aria-label={t("tabsLabel")} className="mt-6 flex flex-wrap gap-2">
          {tabButton("overview", t("tabOverview"))}
          {tabButton("books", t("tabBooks"))}
          {tabButton("users", t("tabUsers"))}
        </div>

        {/* ============ OVERVIEW TAB ============ */}
        {tab === "overview" && (
          <section role="tabpanel" className="mt-6">
            {overview.isLoading && <p className="p-10 text-center text-slate-500">{common("loading")}</p>}
            {overview.isError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{t("loadError")}</p>}
            {overview.data && (
              <>
                <section aria-label={t("overview")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {metricCards.map(({ label, value, icon, accent }) => (
                    <DashboardStatsCard key={label} label={label} value={value} icon={icon} accent={accent} />
                  ))}
                </section>

                <section className="dashboard-panel mt-6">
                  <div className="flex items-center justify-between gap-4">
                    <div><p className="eyebrow">{t("activity")}</p><h2 className="mt-1 text-xl font-semibold">{t("last30Days")}</h2></div>
                    <BarChart3 className="text-brand" size={20} />
                  </div>
                  <div className="mt-5"><DownloadActivityChart data={overview.data.downloads_by_day} locale={locale} /></div>
                </section>

                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <section className="dashboard-panel">
                    <p className="eyebrow">{t("mostDownloaded")}</p><h2 className="mt-1 text-lg font-semibold">{t("mostDownloadedTitle")}</h2>
                    <BookTable rows={overview.data.most_downloaded} locale={locale} showRank={false} />
                  </section>
                  <section className="dashboard-panel">
                    <p className="eyebrow">{t("leastDownloaded")}</p><h2 className="mt-1 text-lg font-semibold">{t("leastDownloadedTitle")}</h2>
                    <BookTable rows={overview.data.least_downloaded} locale={locale} showRank={false} />
                  </section>
                </div>

                <section className="dashboard-panel mt-6">
                  <p className="eyebrow">{t("activity")}</p><h2 className="mt-1 text-lg font-semibold">{t("recentActivity")}</h2>
                  {overview.data.recent_activity.length ? (
                    <ul className="mt-4 divide-y divide-slate-100">
                      {overview.data.recent_activity.map((event) => (
                        <li key={event.id} className="flex items-center justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <Link href={`/books/${event.book_id}`} className="block truncate text-sm font-medium hover:text-brand">{event.book_title}</Link>
                            <p className="mt-1 text-xs text-slate-500">{event.username}</p>
                          </div>
                          <time className="shrink-0 text-xs text-slate-400">{formatDate(event.downloaded_at, locale, true)}</time>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="empty-panel mt-4">{t("noActivity")}</p>}
                </section>
              </>
            )}
          </section>
        )}

        {/* ============ BOOKS TAB ============ */}
        {tab === "books" && (
          <section role="tabpanel" className="mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Field value={bookSearch} onChange={(e) => { setBookSearch(e.target.value); setBookPage(1); }} placeholder={t("searchBooks")} aria-label={t("searchBooks")} className="pl-10" />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <ArrowUpDown size={16} className="text-slate-400" />
                <select value={bookOrdering} onChange={(e) => { setBookOrdering(e.target.value); setBookPage(1); }} aria-label={t("sortLabel")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <option value="-downloads">{t("sortDownloadsDesc")}</option>
                  <option value="downloads">{t("sortDownloadsAsc")}</option>
                  <option value="-unique_users">{t("sortUniqueUsersDesc")}</option>
                  <option value="-last_download_at">{t("sortLastDownload")}</option>
                  <option value="title">{t("sortTitle")}</option>
                  <option value="rank">{t("sortRank")}</option>
                </select>
              </label>
            </div>
            {books.isLoading && <p className="p-10 text-center text-slate-500">{common("loading")}</p>}
            {books.isError && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{t("loadError")}</p>}
            {books.data && (
              <>
                <p className="mt-4 text-sm text-slate-500">{t("booksCount", { count: books.data.count })}</p>
                <BookTable rows={books.data.results} locale={locale} />
                <Pagination count={books.data.count} page={bookPage} pageSize={PAGE_SIZE} onPage={setBookPage} />
              </>
            )}
          </section>
        )}

        {/* ============ USERS TAB ============ */}
        {tab === "users" && (
          <section role="tabpanel" className="mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Field value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }} placeholder={t("searchUsers")} aria-label={t("searchUsers")} className="pl-10" />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <ChevronDown size={16} className="text-slate-400" />
                <select value={userOrdering} onChange={(e) => { setUserOrdering(e.target.value); setUserPage(1); }} aria-label={t("sortLabel")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <option value="-last_download_at">{t("sortLastDownload")}</option>
                  <option value="-total_events">{t("sortTotalEvents")}</option>
                  <option value="-unique_books">{t("sortUniqueBooks")}</option>
                  <option value="username">{t("sortUsername")}</option>
                </select>
              </label>
            </div>
            {users.isLoading && <p className="p-10 text-center text-slate-500">{common("loading")}</p>}
            {users.isError && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{t("loadError")}</p>}
            {users.data && (
              <>
                <p className="mt-4 text-sm text-slate-500">{t("usersCount", { count: users.data.count })}</p>
                {users.data.results.length ? (
                  <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
                    <table className="data-table min-w-[850px]">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-start">{t("colUser")}</th>
                          <th className="px-4 py-3 text-start">{t("colEmail")}</th>
                          <th className="px-4 py-3 text-end">{t("colEvents")}</th>
                          <th className="px-4 py-3 text-end">{t("colUniqueBooks")}</th>
                          <th className="px-4 py-3 text-start">{t("colMostRecent")}</th>
                          <th className="px-4 py-3 text-start">{t("colLastDownload")}</th>
                          <th className="px-4 py-3 text-end"><span className="sr-only">{t("colActions")}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.data.results.map((user) => (
                          <tr key={user.id} className="align-top">
                            <td className="px-4 py-3">
                              <p className="font-medium">{user.full_name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">@{user.username}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{user.email || "—"}</td>
                            <td className="px-4 py-3 text-end font-semibold tabular-nums">{formatNumber(user.total_events, locale)}</td>
                            <td className="px-4 py-3 text-end tabular-nums text-slate-600">{formatNumber(user.unique_books, locale)}</td>
                            <td className="max-w-[180px] truncate px-4 py-3 text-slate-600">{user.most_recent_book ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-600">{formatDate(user.last_download_at, locale)}</td>
                            <td className="px-4 py-3 text-end">
                              <Button type="button" variant="secondary" onClick={() => { setHistoryUser(user); setHistorySearch(""); setHistoryPage(1); }}>
                                {t("viewHistory")}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-panel mt-4">{t("noUsers")}</p>
                )}
                <Pagination count={users.data.count} page={userPage} pageSize={PAGE_SIZE} onPage={setUserPage} />
              </>
            )}
          </section>
        )}
      </div>

      {/* ============ USER HISTORY MODAL ============ */}
      {historyUser && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("historyFor", { user: historyUser.username })}
          onClick={() => setHistoryUser(null)}
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-card dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{t("history")}</p>
                <h2 className="mt-1 text-xl font-semibold">{t("historyFor", { user: historyUser.full_name })}</h2>
                <p className="mt-1 text-xs text-slate-500">@{historyUser.username} · {historyUser.email || "—"}</p>
              </div>
              <button type="button" onClick={() => setHistoryUser(null)} aria-label={t("close")} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            <label className="relative mt-4 block">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Field value={historySearch} onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }} placeholder={t("searchHistory")} aria-label={t("searchHistory")} className="pl-10" autoFocus />
            </label>
            {history.isLoading && <p className="p-8 text-center text-slate-500">{common("loading")}</p>}
            {history.isError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{t("loadError")}</p>}
            {history.data && (
              <>
                {history.data.results.length ? (
                  <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                    {history.data.results.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <Link href={`/books/${item.book}`} className="block truncate text-sm font-medium hover:text-brand">{item.book_title}</Link>
                          <p className="mt-1 text-xs text-slate-500">{item.book_author.join(", ") || t("unknownAuthor")} · {formatDate(item.downloaded_at, locale, true)}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand-dark dark:text-emerald-100">
                          {t("timesDownloaded", { count: item.times_downloaded })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="empty-panel mt-4">{t("noHistory")}</p>}
                <Pagination count={history.data.count} page={historyPage} pageSize={HISTORY_PAGE_SIZE} onPage={setHistoryPage} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
