"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/admin/SignOutButton";

const LINKS = [
  ["/admin", "Overview"],
  ["/admin/onboarding", "Onboarding"],
  ["/admin/styles", "Styles"],
  ["/admin/services", "Services"],
  ["/admin/leads", "Leads"],
  ["/admin/bookings", "Bookings"],
  ["/admin/qr", "QR and embed"],
  ["/admin/billing", "Billing"],
  ["/admin/settings", "Settings"],
];

export function AdminNav({
  role,
  name,
  credits,
  slug,
  showAi,
  salons = [],
  currentTenantId = "",
}: {
  role: string;
  name: string;
  credits: number;
  slug: string;
  showAi: boolean;
  salons?: { id: string; name: string }[];
  currentTenantId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div>
      <button className="btn secondary mb-3 w-full md:hidden" type="button" data-ready={ready ? "yes" : "no"} aria-expanded={open} aria-controls="salon-nav" onClick={() => setOpen((value) => !value)}>
        {open ? "Close menu" : "Menu"}
      </button>
      <aside id="salon-nav" data-ready={ready ? "yes" : "no"} className={`${open ? "block" : "hidden"} nav-side h-fit rounded-[14px] p-4 md:block`}>
        <p className="text-sm uppercase tracking-[0.14em] text-[#d8cbe4]">{role}</p>
        <p className="font-serif text-2xl leading-tight">{name}</p>
        <p className="text-sm text-[#d8cbe4]">{credits} credits</p>
        {salons.length > 1 && (
          <label className="mt-3 block text-xs text-[#d8cbe4]">Salon
            <select
              className="field mt-1 text-sm text-[#1b1224]"
              aria-label="Switch salon"
              value={currentTenantId}
              onChange={(event) => {
                const tenantId = event.target.value;
                void fetch("/api/v1/admin/switch", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ tenantId }),
                }).then(() => {
                  window.location.href = "/admin";
                });
              }}
            >
              {salons.map((salon) => <option key={salon.id} value={salon.id}>{salon.name}</option>)}
            </select>
          </label>
        )}
        <nav className="mt-3 grid text-sm" aria-label="Salon">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
          ))}
          {showAi && <Link href="/admin/ai" onClick={() => setOpen(false)}>AI settings</Link>}
          {role === "OWNER" && <Link href="/admin/security" onClick={() => setOpen(false)}>Authenticator</Link>}
          <Link href={`/s/${slug}`} onClick={() => setOpen(false)}>View try-on</Link>
        </nav>
        <SignOutButton />
      </aside>
    </div>
  );
}
