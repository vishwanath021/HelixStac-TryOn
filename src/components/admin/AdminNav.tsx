"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { ownerNav, type OwnerFeatures } from "@/lib/features";

export function AdminNav({
  role,
  name,
  credits,
  slug,
  productTryOn,
  productQueue,
  onboardingDone = true,
  features,
  salons = [],
  currentTenantId = "",
}: {
  role: string;
  name: string;
  credits: number;
  slug: string;
  productTryOn: boolean;
  productQueue: boolean;
  onboardingDone?: boolean;
  features: OwnerFeatures;
  salons?: { id: string; name: string }[];
  currentTenantId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const links = ownerNav({ role, slug, productTryOn, productQueue, features, onboardingDone });
  const main = links.filter((link) => link.section === "main");
  const more = links.filter((link) => link.section === "more");
  return (
    <div>
      <button className="btn secondary mb-3 w-full md:hidden" type="button" data-ready={ready ? "yes" : "no"} aria-expanded={open} aria-controls="salon-nav" onClick={() => setOpen((value) => !value)}>
        {open ? "Close menu" : "Menu"}
      </button>
      <aside id="salon-nav" data-ready={ready ? "yes" : "no"} className={`${open ? "block" : "hidden"} nav-side h-fit rounded-[14px] p-4 md:block`}>
        <p className="text-sm uppercase tracking-[0.14em] text-[#d8cbe4]">{role}</p>
        <p className="font-serif text-2xl leading-tight">{name}</p>
        <p className="text-sm text-[#d8cbe4]">{credits.toLocaleString("en-IN")} try-ons left</p>
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
          {main.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>
          ))}
          <details className="mt-3">
            <summary className="cursor-pointer py-2 text-xs uppercase tracking-[0.14em] text-[#d8cbe4]">More</summary>
            <div className="grid">
              {more.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>
              ))}
            </div>
          </details>
        </nav>
        <SignOutButton />
      </aside>
    </div>
  );
}
