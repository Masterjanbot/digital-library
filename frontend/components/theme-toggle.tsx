"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";

const THEME_STORAGE_KEY = "papertrail-theme";
const THEME_CHANGE_EVENT = "papertrail-theme-change";

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeToggle() {
  const t = useTranslations("nav");
  const [isDark, setIsDark] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function syncTheme() {
      try {
        const preference = window.localStorage.getItem(THEME_STORAGE_KEY);
        const nextIsDark = preference === "dark" || (preference !== "light" && media.matches);
        applyTheme(nextIsDark);
        setIsDark(nextIsDark);
        setSaveError(false);
      } catch (error) {
        console.error("Could not read the saved theme preference.", error);
        applyTheme(media.matches);
        setIsDark(media.matches);
        setSaveError(true);
      }
    }
    function syncThemeFromDocument() {
      setIsDark(document.documentElement.classList.contains("dark"));
    }

    syncTheme();
    media.addEventListener("change", syncTheme);
    window.addEventListener("storage", syncTheme);
    window.addEventListener(THEME_CHANGE_EVENT, syncThemeFromDocument);
    return () => {
      media.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener(THEME_CHANGE_EVENT, syncThemeFromDocument);
    };
  }, []);

  function toggleTheme() {
    const nextIsDark = !document.documentElement.classList.contains("dark");
    applyTheme(nextIsDark);
    setIsDark(nextIsDark);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    setSaveError(false);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextIsDark ? "dark" : "light");
    } catch (error) {
      console.error("Could not save the theme preference.", error);
      setSaveError(true);
    }
  }

  return (
    <>
      <button
        type="button"
        className="theme-toggle"
        aria-label={isDark ? t("lightMode") : t("darkMode")}
        aria-pressed={isDark}
        title={isDark ? t("lightMode") : t("darkMode")}
        onClick={toggleTheme}
      >
        {isDark ? <Sun size={17} /> : <Moon size={17} />}
        <span className="hidden lg:inline">{isDark ? t("lightMode") : t("darkMode")}</span>
      </button>
      {saveError && <span className="sr-only" role="status">{t("themeSaveError")}</span>}
    </>
  );
}
