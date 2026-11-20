import { Link } from "@/i18n/routing";
import { BookOpen, LockKeyhole, Sparkles } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { Book } from "@/lib/types";
import { api } from "@/lib/api";

export function BookCard({ book }: { book: Book }) {
  const t = useTranslations("book");
  const coverUrl = `${api.defaults.baseURL}/books/${book.id}/cover/`;
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card transition hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/books/${book.id}`} className="block">
        <div className="book-cover-placeholder relative flex aspect-[2/3] items-center justify-center overflow-hidden">
          {book.cover_available ? <Image src={coverUrl} alt="" fill sizes="(max-width: 640px) 100vw, 25vw" unoptimized className="object-contain object-center" /> : <BookOpen size={42} className="text-brand/50" />}
          {book.is_featured && <span className="book-featured-badge absolute start-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"><Sparkles size={12} />{t("featured")}</span>}
          {book.is_premium && <span className="book-premium-badge absolute end-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"><LockKeyhole size={12} />{t("premium")}</span>}
        </div>
        <div className="p-4">
          <p className="mb-1 truncate text-xs font-medium uppercase tracking-wide text-brand">{book.category_name || book.language}</p>
          <h3 className="line-clamp-2 min-h-12 font-semibold text-ink">{book.title}</h3>
          <p className="mt-2 truncate text-sm text-slate-500">{book.authors_display.join(", ") || t("unknownAuthor")}</p>
        </div>
      </Link>
    </article>
  );
}
