"use client";

import { useSyncExternalStore } from "react";
import { clearTokens, getAccessToken } from "@/lib/api";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("library-auth", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("library-auth", callback);
  };
}

function getSnapshot() {
  return Boolean(getAccessToken());
}

export function useSession() {
  const authenticated = useSyncExternalStore(subscribe, getSnapshot, () => false);

  function signOut() {
    clearTokens();
  }

  function refresh() {
    window.dispatchEvent(new Event("library-auth"));
  }

  return { authenticated, signOut, refresh };
}
