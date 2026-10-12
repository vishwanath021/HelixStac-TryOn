"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { LookuviMark } from "@/components/brand/LookuviMark";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { Toaster } from "@/components/ui/toaster";

const LINKS = [
  { href: "/super", label: "Overview" },
  { href: "/super/salons", label: "Salons" },
  { href: "/super/ai", label: "AI" },
  { href: "/super/costs", label: "Spend & costs" },
  { href: "/super/security", label: "Security" },
  { href: "/super/audit", label: "Audit log" },
];

function current(pathname: string, href: string) {
  if (href === "/super") return pathname === "/super";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SuperShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Platform">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={current(pathname, link.href) ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="md:grid md:min-h-screen md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="nav-side hidden md:flex md:flex-col md:gap-4 md:px-3 md:py-4">
          <div className="flex items-center gap-2 px-2 text-white">
            <LookuviMark className="h-9 w-9" tone="inverse" />
            <span className="font-sans text-xl font-semibold tracking-tight">lookuvi</span>
          </div>
          {nav}
          <div className="mt-auto">
            <SignOutButton />
          </div>
        </aside>
        <div className="nav-side md:hidden">
          <div className="flex items-center gap-2 px-3 py-3 text-white">
            <LookuviMark className="h-9 w-9" tone="inverse" />
            <span className="font-sans text-xl font-semibold">lookuvi</span>
            <button className="btn secondary ml-auto" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              Menu
            </button>
          </div>
          {open ? <div className="px-3 pb-3">{nav}</div> : null}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
      <Toaster />
    </Tooltip.Provider>
  );
}
