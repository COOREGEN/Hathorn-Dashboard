"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "ghost" | "solid" | "hairline" | "brand";
    size?: "sm" | "md" | "icon";
  }
>(function Button({ className, variant = "ghost", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-[family-name:var(--utility)] font-medium transition-colors duration-150 ease-out disabled:opacity-40",
        size === "sm" && "h-8 px-3 text-[11px] tracking-wide",
        size === "md" && "h-9 px-3.5 text-[12px]",
        size === "icon" && "h-9 w-9",
        variant === "ghost" && "rounded-[10px] text-[color:var(--ink-soft)] hover:bg-[color:var(--brand-tint)] hover:text-[color:var(--ink)]",
        variant === "hairline" && "rounded-[10px] border border-[color:var(--hairline)] bg-transparent text-[color:var(--ink-soft)] hover:border-[color:var(--brand)]",
        variant === "solid" && "rounded-[10px] bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--brand-deep)]",
        variant === "brand" && "rounded-[10px] bg-[color:var(--brand)] text-[color:var(--paper)] hover:bg-[color:var(--brand-deep)]",
        className,
      )}
      {...props}
    />
  );
});
