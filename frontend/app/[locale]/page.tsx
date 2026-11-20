import { ArrowUpLeft, ArrowUpRight, LibraryBig, Search, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { BookCatalog } from "@/components/book-catalog";
import { Link } from "@/i18n/routing";

export default async function HomePage() {
  const t = await getTranslations("home");
  const locale = await getLocale();
  const Arrow = locale === "en" ? ArrowUpRight : ArrowUpLeft;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <section className="paper-grid relative min-h-[440px] overflow-hidden rounded-[1.8rem] bg-[#142B4A] px-7 py-12 text-[#F2F7FE] sm:px-14 sm:py-16 lg:flex lg:items-center">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#B9D0E8]"><Sparkles size={14} />{t("eyebrow")}</div>
          <h1 className="editorial-title max-w-2xl text-5xl font-medium leading-[1.06] sm:text-6xl lg:text-7xl">{t("title")}</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#C9D8EA] sm:text-lg">{t("description")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/catalog" className="inline-flex items-center gap-2 rounded-xl bg-[#64A9E8] px-5 py-3 font-semibold text-[#0E2440] transition hover:bg-[#85BDF0]">{t("browse")}<Arrow size={17} /></Link>
            <Link href="/catalog" className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 font-semibold text-white transition hover:bg-white/10"><Search size={16} />{t("searchBooks")}</Link>
          </div>
        </div>
        <div className="relative mt-10 hidden flex-1 justify-end lg:flex" aria-hidden="true">
          <div className="relative h-72 w-80">
            <div className="absolute bottom-2 end-2 h-60 w-40 rotate-[9deg] rounded-e-xl rounded-s-sm border-s-8 border-[#64A9E8] bg-[#E4EFFA] shadow-2xl" />
            <div className="absolute bottom-0 end-20 h-64 w-44 rotate-[-6deg] rounded-e-xl rounded-s-sm border-s-8 border-[#238F91] bg-[#D3E2EE] shadow-2xl">
              <div className="absolute inset-5 flex flex-col items-center justify-center border border-[#3A5A8C]/50 text-center text-[#142B4A]">
                <LibraryBig size={40} strokeWidth={1.3} /><span className="editorial-title mt-3 text-xl">Papertrail</span>
              </div>
            </div>
            <div className="absolute bottom-0 end-48 h-52 w-36 rotate-[3deg] rounded-e-xl rounded-s-sm border-s-8 border-[#8FB4DF] bg-[#EAF0F8] shadow-xl" />
          </div>
        </div>
      </section>
      <section className="mt-14">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="eyebrow">{t("featuredShelf")}</p><h2 className="editorial-title mt-2 text-3xl font-semibold">{t("featured")}</h2></div><Link href="/catalog" className="text-sm font-semibold text-brand">{t("all")}</Link></div>
        <BookCatalog limit={5} featured />
      </section>
      <section className="home-section-divider mt-16 border-t pt-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div><p className="eyebrow">{t("premiumShelf")}</p><h2 className="editorial-title mt-2 text-3xl font-semibold">{t("premiumCollection")}</h2></div>
          <Link href={{ pathname: "/catalog", query: { premium: "true" } }} className="text-sm font-semibold text-brand">{t("browsePremium")}</Link>
        </div>
        <BookCatalog limit={5} premiumOnly />
      </section>
      <section className="home-section-divider mt-16 border-t pt-10">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="eyebrow">{t("readerFavorites")}</p><h2 className="editorial-title mt-2 text-3xl font-semibold">{t("popular")}</h2></div><Link href="/catalog" className="text-sm font-semibold text-brand">{t("all")}</Link></div>
        <BookCatalog limit={5} ordering="-download_count" />
      </section>
      <section className="home-section-divider mt-16 border-t pt-10">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="eyebrow">{t("latest")}</p><h2 className="editorial-title mt-2 text-3xl font-semibold">{t("recent")}</h2></div><Link href="/catalog" className="text-sm font-semibold text-brand">{t("all")}</Link></div>
        <BookCatalog limit={4} />
      </section>
    </div>
  );
}
