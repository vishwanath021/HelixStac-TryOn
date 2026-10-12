"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;

export function DropdownMenuContent({ children }: { children: React.ReactNode }) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content align="end" sideOffset={6} className="z-[60] min-w-44 rounded-[10px] border border-line bg-card p-1 shadow-lift">
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

export function DropdownMenuItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Dropdown.Item
      className="min-h-11 cursor-pointer rounded-[10px] px-3 py-2 text-sm outline-none data-[highlighted]:bg-sand"
      onSelect={onSelect}
    >
      {children}
    </Dropdown.Item>
  );
}
