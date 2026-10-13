"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

export function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted" aria-label={label}>
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side="top" sideOffset={6} className="z-[70] max-w-xs rounded-[10px] border border-line bg-card px-3 py-2 text-sm leading-5 text-ink shadow-lift">
          {children}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
