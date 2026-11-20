import { cn } from "@/lib/utils";

/** Pulsing placeholders for cards, charts, rows and text lines. */
export function LoadingSkeleton({
  variant = "lines",
  rows = 3,
  className,
}: {
  variant?: "lines" | "chart" | "cards" | "table";
  rows?: number;
  className?: string;
}) {
  if (variant === "chart") {
    return (
      <div aria-hidden="true" className={cn("flex h-[190px] items-end gap-2", className)}>
        {[58, 32, 74, 46, 88, 64, 40, 70, 96, 52, 62, 80, 44, 68].map((height, index) => (
          <div key={index} className="loading-skeleton min-w-0 flex-1" style={{ height: `${height}%` }} />
        ))}
      </div>
    );
  }
  if (variant === "cards") {
    return (
      <div aria-hidden="true" className={cn("grid gap-3 sm:grid-cols-2", className)}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="loading-skeleton h-28" />
        ))}
      </div>
    );
  }
  if (variant === "table") {
    return (
      <div aria-hidden="true" className={cn("space-y-2", className)}>
        <div className="loading-skeleton h-9" />
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="loading-skeleton h-12 opacity-80" />
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="loading-skeleton h-4" style={{ width: `${88 - index * 17}%` }} />
      ))}
    </div>
  );
}
