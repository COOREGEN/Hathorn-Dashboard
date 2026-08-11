"use client";

import { Dialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[80] bg-[color:var(--ink)]/25 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-[14%] z-[90] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--paper)] p-5 shadow-[0_24px_60px_rgba(12,11,10,0.12)] outline-none transition duration-250 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0",
            className,
          )}
        >
          {title ? (
            <Dialog.Title className="mb-3 font-[family-name:var(--utility)] text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-mute)]">
              {title}
            </Dialog.Title>
          ) : null}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
