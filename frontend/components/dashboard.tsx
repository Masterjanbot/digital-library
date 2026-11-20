"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import {
  Activity, BookOpen, FileText, ShieldCheck, Users, BookPlus, ArrowUpRight,
  LibraryBig, Library, Sparkles, Download,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Dashboard, Paginated } from "@/lib/types";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { DashboardNav } from "@/components/dashboard-nav";
import { ReadingActivityPanel } from "@/components/reading-activity-panel";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardStatsCard } from "@/components/stats-card";
import { SectionHeader } from "@/components/section-header";
import { EmptyState } from "@/components/empty-state";
import { LoadingSkeleton } from "@/components/loading-skeleton";

type BookmarkItem = { id: number; book: number; book_title: string; page: number; label: string };
type NoteItem = { id: number; book: number; book_title: string; page: number | null; title: string; content: string };
type ProfileName = { first_name?: string; username?: string };

export function DashboardPage() {
  const t = useTranslations("dashboard");
  const dl = useTranslations("downloadStats");
  const { authenticated } = useSession();
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<Dashboard>("/dashboard/")).data,
    enabled: authenticated,
  });
  // Shared with the header — same query key, so this does not add a request.
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<ProfileName & { role: string; is_superuser: boolean }>("/auth/profile/")).data,
    enabled: authenticated,
  });
  const { data: bookmarks } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: async () => (await api.get<Paginated<BookmarkItem>>("/bookmarks/", { params: { page_size: 100 } })).data.results,
    enabled: authenticated,
  });
  const { data: notes } = useQuery({
    queryKey: ["notes"],
    queryFn: async () => (await api.get<Paginated<NoteItem>>("/notes/", { params: { page_size: 100 } })).data.results,
    enabled: authenticated,
  });
  useEffect(() => {
    if (!authenticated) router.replace("/login");
  }, [authenticated, router]);

  if (!authenticated || isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <LoadingSkeleton variant="cards" rows={2} className="!grid-cols-1" />
        <div className="mt-6"><LoadingSkeleton variant="chart" /></div>
      </div>
    );
  }
  if (isError || !data) {
    return <p role="alert" className="p-16 text-center text-red-700">Your dashboard could not be loaded.</p>;
  }

  const isManager = ["admin", "librarian", "editor"].includes(data.role);
  const isAdmin = data.role === "admin";
  const canManage = Boolean(data.can_manage_catalog || isManager);
  const firstName = profile?.first_name?.trim();
  const displayName = firstName || profile?.username || t("heroFallbackName");
  const plan = data.subscription?.plan;
  const isPremiumPlan = Boolean(plan && /premium/i.test(plan) && (data.subscription?.status ?? "active") === "active");

  const managementMetrics = [
    { label: t("totalBooks"), value: data.total_books ?? 0, icon: BookOpen, accent: "forest" as const },
    { label: t("publishedBooks"), value: data.published_books ?? 0, icon: ShieldCheck, accent: "sage" as const },
    { label: t("draftBooks"), value: data.draft_books ?? 0, icon: FileText, accent: "gold" as const },
    { label: t("readers"), value: data.total_readers ?? 0, icon: Users, accent: "forest" as const },
    { label: t("readingActivity"), value: data.total_reading_activity ?? 0, icon: Activity, accent: "clay" as const },
    ...(isAdmin ? [
      { label: t("totalUsers"), value: data.total_users ?? 0, icon: Users, accent: "sage" as const },
      { label: t("subscriptions"), value: data.active_subscriptions ?? 0, icon: ShieldCheck, accent: "gold" as const },
      { label: t("downloads"), value: data.total_downloads ?? 0, icon: Download, accent: "forest" as const },
    ] : []),
  ];
  const metrics = managementMetrics;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
      <aside className="dashboard-rail">
        <div className="dashboard-profile">
          <span className="dashboard-avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{displayName}</p>
            <p className="text-xs capitalize text-slate-500 dark:text-slate-400">{data.role}</p>
          </div>
        </div>
        <DashboardNav canManage={canManage} canManageUsers={data.role === "admin"} canManageCatalogMetadata={canManage} />
        {canManage && <Link href="/my-books#add-book" className="dashboard-add"><BookPlus size={17} />{t("addBook")}</Link>}
      </aside>

      <div className="min-w-0">
        <DashboardHeader
          eyebrow={t("welcome")}
          title={t("greeting", { name: displayName })}
          intro={t("heroIntro")}
          chips={
            <>
              <span className="hero-chip">{isPremiumPlan ? <Sparkles size={12} /> : <BookOpen size={12} />}{isPremiumPlan ? t("premiumMember") : t("readerMember")}</span>
              <span className="hero-chip"><Library size={12} />{t("yourLibrary")}</span>
            </>
          }
          primaryAction={<Link href="/catalog" className="hero-button"><LibraryBig size={17} />{dl("exploreLibrary")}</Link>}
          artwork
        />

        {canManage && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {metrics.map(({ label, value, icon, accent }) => (
              <DashboardStatsCard key={label} label={label} value={value} icon={icon} accent={accent} />
            ))}
          </div>
        )}

        {!canManage && <ReadingActivityPanel />}

        {canManage ? (
          <section className="dashboard-panel mt-6">
            <SectionHeader
              eyebrow={t("latest")}
              title={t("recentActivity")}
              action={<Link href="/my-books" className="inline-flex items-center gap-1 text-sm font-semibold text-brand transition hover:text-brand-dark">{t("myBooks")}<ArrowUpRight size={15} /></Link>}
            />
            {data.recent_activity?.length ? (
              <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {data.recent_activity.map((activity, index) => (
                  <li key={`${activity.book__id}-${activity.last_read_at}-${index}`} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{activity.book__title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{activity.user__username} · {t("page")} {activity.current_page}</p>
                    </div>
                    <time className="shrink-0 text-xs tabular-nums text-slate-400">{new Date(activity.last_read_at).toLocaleDateString()}</time>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={Activity} description={t("noActivity")} />}
          </section>
        ) : (
          <section className="dashboard-panel mt-6">
            <SectionHeader
              eyebrow={t("reading")}
              title={t("continue")}
              action={<Link href="/catalog" className="inline-flex items-center gap-1 text-sm font-semibold text-brand transition hover:text-brand-dark">{t("explore")}<ArrowUpRight size={15} /></Link>}
            />
            {data.continue_reading?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.continue_reading.map((item) => (
                  <Link key={item.book_id} href={`/reader/${item.book_id}`} className="reading-card group">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold leading-snug text-ink transition group-hover:text-brand">{item.title}</h3>
                      <span className="shrink-0 rounded-full bg-gold-light px-2 py-0.5 text-[.7rem] font-bold tabular-nums text-gold-dark">{Math.round(Number(item.percentage))}%</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand to-sage transition-all" style={{ width: `${Math.min(100, Number(item.percentage) || 0)}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("page")} {item.page}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState icon={BookOpen} description={t("empty")} action={<Link href="/catalog"><Button variant="secondary">{t("explore")}</Button></Link>} />
              </div>
            )}
          </section>
        )}

        {!canManage && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="dashboard-panel">
              <SectionHeader eyebrow={t("saved")} title={t("bookmarks")} action={<span className="text-sm font-semibold tabular-nums text-slate-400">{data.bookmarks ?? 0}</span>} />
              {bookmarks?.length ? (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {bookmarks.slice(0, 4).map((item) => (
                    <li key={item.id} className="py-3">
                      <Link href={`/reader/${item.book}`} className="font-medium text-ink transition hover:text-brand">{item.label || item.book_title}</Link>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("page")} {item.page}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("noBookmarks")}</p>}
            </section>
            <section className="dashboard-panel">
              <SectionHeader eyebrow={t("saved")} title={t("notes")} action={<span className="text-sm font-semibold tabular-nums text-slate-400">{data.notes ?? 0}</span>} />
              {notes?.length ? (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {notes.slice(0, 4).map((item) => (
                    <li key={item.id} className="py-3">
                      <Link href={`/reader/${item.book}`} className="font-medium text-ink transition hover:text-brand">{item.title || item.book_title}</Link>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.content}</p>
                      {item.page && <p className="mt-1 text-xs text-slate-400">{t("page")} {item.page}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("noNotes")}</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
