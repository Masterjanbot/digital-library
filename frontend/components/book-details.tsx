"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { ArrowLeft, ArrowRight, BookOpen, Download, LoaderCircle, LockKeyhole } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api } from "@/lib/api";
import type { Book, Paginated } from "@/lib/types";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";

type Profile = { role: string };
type Subscription = { plan: string; status: string; expires_at: string | null };

export function BookDetails({ id }: { id: string }) {
  const t = useTranslations("book");
  const common = useTranslations("common");
  const locale = useLocale();
  const { authenticated } = useSession();
  const [now, setNow] = useState(() => Date.now());
  const [downloadState, setDownloadState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: book, isLoading, isError } = useQuery({
    queryKey: ["book", id],
    queryFn: async () => (await api.get<Book>(`/books/${id}/`)).data,
  });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<Profile>("/auth/profile/")).data,
    enabled: authenticated && Boolean(book?.is_premium),
  });
  const subscriptions = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => (await api.get<Paginated<Subscription>>("/subscriptions/")).data,
    enabled: authenticated && Boolean(book?.is_premium),
  });

  if (isLoading) return <p className="p-16 text-center text-slate-500">{common("loading")}</p>;
  if (isError || !book) return <p role="alert" className="mx-auto max-w-xl p-16 text-center text-red-700">This book is not available.</p>;

  const isCatalogManager = ["admin", "librarian", "editor"].includes(profile.data?.role || "");
  const hasPremiumAccess = isCatalogManager || Boolean(subscriptions.data?.results.some((subscription) =>
    subscription.plan === "premium"
    && subscription.status === "active"
    && (!subscription.expires_at || new Date(subscription.expires_at).getTime() > now)
  ));
  const isCheckingPremiumAccess = authenticated && book.is_premium && (profile.isLoading || subscriptions.isLoading);
  const cover = `${api.defaults.baseURL}/books/${book.id}/cover/`;
  const Arrow = locale === "en" ? ArrowLeft : ArrowRight;

  async function handleDownload() {
    setDownloadState("loading");
    try {
      const resp = await api.post(`/books/${book!.id}/download/`, {}, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `book-${book!.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setDownloadState("idle");
    } catch {
      setDownloadState("error");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/catalog" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-brand">
        <Arrow size={16} />{common("back")}
      </Link>
      <div className="grid gap-9 rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-10 md:grid-cols-[minmax(220px,340px)_1fr]">
        <div className="relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-2xl bg-brand-light">
          {book.cover_available ? (
            <Image src={cover} alt="" fill sizes="(max-width: 768px) 100vw, 340px" unoptimized className="object-contain object-center" />
          ) : (
            <BookOpen size={64} className="text-brand/50" />
          )}
        </div>
        <div className="flex flex-col items-start">
          {book.is_premium && (
            <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-gold-light px-3 py-1 text-xs font-semibold text-gold-dark">
              <LockKeyhole size={13} />{t("premium")}
            </span>
          )}
          <p className="eyebrow">{book.category_name || book.language}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{book.title}</h1>
          {book.subtitle && <p className="mt-2 text-lg text-slate-500">{book.subtitle}</p>}
          <p className="mt-4 text-slate-600">{book.authors_display.join(", ")}</p>
          <div className="my-7 h-px w-full bg-slate-100" />
          <h2 className="font-semibold">{t("details")}</h2>
          <p className="mt-2 whitespace-pre-line leading-7 text-slate-600">{book.description || "No description available."}</p>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {book.publication_date && <div><dt className="text-slate-400">Publication</dt><dd className="mt-1 font-medium">{book.publication_date}</dd></div>}
            {book.page_count && <div><dt className="text-slate-400">Pages</dt><dd className="mt-1 font-medium">{book.page_count}</dd></div>}
            {book.publisher_name && <div><dt className="text-slate-400">Publisher</dt><dd className="mt-1 font-medium">{book.publisher_name}</dd></div>}
            {book.isbn && <div><dt className="text-slate-400">ISBN</dt><dd className="mt-1 font-medium">{book.isbn}</dd></div>}
          </dl>
          {book.document_available && !authenticated && (
            <Link href="/login" className="mt-8"><Button>{t("signIn")}</Button></Link>
          )}
          {book.document_available && authenticated && !book.is_premium && (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/reader/${book.id}`}><Button variant="secondary"><BookOpen size={17} />{t("read")}</Button></Link>
              <Button onClick={handleDownload} disabled={downloadState === "loading"}>
                {downloadState === "loading" ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />}
                {downloadState === "loading" ? t("downloading") : t("download")}
              </Button>
            </div>
          )}
          {book.document_available && authenticated && book.is_premium && (
            <div className="mt-8 flex flex-wrap gap-3">
              {!isCheckingPremiumAccess && hasPremiumAccess && (
                <>
                  <Link href={`/reader/${book.id}`}><Button variant="secondary"><BookOpen size={17} />{t("read")}</Button></Link>
                  <Button onClick={handleDownload} disabled={downloadState === "loading"}>
                    {downloadState === "loading" ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />}
                    {downloadState === "loading" ? t("downloading") : t("download")}
                  </Button>
                </>
              )}
              {isCheckingPremiumAccess && <p role="status" className="mt-8 text-sm text-slate-500">{common("loading")}</p>}
            </div>
          )}
          {isCheckingPremiumAccess && <p role="status" className="mt-8 text-sm text-slate-500">{common("loading")}</p>}
          {book.is_premium && authenticated && !isCheckingPremiumAccess && (profile.isError || subscriptions.isError) && (
            <p role="alert" className="mt-8 text-sm text-red-700">{t("accessError")}</p>
          )}
          {book.is_premium && authenticated && !isCheckingPremiumAccess && !profile.isError && !subscriptions.isError && !hasPremiumAccess && (
            <p className="mt-8 rounded-xl bg-gold-light px-4 py-3 text-sm text-gold-dark">{t("premiumAccessRequired")}</p>
          )}
          {downloadState === "error" && (
            <p role="alert" className="mt-3 text-sm text-red-700">{t("downloadError")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
