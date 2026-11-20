import type { ReactNode } from "react";
import { BookOpenText, Feather } from "lucide-react";

/**
 * Shared dashboard identity header.
 * `hero` renders the full deep-forest welcome panel; otherwise a quiet
 * editorial heading row (used by management surfaces).
 * `artwork` (user dashboard only) paints a decorative reading motif in the
 * hero — opt-in so management surfaces stay unchanged.
 */
export function DashboardHeader({
  eyebrow,
  title,
  intro,
  chips,
  primaryAction,
  secondaryAction,
  variant = "hero",
  artwork = false,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  chips?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  variant?: "hero" | "quiet";
  artwork?: boolean;
}) {
  if (variant === "quiet") {
    return (
      <header className="dashboard-welcome">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="editorial-display mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
          {intro && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{intro}</p>}
        </div>
        {(primaryAction || secondaryAction) && (
          <div className="flex flex-wrap items-center gap-3">{secondaryAction}{primaryAction}</div>
        )}
      </header>
    );
  }
  return (
    <header className={`welcome-hero px-6 py-7 sm:px-8 sm:py-9${artwork ? " welcome-hero--art" : ""}`}>
      {artwork && (
        <div aria-hidden="true" className="hero-artwork">
          <div className="hero-art">
            <span className="hero-art-orb" />
            <span className="hero-art-ring" />
            <span className="hero-art-ring hero-art-ring-2" />
            <BookOpenText className="hero-art-icon" size={52} strokeWidth={1.15} />
            <span className="hero-art-tag"><Feather size={13} strokeWidth={2} /></span>
            <span className="hero-art-book hero-art-book-3" />
            <span className="hero-art-book hero-art-book-2" />
            <span className="hero-art-book hero-art-book-1" />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="editorial-display mt-2 text-3xl font-semibold leading-[1.12] tracking-tight text-[#F2F7FE] sm:text-4xl">{title}</h1>
          <span aria-hidden="true" className="welcome-hero-gold-rule mt-4" />
          {intro && <p className="mt-3 max-w-xl text-sm leading-6 text-[#C9D8EA]">{intro}</p>}
          {chips && <div className="mt-4 flex flex-wrap gap-2">{chips}</div>}
        </div>
        {(primaryAction || secondaryAction) && (
          <div className="flex flex-wrap items-center gap-3">{secondaryAction}{primaryAction}</div>
        )}
      </div>
    </header>
  );
}
