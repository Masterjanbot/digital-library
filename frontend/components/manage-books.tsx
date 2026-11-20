"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Activity, BookOpen, Check, ChevronLeft, ChevronRight, FilePlus2, Pencil, Search, Send, Sparkles, Trash2, Upload, X } from "lucide-react";
import axios from "axios";
import { api } from "@/lib/api";
import type { Book, Paginated } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useSession } from "@/hooks/use-session";
import { useRouter } from "@/i18n/routing";
import { DashboardNav } from "@/components/dashboard-nav";

type Option = { id: number; name: string };
const PAGE_SIZE = 10;

function apiError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data as Record<string, unknown> | undefined;
  if (!data) return fallback;
  const details = Object.values(data).flatMap((value) => Array.isArray(value) ? value : [value]);
  return details.map(String).join(" ") || fallback;
}

export function ManageBooks({ ownedOnly = false }: { ownedOnly?: boolean }) {
  const t = useTranslations("workspace");
  const nav = useTranslations("nav");
  const { authenticated } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ordering, setOrdering] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [editingBookId, setEditingBookId] = useState<number | null>(null);
  const submissionLock = useRef(false);
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<{ role: string }>("/auth/profile/")).data,
    enabled: authenticated,
  });
  const isCatalogManager = ["admin", "librarian", "editor"].includes(profile.data?.role || "");
  const isManager = !ownedOnly && isCatalogManager;
  const books = useQuery({
    queryKey: ["books", isManager ? "all" : "mine", search, statusFilter, ordering, page],
    queryFn: async () => (await api.get<Paginated<Book>>(isManager ? "/books/" : "/books/mine/", {
      params: {
        search: search || undefined,
        status: statusFilter || undefined,
        ordering,
        page,
        page_size: PAGE_SIZE,
      },
    })).data,
    enabled: authenticated && (!ownedOnly || profile.isSuccess),
  });
  const authors = useQuery({
    queryKey: ["authors"],
    queryFn: async () => (await api.get<Paginated<Option>>("/authors/", { params: { page_size: 100 } })).data.results,
    enabled: authenticated,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<Paginated<Option>>("/categories/", { params: { page_size: 100 } })).data.results,
    enabled: authenticated,
  });
  const createBook = useMutation({
    mutationFn: async ({ body }: { body: FormData }) => api.post<Book>("/books/", body, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (event) => {
        if (event.total) setProgress(Math.round((event.loaded / event.total) * 100));
      },
    }),
    onSuccess: async () => {
      setProgress(100);
      setMessage(t("saved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      const form = document.getElementById("book-upload-form") as HTMLFormElement | null;
      form?.reset();
      window.setTimeout(() => setProgress(0), 1200);
      submissionLock.current = false;
    },
    onError: (error) => {
      setProgress(0);
      setMessage(apiError(error, t("saveError")));
      submissionLock.current = false;
    },
  });
  const removeBook = useMutation({
    mutationFn: (id: number) => api.delete(`/books/${id}/`),
    onSuccess: async () => {
      setMessage(t("deleted"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error) => setMessage(apiError(error, t("deleteError"))),
  });
  const updateBook = useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<Book> }) => api.patch(`/books/${id}/`, values),
    onSuccess: async () => {
      setEditingBookId(null);
      setMessage(t("updated"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error) => setMessage(apiError(error, t("updateError"))),
  });

  if (!authenticated) {
    router.replace("/login");
    return null;
  }
  if (!ownedOnly && profile.isSuccess && !isCatalogManager) {
    return <div role="alert" className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t("accessDeniedTitle")}</h1>
      <p className="mt-3 text-slate-600">{t("accessDenied")}</p>
    </div>;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createBook.isPending || submissionLock.current) return;
    setMessage("");
    const form = event.currentTarget;
    const body = new FormData(form);
    const documentFile = body.get("document");
    const coverFile = body.get("cover");
    if (!(documentFile instanceof File) || !documentFile.size) {
      setMessage(t("pdfRequired"));
      return;
    }
    if (!documentFile.name.toLowerCase().endsWith(".pdf") || documentFile.type !== "application/pdf") {
      setMessage(t("invalidPdf"));
      return;
    }
    if (documentFile.size > 100 * 1024 * 1024) {
      setMessage(t("pdfTooLarge"));
      return;
    }
    if (coverFile instanceof File && coverFile.size) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(coverFile.type)) {
        setMessage(t("invalidCover"));
        return;
      }
      if (coverFile.size > 10 * 1024 * 1024) {
        setMessage(t("coverTooLarge"));
        return;
      }
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    body.set("status", submitter?.value === "published" && isCatalogManager ? "published" : "draft");
    if (!body.get("category")) body.delete("category");
    if (!body.get("publication_date")) body.delete("publication_date");
    if (!body.get("page_count")) body.delete("page_count");
    setProgress(0);
    submissionLock.current = true;
    createBook.mutate({ body });
  }

  function saveBook(event: React.FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const category = String(formData.get("category") || "");
    const pageCount = String(formData.get("page_count") || "");
    const publicationDate = String(formData.get("publication_date") || "");
    updateBook.mutate({
      id,
      values: {
        title: String(formData.get("title") || ""),
        subtitle: String(formData.get("subtitle") || ""),
        description: String(formData.get("description") || ""),
        isbn: String(formData.get("isbn") || "").trim() || null,
        language: String(formData.get("language") || "en"),
        publication_date: publicationDate || null,
        page_count: pageCount ? Number(pageCount) : null,
        category: category ? Number(category) : null,
        authors: formData.getAll("authors").map(Number),
        visibility: String(formData.get("visibility") || "public") as Book["visibility"],
        is_premium: formData.get("is_premium") === "on",
        is_featured: formData.get("is_featured") === "on",
        status: String(formData.get("status") || "draft") as Book["status"],
      },
    });
  }

  const totalPages = Math.max(1, Math.ceil((books.data?.count || 0) / PAGE_SIZE));
  const title = ownedOnly ? t("myBooks") : isManager ? t("manageBooks") : t("myBooks");

  return <div className="workspace-layout mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <aside className="dashboard-rail">
      <div className="dashboard-profile"><span className="dashboard-avatar"><BookOpen size={17} /></span><div><p className="font-semibold">{nav("dashboard")}</p><p className="text-xs text-slate-500">{profile.data?.role || t("account")}</p></div></div>
      <DashboardNav canManage={isCatalogManager} canManageUsers={profile.data?.role === "admin"} />
    </aside>
    <div className="min-w-0">
      <div className="dashboard-welcome">
        <div><p className="eyebrow">{t("collection")}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("intro")}</p></div>
        <a href="#add-book" className="button-link"><FilePlus2 size={16} />{t("addBook")}</a>
      </div>
      {profile.isError && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{t("profileError")}</p>}

      {isCatalogManager && <section id="add-book" className="dashboard-panel mt-7 scroll-mt-24">
        <div className="mb-5 flex items-start gap-3">
          <span className="section-icon"><Upload size={19} /></span>
          <div><p className="eyebrow">{t("newEntry")}</p><h2 className="mt-1 text-xl font-semibold">{t("uploadTitle")}</h2>          <p className="mt-1 text-sm text-slate-500">{isCatalogManager ? t("managerHint") : t("draftHint")}</p></div>
        </div>
        <form id="book-upload-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <label className="form-label">{t("title")}<Field name="title" required maxLength={250} /></label>
          <label className="form-label">{t("subtitle")}<Field name="subtitle" maxLength={250} /></label>
          <label className="form-label md:col-span-2">{t("description")}<textarea name="description" rows={4} maxLength={10000} className="form-control resize-y" /></label>
          <label className="form-label">{t("authors")}
            <select name="authors" multiple size={4} className="form-control">
              {authors.data?.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
            </select>
            <span className="font-normal text-slate-400">{t("authorHint")}</span>
          </label>
          <label className="form-label">{t("category")}
            <select name="category" defaultValue="" className="form-control"><option value="">{t("noCategory")}</option>{categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          </label>
          <label className="form-label">{t("language")}<Field name="language" defaultValue="en" maxLength={20} /></label>
          <label className="form-label">{t("publicationDate")}<Field name="publication_date" type="date" /></label>
          <label className="form-label">{t("pages")}<Field name="page_count" type="number" min={1} max={100000} /></label>
          <label className="form-label">{t("isbn")}<Field name="isbn" maxLength={20} /></label>
          <label className="form-label">{t("cover")}<input className="form-file" name="cover" type="file" accept="image/jpeg,image/png,image/webp" /></label>
          <label className="form-label">{t("pdf")}<input className="form-file" name="document" type="file" accept="application/pdf,.pdf" required /></label>
          <label className="form-label">{t("visibility")}
            <select className="form-control" name="visibility" defaultValue="public"><option value="public">{t("public")}</option><option value="private">{t("private")}</option></select>
          </label>
          {isCatalogManager && <div className="flex flex-wrap gap-4 self-end pb-3">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="is_premium" value="true" className="accent-brand" />{t("premium")}</label>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="is_featured" value="true" className="accent-brand" />{t("featured")}</label>
          </div>}
          {createBook.isPending && <div className="md:col-span-2" aria-live="polite">
            <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{t("uploading")}</span><span>{progress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} /></div>
          </div>}
          {message && <p role={createBook.isError ? "alert" : "status"} className={`md:col-span-2 rounded-xl p-3 text-sm ${createBook.isError ? "bg-red-50 text-red-700" : "bg-brand-light text-brand-dark"}`}>{message}</p>}
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" value="draft" disabled={createBook.isPending}><FilePlus2 size={16} />{createBook.isPending ? `${t("uploading")} ${progress}%` : t("saveDraft")}</Button>
            {isCatalogManager && <Button type="submit" value="published" disabled={createBook.isPending}><Check size={16} />{t("publish")}</Button>}
          </div>
        </form>
      </section>}

      <section className="dashboard-panel mt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow">{t("collection")}</p><h2 className="mt-1 text-xl font-semibold">{ownedOnly || !isManager ? t("myBooks") : t("allBooks")}</h2></div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(190px,1fr)_150px_150px]">
            <label className="relative"><Search className="absolute start-3 top-3 text-slate-400" size={16} /><Field value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("search")} className="ps-9" /></label>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} aria-label={t("filterStatus")} className="form-control"><option value="">{t("allStatuses")}</option><option value="draft">{t("draft")}</option><option value="published">{t("published")}</option></select>
            <select value={ordering} onChange={(event) => { setOrdering(event.target.value); setPage(1); }} aria-label={t("sort")} className="form-control"><option value="-created_at">{t("newest")}</option><option value="title">{t("titleAscending")}</option><option value="-title">{t("titleDescending")}</option></select>
          </div>
        </div>
        {message && !createBook.isError && <p role="status" className="mt-4 rounded-lg bg-brand-light p-3 text-sm text-brand-dark">{message}</p>}
        {books.isError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{t("loadError")}</p>}
        {books.isLoading ? <div className="loading-skeleton mt-5 h-24" /> : books.data?.results.length ? <div className="mt-5 divide-y divide-slate-100">
          {books.data.results.map((book) => <article key={book.id} className="border-b border-slate-100 py-4 last:border-b-0">
            {isCatalogManager && editingBookId === book.id ? <form onSubmit={(event) => saveBook(event, book.id)} className="grid gap-3 md:grid-cols-2">
              <label className="form-label">{t("title")}<Field name="title" defaultValue={book.title} required maxLength={250} /></label>
              <label className="form-label">{t("subtitle")}<Field name="subtitle" defaultValue={book.subtitle} maxLength={250} /></label>
              <label className="form-label md:col-span-2">{t("description")}<textarea name="description" defaultValue={book.description} rows={3} maxLength={10000} className="form-control resize-y" /></label>
              <label className="form-label">{t("authors")}
                <select name="authors" multiple defaultValue={book.authors.map(String)} size={3} className="form-control">
                  {authors.data?.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
                </select>
              </label>
              <label className="form-label">{t("category")}
                <select name="category" defaultValue={book.category ?? ""} className="form-control"><option value="">{t("noCategory")}</option>{categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              </label>
              <label className="form-label">{t("language")}<Field name="language" defaultValue={book.language} maxLength={20} /></label>
              <label className="form-label">{t("publicationDate")}<Field name="publication_date" type="date" defaultValue={book.publication_date || ""} /></label>
              <label className="form-label">{t("pages")}<Field name="page_count" type="number" min={1} max={100000} defaultValue={book.page_count || ""} /></label>
              <label className="form-label">{t("isbn")}<Field name="isbn" defaultValue={book.isbn || ""} maxLength={20} /></label>
              <label className="form-label">{t("visibility")}
                <select className="form-control" name="visibility" defaultValue={book.visibility}><option value="public">{t("public")}</option><option value="private">{t("private")}</option></select>
              </label>
              {isCatalogManager && <>
                <label className="form-label">{t("status")}
                  <select className="form-control" name="status" defaultValue={book.status}><option value="draft">{t("draft")}</option><option value="published">{t("published")}</option></select>
                </label>
                <div className="flex flex-wrap gap-4 self-end pb-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_premium" defaultChecked={book.is_premium} />{t("premium")}</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_featured" defaultChecked={book.is_featured} />{t("featured")}</label>
                </div>
              </>}
              <p className="self-end pb-2 text-xs text-slate-500">{t("filesPreserved")}</p>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button type="submit" disabled={updateBook.isPending}><Check size={15} />{updateBook.isPending ? t("updating") : t("saveChanges")}</Button>
                <Button type="button" variant="secondary" disabled={updateBook.isPending} onClick={() => setEditingBookId(null)}><X size={15} />{t("cancelEdit")}</Button>
              </div>
            </form> : <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="section-icon"><BookOpen size={18} /></span>
              <div className="min-w-0"><h3 className="truncate font-semibold">{book.title}</h3><p className="mt-1 truncate text-xs text-slate-500">{book.authors_display.join(", ") || t("unknownAuthor")} · {book.category_name || t("uncategorized")}</p></div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className={`status-pill ${book.status === "published" ? "status-published" : "status-draft"}`}>{book.status === "published" ? t("published") : t("draft")}</span>
              {book.is_featured && <span className="status-pill status-featured">{t("featured")}</span>}
              <span className="hidden text-xs text-slate-400 sm:inline">{new Date(book.created_at).toLocaleDateString()}</span>
              {isCatalogManager && <Button type="button" variant="secondary" aria-label={`${t("edit")} ${book.title}`} disabled={updateBook.isPending} onClick={() => setEditingBookId(book.id)}><Pencil size={14} /><span className="hidden sm:inline">{t("edit")}</span></Button>}
              {isCatalogManager && book.status === "draft" && <Button type="button" variant="secondary" disabled={updateBook.isPending} onClick={() => updateBook.mutate({ id: book.id, values: { status: "published" } })}><Send size={14} />{t("publish")}</Button>}
              {isCatalogManager && <Button type="button" variant="ghost" aria-label={book.is_featured ? t("unfeature") : t("feature")} disabled={updateBook.isPending} onClick={() => updateBook.mutate({ id: book.id, values: { is_featured: !book.is_featured } })}><Sparkles size={15} /></Button>}
              {isCatalogManager && book.is_premium && <span className="status-pill">{t("premium")}</span>}
              {isCatalogManager && <Button type="button" variant="danger" aria-label={`${t("delete")} ${book.title}`} disabled={removeBook.isPending} onClick={() => { if (window.confirm(`${t("confirmDelete")} “${book.title}”?`)) removeBook.mutate(book.id); }}><Trash2 size={15} /></Button>}
            </div>
            </div>}
          </article>)}
        </div> : <div className="empty-panel mt-5"><Activity size={21} className="mx-auto mb-2 text-brand" />{t("emptyBooks")}</div>}
        {!!books.data?.count && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">{books.data.count} · {t("page")} {page} / {totalPages}</p>
          <div className="flex gap-2"><Button type="button" variant="secondary" disabled={page <= 1} aria-label={t("previous")} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} />{t("previous")}</Button><Button type="button" variant="secondary" disabled={page >= totalPages} aria-label={t("next")} onClick={() => setPage((value) => value + 1)}>{t("next")}<ChevronRight size={16} /></Button></div>
        </div>}
      </section>
    </div>
  </div>;
}
