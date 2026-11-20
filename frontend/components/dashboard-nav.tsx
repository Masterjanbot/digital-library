"use client";

import { BookPlus, BookText, LayoutDashboard, Settings, Shield, Users, FolderOpen, UserRound, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";

export function DashboardNav({
  canManage = false,
  canManageUsers = false,
  canManageCatalogMetadata = false,
}: {
  canManage?: boolean;
  canManageUsers?: boolean;
  canManageCatalogMetadata?: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const items: { href: string; label: string; icon: typeof LayoutDashboard; show: boolean }[] = [
    { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard, show: true },
    { href: "/my-books", label: t("myBooks"), icon: BookText, show: true },
    { href: "/my-downloads", label: t("myDownloads"), icon: FolderOpen, show: true },
    { href: "/my-books#add-book", label: t("addBook"), icon: BookPlus, show: canManage },
    { href: "/settings", label: t("settings"), icon: Settings, show: true },
    { href: "/admin/downloads", label: t("downloadStats"), icon: BarChart3, show: canManageUsers },
    { href: "/manage/users", label: t("users"), icon: Users, show: canManageUsers },
    { href: "/manage/books", label: t("manage"), icon: Shield, show: canManage },
    { href: "/manage/categories", label: t("categories"), icon: FolderOpen, show: canManageCatalogMetadata },
    { href: "/manage/authors", label: t("authors"), icon: UserRound, show: canManageCatalogMetadata },
    { href: "/manage/publishers", label: t("publishers"), icon: BookText, show: canManageCatalogMetadata },
  ];
  return (
    <nav aria-label={t("dashboard")} className="dashboard-nav">
      {items.filter(({ show }) => show).map(({ href, label, icon: Icon }) => {
        const base = href.split("#")[0];
        const active = pathname === base || pathname.startsWith(`${base}/`);
        return (
          <Link key={href} href={href} aria-current={active && !href.includes("#") ? "page" : undefined}>
            <Icon size={17} />{label}
          </Link>
        );
      })}
    </nav>
  );
}
