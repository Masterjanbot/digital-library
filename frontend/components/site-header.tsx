"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { BookOpen, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";

type HeaderProfile = { role: string; is_superuser: boolean; first_name: string; username: string };

export function SiteHeader() {
  const t = useTranslations("nav");
  const common = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { authenticated, signOut } = useSession();
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<HeaderProfile>("/auth/profile/")).data,
    enabled: authenticated,
  });
  const canManage = Boolean(profile?.is_superuser || ["admin", "librarian", "editor"].includes(profile?.role || ""));
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const initial = (profile?.first_name?.trim()?.[0] || profile?.username?.[0] || "?").toUpperCase();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function navLink(href: string, label: string) {
    return (
      <Link key={href} className="nav-link" aria-current={isActive(href) ? "page" : undefined} href={href}>
        {label}
      </Link>
    );
  }

  async function logout() {
    setLogoutError("");
    const refresh = window.sessionStorage.getItem("library.refresh");
    try {
      if (refresh) await api.post("/auth/logout/", { refresh });
    } catch {
      setLogoutError("The session could not be revoked; local sign-out completed.");
    } finally {
      signOut();
      router.push("/");
    }
  }

  function changeLocale(nextLocale: string) {
    document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000;samesite=lax`;
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <header className="site-header sticky top-0 z-30 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Papertrail — home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-[#f3ead4] shadow-card transition-transform duration-200 group-hover:-translate-y-0.5">
            <BookOpen size={18} strokeWidth={1.8} />
          </span>
          <span className="leading-tight">
            <span className="editorial-display block text-[1.15rem] font-semibold tracking-tight text-ink transition-colors group-hover:text-brand">Papertrail</span>
            <span className="block text-[.56rem] font-bold uppercase tracking-[.22em] text-gold-dark">Digital Library</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex lg:gap-7" aria-label="Primary">
          {navLink("/", t("home"))}
          {navLink("/catalog", t("catalog"))}
          {authenticated && navLink("/dashboard", t("dashboard"))}
          {authenticated && navLink("/my-downloads", t("myDownloads"))}
          {authenticated && canManage && navLink("/admin", t("adminDashboard"))}
          {authenticated && navLink("/settings", t("settings"))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <label className="sr-only" htmlFor="locale">{common("language")}</label>
          <select id="locale" value={locale} onChange={(event) => changeLocale(event.target.value)} className="header-select rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-xs transition hover:border-sage dark:bg-slate-900">
            <option value="en">English</option><option value="fa">فارسی</option>
          </select>
          {authenticated ? (
            <>
              <Link href="/settings" title={t("settings")} aria-label={t("settings")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-[#F2F7FE] ring-2 ring-gold/70 transition hover:ring-gold">
                {initial}
              </Link>
              <Button variant="ghost" onClick={logout} aria-label={t("logout")}><LogOut size={16} /><span className="hidden lg:inline">{t("logout")}</span></Button>
            </>
          ) : (
            <>
              <Link className="nav-link" href="/login">{t("login")}</Link>
              <Link href="/register" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-[#F2F7FE] shadow-card transition hover:bg-brand-dark">{t("register")}</Link>
            </>
          )}
        </div>

        <button aria-label="Toggle navigation" aria-expanded={menuOpen} className="rounded-lg p-2 text-ink transition hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {menuOpen && (
        <div className="site-mobile-menu border-t px-5 py-4 md:hidden">
          <nav className="grid gap-1" aria-label="Mobile">
            {[
              { href: "/", label: t("home") },
              { href: "/catalog", label: t("catalog") },
              ...(authenticated ? [
                { href: "/dashboard", label: t("dashboard") },
                { href: "/my-downloads", label: t("myDownloads") },
                ...(canManage ? [{ href: "/admin", label: t("adminDashboard") }] : []),
                { href: "/settings", label: t("settings") },
              ] : [
                { href: "/login", label: t("login") },
                { href: "/register", label: t("register") },
              ]),
            ].map(({ href, label }) => (
              <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium transition hover:bg-slate-100 aria-[current=page]:bg-brand aria-[current=page]:text-white dark:hover:bg-slate-800">
                {label}
              </Link>
            ))}
            {authenticated && (
              <button className="rounded-lg px-3 py-2.5 text-start text-sm font-medium text-red-800 transition hover:bg-red-50 dark:hover:bg-red-950/40" onClick={() => { setMenuOpen(false); logout(); }}>
                {t("logout")}
              </button>
            )}
          </nav>
          <div className="mt-3 flex items-center gap-3 border-t border-[var(--border)] pt-3">
            <ThemeToggle />
            <select value={locale} onChange={(event) => changeLocale(event.target.value)} aria-label={common("language")} className="header-select flex-1 rounded-lg border px-3 py-2">
              <option value="en">English</option><option value="fa">فارسی</option>
            </select>
            {authenticated && (
              <Link href="/settings" onClick={() => setMenuOpen(false)} aria-label={t("settings")} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-[#F2F7FE] ring-2 ring-gold/70">
                {initial}
              </Link>
            )}
          </div>
        </div>
      )}
      {logoutError && <p role="status" className="mx-auto max-w-7xl px-4 pb-2 text-xs text-red-700">{logoutError}</p>}
    </header>
  );
}
