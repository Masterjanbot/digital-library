import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "forest" | "sage" | "gold" | "clay";

const tileClass: Record<Accent, string> = {
  forest: "icon-tile icon-tile-forest",
  sage: "icon-tile icon-tile-sage",
  gold: "icon-tile icon-tile-gold",
  clay: "icon-tile icon-tile-clay",
};

/**
 * Elegant KPI card: icon tile, label, readable number, optional hint.
 * Numbers use tabular figures; hover raises the card.
 */
export function DashboardStatsCard({
  label,
  value,
  icon: Icon,
  accent = "forest",
  hint,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent?: Accent;
  hint?: string;
}) {
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <article className="metric-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[.8rem] font-medium leading-5 text-slate-500 dark:text-slate-400">{label}</span>
        <span className={cn(tileClass[accent], "!h-9 !w-9")}>
          <Icon size={17} strokeWidth={1.9} />
        </span>
      </div>
      <p className="mt-3 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-ink">{display}</p>
      {hint && <p className="stat-sub">{hint}</p>}
    </article>
  );
}
