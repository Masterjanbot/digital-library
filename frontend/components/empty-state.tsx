import type { LucideIcon } from "lucide-react";
import { BookOpen } from "lucide-react";
import type { ReactNode } from "react";

/** Library-flavored empty state: quiet icon, one line of guidance, optional action. */
export function EmptyState({
  icon: Icon = BookOpen,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-panel">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand dark:bg-slate-800">
        <Icon size={26} strokeWidth={1.6} />
      </span>
      {title && <p className="font-semibold text-ink">{title}</p>}
      <p className={title ? "mt-1" : undefined}>{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
