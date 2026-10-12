"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List className={cn("flex flex-wrap gap-1 border-b border-line", className)}>
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="min-h-11 rounded-t-[10px] px-3 text-sm font-medium text-muted data-[state=active]:border-b-2 data-[state=active]:border-aubergine data-[state=active]:text-ink"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  return <TabsPrimitive.Content value={value} className="pt-4">{children}</TabsPrimitive.Content>;
}
