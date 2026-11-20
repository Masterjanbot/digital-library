import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" };

export function Button({ className, variant = "primary", ...props }: Props) {
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "bg-brand-light text-brand-dark hover:bg-brand-hover",
    ghost: "bg-transparent text-ink hover:bg-hover/5",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return <button className={cn("inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50", variants[variant], className)} {...props} />;
}
