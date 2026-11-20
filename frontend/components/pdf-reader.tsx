"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useRouter } from "@/i18n/routing";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, Maximize, Minus, MoveHorizontal, Plus, Search, StickyNote, TextQuote } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { useReadingSession } from "@/hooks/use-reading-session";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { Book } from "@/lib/types";

type Progress = { id: number; book: number; current_page: number; percentage: string };
type RenderedPage = { scale: number; task: RenderTask | null };

export function PdfReader({ bookId }: { bookId: string }) {
  const t = useTranslations("reader");
  const locale = useLocale();
  const router = useRouter();
  const { authenticated } = useSession();
  const { data: book } = useQuery({ queryKey: ["book", bookId], queryFn: async () => (await api.get<Book>(`/books/${bookId}/`)).data });
  const frame = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const pageElements = useRef(new Map<number, HTMLElement>());
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  const renderedPages = useRef(new Map<number, RenderedPage>());
  const renderVersions = useRef(new Map<number, number>());
  const renderVersionCounter = useRef(0);
  const currentPageRef = useRef(1);
  const initialPage = useRef(1);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageText, setPageText] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    currentPageRef.current = page;
  }, [page]);

  useEffect(() => {
    if (!authenticated) {
      router.replace("/login");
      return;
    }
    const renderedPageMap = renderedPages.current;
    const renderVersionMap = renderVersions.current;
    const pageElementMap = pageElements.current;
    const canvasMap = canvases.current;
    let active = true;
    async function load() {
      try {
        const [file, progressResponse] = await Promise.all([
          api.get(`/books/${bookId}/document/`, { responseType: "arraybuffer" }),
          api.get("/reading-progress/", { params: { book: bookId, page_size: 100 } }),
        ]);
        if (!active) return;
        const record = progressResponse.data.results?.find((item: Progress) => String(item.book) === bookId) as Progress | undefined;
        if (record) {
          setProgress(record);
          initialPage.current = record.current_page;
          setPage(record.current_page);
          setPageInput(String(record.current_page));
        }
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const document = await pdfjs.getDocument({ data: new Uint8Array(file.data) }).promise;
        if (!active) {
          await document.destroy();
          return;
        }
        pdfRef.current = document;
        setPageCount(document.numPages);
        const restoredPage = Math.max(1, Math.min(initialPage.current, document.numPages));
        initialPage.current = restoredPage;
        setPage(restoredPage);
        setPageInput(String(restoredPage));
        setReady(true);
      } catch (loadError) {
        if (active) setError(axios.isAxiosError(loadError) && loadError.response?.status === 403 ? t("premium") : t("loadError"));
      }
    }
    void load();
    return () => {
      active = false;
      for (const rendered of renderedPageMap.values()) rendered.task?.cancel();
      renderedPageMap.clear();
      renderVersionMap.clear();
      pageElementMap.clear();
      canvasMap.clear();
      const document = pdfRef.current;
      pdfRef.current = null;
      if (document) void document.destroy();
    };
  }, [authenticated, bookId, router, t]);

  useEffect(() => {
    if (ready) pageElements.current.get(initialPage.current)?.scrollIntoView({ block: "start" });
  }, [ready]);

  const renderPage = useCallback(async (pageNumber: number) => {
    const pdf = pdfRef.current;
    const canvas = canvases.current.get(pageNumber);
    if (!pdf || !canvas || !scrollArea.current) return;
    const version = ++renderVersionCounter.current;
    renderVersions.current.set(pageNumber, version);
    const previous = renderedPages.current.get(pageNumber);
    previous?.task?.cancel();
    try {
      const pdfPage = await pdf.getPage(pageNumber);
      if (
        !pdfRef.current
        || canvases.current.get(pageNumber) !== canvas
        || renderVersions.current.get(pageNumber) !== version
      ) return;
      const originalViewport = pdfPage.getViewport({ scale: 1 });
      const fittedScale = Math.min(1.6, Math.max(0.25, (containerWidth || scrollArea.current.clientWidth - 48) / originalViewport.width));
      const effectiveScale = fitWidth ? fittedScale : scale;
      if (previous?.scale === effectiveScale && !previous.task) return;
      const viewport = pdfPage.getViewport({ scale: effectiveScale });
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not available.");
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const task = pdfPage.render({ canvasContext: context, viewport });
      renderedPages.current.set(pageNumber, { scale: effectiveScale, task });
      await task.promise;
      if (renderVersions.current.get(pageNumber) === version) {
        renderedPages.current.set(pageNumber, { scale: effectiveScale, task: null });
      }
    } catch (renderError) {
      if (renderError instanceof Error && renderError.name === "RenderingCancelledException") return;
      if (renderVersions.current.get(pageNumber) !== version) return;
      setError(renderError instanceof Error ? renderError.message : t("loadError"));
    }
  }, [containerWidth, fitWidth, scale, t]);

  useEffect(() => {
    const element = scrollArea.current;
    if (!element) return;
    const updateWidth = () => setContainerWidth(element.clientWidth - 48);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    if (!ready || !pageCount || !scrollArea.current) return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.page);
        ratios.set(pageNumber, entry.isIntersecting ? entry.intersectionRatio : 0);
        if (entry.isIntersecting) {
          void renderPage(pageNumber);
          void renderPage(pageNumber - 1);
          void renderPage(pageNumber + 1);
        }
      }
      const visible = [...ratios.entries()].filter(([, ratio]) => ratio > 0).sort((a, b) => b[1] - a[1])[0];
      const activePage = visible?.[0] ?? currentPageRef.current;
      if (visible) {
        currentPageRef.current = activePage;
        setPage(activePage);
        setPageInput(String(activePage));
      }
      const pagesWithRenderState = new Set([
        ...renderedPages.current.keys(),
        ...renderVersions.current.keys(),
      ]);
      for (const renderedPage of pagesWithRenderState) {
        if (Math.abs(renderedPage - activePage) <= 2) continue;
        renderVersions.current.delete(renderedPage);
        const rendered = renderedPages.current.get(renderedPage);
        rendered?.task?.cancel();
        renderedPages.current.delete(renderedPage);
        const canvas = canvases.current.get(renderedPage);
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
          canvas.style.width = "";
          canvas.style.height = "";
        }
      }
    }, { root: scrollArea.current, rootMargin: "240px 0px", threshold: [0, 0.15, 0.35, 0.6, 0.85] });
    for (const element of pageElements.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [pageCount, ready, renderPage]);

  useEffect(() => {
    let active = true;
    async function readCurrentPageText() {
      if (!ready || !pdfRef.current || page < 1 || page > pageCount) return;
      try {
        const content = await (await pdfRef.current.getPage(page)).getTextContent();
        if (active) setPageText(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      } catch {
        if (active) setPageText("");
      }
    }
    void readCurrentPageText();
    return () => { active = false; };
  }, [page, pageCount, ready]);

  const goToPage = useCallback((nextPage: number) => {
    if (!Number.isInteger(nextPage) || !pageCount) return;
    const target = Math.max(1, Math.min(pageCount || 1, nextPage));
    currentPageRef.current = target;
    setPage(target);
    setPageInput(String(target));
    pageElements.current.get(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    void renderPage(target);
  }, [pageCount, renderPage]);

  useEffect(() => {
    if (!ready || !pageCount) return;
    const timer = window.setTimeout(async () => {
      try {
        if (progress) {
          await api.patch(`/reading-progress/${progress.id}/`, { current_page: page });
        } else {
          const response = await api.post<Progress>("/reading-progress/", { book: Number(bookId), current_page: page });
          setProgress(response.data);
        }
      } catch {
        setNotice(t("progressError"));
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [bookId, page, pageCount, progress, ready, t]);

  // Reading-session tracking: server accumulates time from heartbeats only,
  // and only while this tab is visible. Never blocks reading.
  useReadingSession(bookId, ready);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
        || target?.isContentEditable
        || target?.matches("input, textarea, select, button, [role=button]")
      ) return;
      if (event.key === "PageDown" || event.key === "ArrowDown") {
        event.preventDefault();
        goToPage(currentPageRef.current + 1);
      } else if (event.key === "PageUp" || event.key === "ArrowUp") {
        event.preventDefault();
        goToPage(currentPageRef.current - 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToPage]);

  async function saveBookmark() {
    try {
      await api.post("/bookmarks/", { book: Number(bookId), page, label: "" });
      setNotice(t("bookmarkSaved"));
    } catch { setNotice(t("bookmarkError")); }
  }

  async function saveNote() {
    const content = window.prompt(t("notePrompt"));
    if (!content?.trim()) return;
    try {
      await api.post("/notes/", { book: Number(bookId), page, content });
      setNotice(t("noteSaved"));
    } catch { setNotice(t("noteError")); }
  }

  async function saveHighlight() {
    const selected = window.getSelection()?.toString().trim();
    if (!selected) { setNotice(t("selectText")); return; }
    try {
      await api.post("/highlights/", { book: Number(bookId), page, text: selected, color: "yellow" });
      setNotice(t("highlightSaved"));
    } catch { setNotice(t("highlightError")); }
  }

  async function searchText(event: React.FormEvent) {
    event.preventDefault();
    if (!search.trim() || !pdfRef.current) return;
    const needle = search.toLocaleLowerCase();
    try {
      for (let candidate = 1; candidate <= pageCount; candidate += 1) {
        const content = await (await pdfRef.current.getPage(candidate)).getTextContent();
        if (content.items.some((item) => "str" in item && item.str.toLocaleLowerCase().includes(needle))) {
          goToPage(candidate);
          setNotice(t("foundPage", { page: candidate }));
          return;
        }
      }
      setNotice(t("notFound"));
    } catch { setNotice(t("searchError")); }
  }

  if (!authenticated) return <p className="p-16 text-center">{t("loadError")}</p>;
  return <div ref={frame} className="reader-shell mx-auto max-w-[1500px] px-3 py-3 sm:px-6 sm:py-4">
    <div className="reader-toolbar mb-2 sm:mb-3">
      <div className="reader-book-heading">
        <div className="min-w-0">
          <p className="eyebrow">{t("nowReading")}</p>
          <h1 className="mt-0.5 truncate text-base font-semibold sm:text-lg">{book?.title || t("title")}</h1>
        </div>
        <div className="reader-zoom-controls">
          <Button className="reader-icon-button" variant="ghost" aria-label={t("zoomOut")} onClick={() => { setFitWidth(false); setScale((value) => Math.max(0.5, value - 0.15)); }}><Minus size={17} /></Button>
          <span className="reader-zoom-level tabular-nums">{fitWidth ? t("fit") : `${Math.round(scale * 100)}%`}</span>
          <Button className="reader-icon-button" variant="ghost" aria-label={t("zoomIn")} onClick={() => { setFitWidth(false); setScale((value) => Math.min(2.5, value + 0.15)); }}><Plus size={17} /></Button>
          <Button className="reader-icon-button" variant={fitWidth ? "secondary" : "ghost"} aria-label={t("fitWidth")} onClick={() => setFitWidth(true)}><MoveHorizontal size={17} /></Button>
          <Button className="reader-icon-button" variant="ghost" aria-label={t("fullscreen")} onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void frame.current?.requestFullscreen();
          }}><Maximize size={17} /></Button>
        </div>
      </div>
      <div className="reader-toolbar-controls">
        <div className="reader-page-controls">
          <Button variant="secondary" disabled={page <= 1} aria-label={t("previous")} onClick={() => goToPage(currentPageRef.current - 1)}>{locale === "en" ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}<span className="hidden sm:inline">{t("previous")}</span></Button>
          <label className="flex items-center gap-2 text-sm"><span>{t("page")}</span><Field type="number" min={1} max={pageCount || undefined} step={1} value={pageInput} onChange={(event) => setPageInput(event.currentTarget.value)} onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (Number.isInteger(next) && next >= 1 && next <= pageCount) goToPage(next);
            else setPageInput(String(page));
          }} onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const next = Number(event.currentTarget.value);
              if (Number.isInteger(next) && next >= 1 && next <= pageCount) goToPage(next);
              else setPageInput(String(page));
              event.currentTarget.blur();
            }
          }} className="w-[4.5rem] py-2 text-center" /><span>{t("of")} {pageCount || "—"}</span></label>
          <Button variant="secondary" disabled={pageCount > 0 && page >= pageCount} aria-label={t("next")} onClick={() => goToPage(currentPageRef.current + 1)}><span className="hidden sm:inline">{t("next")}</span>{locale === "en" ? <ArrowRight size={17} /> : <ArrowLeft size={17} />}</Button>
        </div>
        <form onSubmit={searchText} className="reader-search">
          <Field value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search")} className="min-w-0 py-2" />
          <Button type="submit" variant="secondary" aria-label={t("search")}><Search size={16} /></Button>
        </form>
        <div className="reader-actions">
          <Button variant="ghost" aria-label={t("bookmark")} onClick={saveBookmark}><Bookmark size={17} /></Button>
          <Button variant="ghost" aria-label={t("note")} onClick={saveNote}><StickyNote size={17} /></Button>
          <Button variant="ghost" aria-label={t("highlight")} onClick={saveHighlight}><TextQuote size={17} /></Button>
        </div>
      </div>
    </div>
    {notice && <p role="status" className="mb-3 rounded-lg bg-brand-light px-4 py-2 text-sm text-brand-dark">{notice}</p>}
    {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
    <div ref={scrollArea} className="reader-pages" aria-label={t("documentPages")} tabIndex={0}>
      {!ready && !error ? <div className="flex h-[60vh] items-center justify-center text-slate-400">{t("opening")}</div> : Array.from({ length: pageCount }, (_, index) => {
        const pageNumber = index + 1;
        return <section
          key={pageNumber}
          ref={(element) => { if (element) pageElements.current.set(pageNumber, element); else pageElements.current.delete(pageNumber); }}
          data-page={pageNumber}
          aria-label={`${t("page")} ${pageNumber}`}
          className="pdf-page"
        >
          <canvas
            ref={(element) => { if (element) canvases.current.set(pageNumber, element); else canvases.current.delete(pageNumber); }}
            className="block h-auto max-w-none bg-white shadow-lg"
          />
          <span className="pdf-page-number">{pageNumber} / {pageCount}</span>
        </section>;
      })}
    </div>
    {pageText && <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><TextQuote size={16} />{t("pageText")}</summary>
      <p className="mt-3 select-text whitespace-pre-wrap text-sm leading-7 text-slate-700">{pageText}</p>
    </details>}
    <div className="reader-key-hint mt-3 hidden items-center justify-center gap-5 text-xs text-slate-400 sm:flex">
      <span className="inline-flex items-center gap-1"><ArrowUp size={13} /> {t("previous")}</span>
      <span className="inline-flex items-center gap-1"><ArrowDown size={13} /> {t("next")}</span>
      <span>{t("scrollHint")}</span>
    </div>
  </div>;
}
