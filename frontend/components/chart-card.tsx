import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LoadingSkeleton } from "@/components/loading-skeleton";

/**
 * Standard card shell for every dashboard analytics chart:
 * eyebrow + title + optional aside (link/badge), consistent padding,
 * built-in loading and empty states.
 */
export function AnalyticsChartCard({
  eyebrow,
  title,
  aside,
  isLoading = false,
  isEmpty = false,
  emptyMessage,
  children,
  className,
  bodyClassName,
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("chart-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h3 className="mt-1 text-base font-semibold tracking-tight text-ink">{title}</h3>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className={cn("mt-4 min-h-0 flex-1", bodyClassName)}>
        {isLoading ? (
          <LoadingSkeleton variant="chart" />
        ) : isEmpty ? (
          <p className="empty-panel !p-6 text-sm">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
