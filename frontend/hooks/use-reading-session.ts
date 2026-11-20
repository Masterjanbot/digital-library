"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

const HEARTBEAT_MS = 30_000;

/**
 * Track a reader session for the open book.
 *
 * The server owns all time accounting: it only credits the gap between
 * heartbeats, and only while this tab is visible. Heartbeats are skipped
 * while the page is hidden, so backgrounded tabs never accrue reading time.
 * Sessions are owner-scoped on the backend; starting/heartbeating/ending is
 * best-effort and never blocks reading.
 */
export function useReadingSession(bookId: string | number, enabled: boolean) {
  const sessionId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function start() {
      try {
        const { data } = await api.post<{ id: number }>("/reading/sessions/", { book: Number(bookId) });
        if (cancelled) {
          // Unmounted before start resolved — close the fresh session so it is not orphaned.
          if (data?.id) void api.post(`/reading/sessions/${data.id}/end/`).catch(() => undefined);
          return;
        }
        sessionId.current = data.id;
      } catch {
        // Tracking disabled silently (403 / offline) — reading still works.
        sessionId.current = null;
      }
    }
    void start();

    const heartbeat = async () => {
      if (sessionId.current == null) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        await api.post(`/reading/sessions/${sessionId.current}/heartbeat/`);
      } catch {
        // best-effort
      }
    };

    const interval = window.setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const id = sessionId.current;
      sessionId.current = null;
      if (id != null) {
        void api.post(`/reading/sessions/${id}/end/`).catch(() => undefined);
      }
    };
  }, [bookId, enabled]);
}
