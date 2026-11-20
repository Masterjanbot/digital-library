import { BookCatalog } from "@/components/book-catalog";
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ premium?: string | string[] }> }) {
  const params = await searchParams;
  const premiumOnly = params.premium === "true";
  return <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><BookCatalog premiumOnly={premiumOnly} /></div>;
}
