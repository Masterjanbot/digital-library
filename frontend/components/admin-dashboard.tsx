"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, BarChart3, BookOpen, BookPlus, FolderOpen, Library, LockKeyhole, PencilRuler,
  Users, Download, TrendingUp, BookCheck, type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api";
import type {
  AdminDownloadOverview,
  Dashboard,
} from "@/lib/types";
import { useSession } from "@/hooks/use-session";
import { Link, useRouter } from "@/i18n/routing";
import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardStatsCard } from "@/components/stats-card";
import { SectionHeader } from "@/components/section-header";
import { AnalyticsChartCard } from "@/components/chart-card";
import { ActivityTable } from "@/components/activity-table";
import { EmptyState } from "@/components/empty-state";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { AdminActivitySection } from "@/components/admin-activity";
import {
  DailyDownloadsLineChart,
  TopBooksHorizontalBarChart,
} from "@/components/analytics-charts";

type Profile = { role: string; is_superuser: boolean; first_name?: string; username?: string };
type ManagementItem = { href: string; title: string; description: string; icon: LucideIcon };

export function AdminDashboard() {
  const t = useTranslations("admin");
  const ds = useTranslations("downloadStats");
  const nav = useTranslations("nav");
  const locale = useLocale();
  const { authenticated } = useSession();
  const router = useRouter();

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<Profile>("/auth/profile/")).data,
    enabled: authenticated,
  });
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<Dashboard>("/dashboard/")).data,
    enabled: authenticated && profile.isSuccess,
  });
  const role = profile.data?.role;
  const isAdmin = Boolean(profile.data?.is_superuser || role === "admin");
  const canManageCatalog = isAdmin || ["librarian", "editor"].includes(role ?? "");

  // Platform-wide download analytics (admin-only endpoint).
  const overview = useQuery({
    queryKey: ["admin-download-overview"],
    queryFn: async () => (await api.get<AdminDownloadOverview>("/admin/download-stats/overview/")).data,
    enabled: authenticated && isAdmin,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!authenticated) router.replace("/login");
  }, [authenticated, router]);

  if (!authenticated) return null;
  if (profile.isLoading) return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><LoadingSkeleton variant="cards" rows={4} /></div>;
  if (profile.isError || !profile.data) {
    return <p role="alert" className="p-16 text-center text-red-700">{t("loadError")}</p>;
  }
  if (!canManageCatalog) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="editorial-display text-2xl font-semibold text-ink">{t("accessDeniedTitle")}</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">{t("accessDenied")}</p>
        <Link href="/dashboard" className="button-link mt-6">{nav("dashboard")}</Link>
      </div>
    );
  }

  const displayName = profile.data.first_name?.trim() || profile.data.username || "";
  const libraryMetrics: { label: string; value: number; icon: LucideIcon; accent: "forest" | "sage" | "gold" | "clay" }[] = [
    ...(isAdmin ? [] : [{ label: t("totalBooks"), value: dashboard.data?.total_books ?? 0, icon: BookOpen, accent: "forest" as const }]),
    { label: t("publishedBooks"), value: dashboard.data?.published_books ?? 0, icon: BookCheck, accent: "sage" as const },
    { label: t("draftBooks"), value: dashboard.data?.draft_books ?? 0, icon: Activity, accent: "gold" as const },
    { label: t("readers"), value: dashboard.data?.total_readers ?? 0, icon: Users, accent: "clay" as const },
    { label: t("readingActivity"), value: dashboard.data?.total_reading_activity ?? 0, icon: Activity, accent: "forest" as const },
    ...(isAdmin ? [
      { label: t("totalUsers"), value: dashboard.data?.total_users ?? 0, icon: Users, accent: "sage" as const },
      { label: t("subscriptionsCount"), value: dashboard.data?.active_subscriptions ?? 0, icon: LockKeyhole, accent: "gold" as const },
    ] : []),
  ];

  const downloadOverview = overview.data;
  const last30Total = downloadOverview ? downloadOverview.downloads_by_day.reduce((sum, day) => sum + day.count, 0) : 0;
  const bookMeta = [...(downloadOverview?.most_downloaded ?? []), ...(downloadOverview?.least_downloaded ?? [])];

  const items: ManagementItem[] = [
    { href: "/manage/books", title: t("books"), description: t("booksDescription"), icon: BookOpen },
    { href: "/manage/categories", title: t("categories"), description: t("categoriesDescription"), icon: FolderOpen },
    { href: "/manage/authors", title: t("authors"), description: t("authorsDescription"), icon: PencilRuler },
    { href: "/manage/publishers", title: t("publishers"), description: t("publishersDescription"), icon: BookPlus },
    ...(isAdmin ? [
      { href: "/admin/downloads", title: ds("title"), description: ds("adminCardDescription"), icon: BarChart3 },
      { href: "/manage/users", title: t("users"), description: t("usersDescription"), icon: Users },
      { href: "/manage/subscriptions", title: t("subscriptions"), description: t("subscriptionsDescription"), icon: LockKeyhole },
    ] : []),
  ];

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
      <aside className="dashboard-rail">
        <div className="dashboard-profile">
          <span className="dashboard-avatar" aria-hidden="true"><BarChart3 size={17} /></span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{displayName || t("title")}</p>
            <p className="text-xs capitalize text-slate-500 dark:text-slate-400">{role}</p>
          </div>
        </div>
        <DashboardNav canManage canManageUsers={isAdmin} canManageCatalogMetadata />
      </aside>

      <div className="min-w-0">
        <DashboardHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          intro={t("intro")}
          primaryAction={
            isAdmin ? (
              <Link href="/admin/downloads" className="hero-button"><BarChart3 size={17} />{ds("title")}</Link>
            ) : undefined
          }
        />
        {dashboard.isError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{t("loadError")}</p>}
        {overview.isError && isAdmin && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{ds("loadError")}</p>}

        {isAdmin && (
          <section aria-label={t("downloadOverview")} className="mt-6">
            <p className="eyebrow px-1">{t("downloadOverview")}</p>
            {overview.isLoading ? (
              <div className="mt-3"><LoadingSkeleton variant="cards" rows={2} /></div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <DashboardStatsCard label={ds("totalEvents")} value={downloadOverview?.total_download_events ?? 0} icon={Download} accent="forest" hint={ds("allTimeHint")} />
                <DashboardStatsCard label={ds("downloadingUsers")} value={downloadOverview?.total_downloading_users ?? 0} icon={Users} accent="sage" hint={ds("usersHint")} />
                <DashboardStatsCard label={ds("downloadedBooks")} value={downloadOverview?.total_downloaded_books ?? 0} icon={BookCheck} accent="gold" hint={ds("booksHint")} />
                <DashboardStatsCard label={t("totalBooks")} value={dashboard.data?.total_books ?? 0} icon={Library} accent="clay" hint={ds("catalogHint")} />
              </div>
            )}
          </section>
        )}

        <section aria-label={t("overview")} className="mt-6">
          <p className="eyebrow px-1">{t("libraryOverview")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {libraryMetrics.map(({ label, value, icon, accent }) => (
              <DashboardStatsCard key={label} label={label} value={value} icon={icon} accent={accent} />
            ))}
          </div>
        </section>

        {isAdmin && <AdminActivitySection />}

        {isAdmin && (
          <section aria-label={ds("overview")} className="mt-6 grid gap-4 xl:grid-cols-12">
            <AnalyticsChartCard
              className="xl:col-span-7"
              eyebrow={ds("activity")}
              title={ds("last30Days")}
              isLoading={overview.isLoading}
              isEmpty={Boolean(downloadOverview) && last30Total === 0}
              emptyMessage={ds("noActivity")}
              aside={<TrendingUp size={17} className="text-sage" aria-hidden="true" />}
            >
              {downloadOverview && <DailyDownloadsLineChart data={downloadOverview.downloads_by_day} locale={locale} seriesName={ds("chartAriaLabel")} />}
            </AnalyticsChartCard>

            <AnalyticsChartCard
              className="xl:col-span-5"
              eyebrow={ds("mostDownloaded")}
              title={ds("mostDownloadedTitle")}
              isLoading={overview.isLoading}
              isEmpty={Boolean(downloadOverview) && (downloadOverview?.most_downloaded.every((book) => book.downloads === 0) ?? true)}
              emptyMessage={ds("noBooks")}
            >
              {downloadOverview && <TopBooksHorizontalBarChart data={downloadOverview.most_downloaded} locale={locale} seriesName={ds("colDownloads")} />}
            </AnalyticsChartCard>
          </section>
        )}

        {isAdmin && (
          <section className="dashboard-panel mt-6" aria-label={t("recentDownloadsTitle")}>
            <SectionHeader
              eyebrow={ds("activity")}
              title={t("recentDownloadsTitle")}
              action={<Link href="/admin/downloads" className="text-sm font-semibold text-brand transition hover:text-brand-dark">{ds("viewFullStats")}</Link>}
            />
            {overview.isLoading && <div className="mt-4"><LoadingSkeleton variant="table" rows={5} /></div>}
            {downloadOverview && (
              <div className="mt-4">
                <ActivityTable events={downloadOverview.recent_activity} bookStats={bookMeta} />
              </div>
            )}
          </section>
        )}

        <section className="mt-8">
          <SectionHeader eyebrow={t("management")} title={t("managementTitle")} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map(({ href, title, description, icon: Icon }) => (
              <Link key={href} href={href} className="dashboard-panel group transition duration-200 hover:-translate-y-0.5 hover:border-sage hover:shadow-card">
                <span className="icon-tile icon-tile-forest transition-transform duration-200 group-hover:scale-105"><Icon size={18} /></span>
                <h3 className="mt-3 font-semibold text-ink transition group-hover:text-brand">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
              </Link>
            ))}
          </div>
        </section>

        {dashboard.data?.recent_activity && (
          <section className="dashboard-panel mt-6">
            <SectionHeader eyebrow={t("activity")} title={t("recentActivity")} />
            {dashboard.data.recent_activity.length ? (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {dashboard.data.recent_activity.map((entry, index) => (
                  <li key={`${entry.book__id}-${entry.last_read_at}-${index}`} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{entry.book__title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{entry.user__username} · {t("page")} {entry.current_page}</p>
                    </div>
                    <time className="shrink-0 text-xs tabular-nums text-slate-400">{new Date(entry.last_read_at).toLocaleDateString()}</time>
                  </li>
                ))}
              </ul>
            ) : <EmptyState description={t("noActivity")} />}
          </section>
        )}
      </div>
    </div>
  );
}
