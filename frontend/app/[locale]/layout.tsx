import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import Script from "next/script";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { QueryProvider } from "@/providers/query-provider";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/routing";
import "../globals.css";

export const metadata: Metadata = {
  title: "Papertrail — Digital Library",
  description: "Discover, read, and organize your digital library.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!routing.locales.some((supported) => supported === locale)) notFound();
  const messages = await getMessages();
  const nav = await getTranslations("nav");
  const footer = await getTranslations("footer");
  const direction = locale === "en" ? "ltr" : "rtl";
  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">{`(() => {
  let preference = null;
  try {
    const saved = localStorage.getItem("papertrail-theme");
    if (saved === "dark" || saved === "light") preference = saved;
  } catch (error) {
    console.error("Could not read the saved theme preference.", error);
  }
  const isDark = preference === null
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : preference === "dark";
  document.documentElement.classList.toggle("dark", isDark);
})();`}</Script>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <SiteHeader />
            <main className="min-h-[calc(100vh-4rem)]">{children}</main>
            <footer className="site-footer">
              <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-7 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                <Link href="/" className="font-semibold tracking-tight text-ink">Papertrail <span className="font-normal text-slate-500">· {footer("tagline")}</span></Link>
                <nav aria-label={footer("navigation")} className="flex flex-wrap gap-x-5 gap-y-2 text-slate-500">
                  <Link href="/catalog" className="hover:text-brand">{nav("catalog")}</Link>
                  <Link href="/dashboard" className="hover:text-brand">{nav("dashboard")}</Link>
                  <Link href="/settings" className="hover:text-brand">{nav("settings")}</Link>
                </nav>
              </div>
            </footer>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
