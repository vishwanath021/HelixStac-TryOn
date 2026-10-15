"use client";

import { useMemo, useState } from "react";
import { PLANS, type PlanId } from "@/data/plans";
import type { SalonRecord } from "@/lib/super/directory";
import { Badge, statusTone } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { formatIst } from "@/lib/display";

function applySalonPatch(row: SalonRecord, body: Record<string, unknown>): SalonRecord {
  return {
    ...row,
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    ...(typeof body.productTryOn === "boolean" ? { productTryOn: body.productTryOn } : {}),
    ...(typeof body.productQueue === "boolean" ? { productQueue: body.productQueue } : {}),
  };
}

function when(value: string | null) {
  if (!value) return "—";
  return formatIst(value, false);
}

function slugFromName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function SalonsBoard({ rows: initial }: { rows: SalonRecord[] }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<SalonRecord | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [createPlan, setCreatePlan] = useState<PlanId>("STARTER");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [nextPlan, setNextPlan] = useState<PlanId>("STARTER");
  const [delta, setDelta] = useState("50");
  const [reason, setReason] = useState("");
  const [goodwillConfirm, setGoodwillConfirm] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (plan && row.plan !== plan) return false;
      if (status && row.status !== status) return false;
      if (!needle) return true;
      return row.name.toLowerCase().includes(needle) || row.slug.toLowerCase().includes(needle);
    });
  }, [rows, query, plan, status]);

  function say(text: string, ok = true) {
    setNotice(text);
    toast(text, ok);
  }

  function openSalon(row: SalonRecord) {
    setSelected(row);
  }

  function openPlan(row: SalonRecord) {
    setSelected(row);
    setNextPlan(row.plan === "LITE" || row.plan === "STARTER" || row.plan === "PRO" ? row.plan : "STARTER");
    setPlanOpen(true);
  }

  function openCredits(row: SalonRecord) {
    setSelected(row);
    setDelta("50");
    setReason("");
    setGoodwillConfirm(false);
    setCreditOpen(true);
  }

  function openSuspend(row: SalonRecord) {
    setSelected(row);
    setSuspendOpen(true);
  }

  async function createSalon(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const res = await fetch("/api/v1/super/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug, plan: createPlan, ownerEmail: ownerEmail || undefined, ownerPassword: ownerPassword || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      say(data.message || "Could not create that salon.", false);
      return;
    }
    say(`Created ${data.slug}.`);
    window.location.reload();
  }

  async function update(id: string, body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/v1/super/tenants/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      say(data.message || "Could not update that salon.", false);
      return false;
    }
    const text = data.plan ? `Plan set to ${data.plan}. Included tries added.` : "Updated.";
    say(text);
    const structural = Boolean(body.plan) || body.creditDelta !== undefined || Boolean(body.status);
    if (!structural) {
      setRows((current) => current.map((row) => (row.id === id ? applySalonPatch(row, body) : row)));
      setSelected((row) => (row && row.id === id ? applySalonPatch(row, body) : row));
      return true;
    }
    window.location.reload();
    return true;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Salons</h1>
          <p className="mt-2 text-sm text-muted">Search, then open a salon to edit it.</p>
        </div>
        <button className="btn" type="button" onClick={() => setCreateOpen(true)}>New salon</button>
      </div>
      {notice ? <p className="mt-3 text-sm" role="status">{notice}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <input className="field max-w-xs" aria-label="Search salons" placeholder="Search name or slug" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="field max-w-[12rem]" aria-label="Plan" value={plan} onChange={(event) => setPlan(event.target.value)}>
          <option value="">All plans</option>
          {Object.values(PLANS).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="field max-w-[12rem]" aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="TRIAL">Trial</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="card mt-4 p-4 text-sm text-muted">{rows.length === 0 ? "No salons yet." : "No salons match."}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Slug</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Credits</th>
                <th className="py-2 pr-3">Previews this month</th>
                <th className="py-2 pr-3">Trial ends</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t border-line" onClick={() => openSalon(row)}>
                  <td className="py-3 pr-3 font-medium">{row.name}</td>
                  <td className="py-3 pr-3">
                    <a className="underline" href={`/s/${row.slug}`} onClick={(event) => event.stopPropagation()}>{row.slug}</a>
                  </td>
                  <td className="py-3 pr-3">{row.planName}</td>
                  <td className="py-3 pr-3"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
                  <td className="py-3 pr-3">{row.credits}</td>
                  <td className="py-3 pr-3">{row.previewsThisMonth}</td>
                  <td className="py-3 pr-3">{when(row.trialEndsAt)}</td>
                  <td className="py-3 pr-3">{when(row.createdAt)}</td>
                  <td className="py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="btn secondary" type="button" aria-label={`Actions for ${row.slug}`}>Actions</button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => openSalon(row)}>Open</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openPlan(row)}>Change plan</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openCredits(row)}>Adjust credits</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openSuspend(row)}>{row.status === "SUSPENDED" ? "Resume" : "Suspend"}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={Boolean(selected) && !planOpen && !creditOpen && !suspendOpen} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected?.name || "Salon"} description={selected ? selected.slug : undefined}>
        {selected ? (
          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="plan">Plan & credits</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
            </TabsList>
            <TabsContent value="profile">
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const field = new FormData(event.currentTarget).get("name");
                  void update(selected.id, { name: String(field || "") });
                }}
              >
                <label className="text-sm">Name
                  <input className="field mt-1" name="name" aria-label={`Salon name for ${selected.slug}`} defaultValue={selected.name} required minLength={2} />
                </label>
                <button className="btn w-fit" type="submit" disabled={busy}>{busy ? "Saving…" : "Save name"}</button>
              </form>
              <dl className="mt-4 grid gap-2 text-sm">
                <div><dt className="text-muted">Slug</dt><dd><a className="underline" href={`/s/${selected.slug}`}>{selected.slug}</a></dd></div>
                <div><dt className="text-muted">Owner</dt><dd>{selected.ownerName || "—"}{selected.ownerEmail ? ` · ${selected.ownerEmail}` : ""}</dd></div>
                <div><dt className="text-muted">Web address</dt><dd>{selected.host || "None verified"}<span className="block text-xs text-muted">The salon’s own site, after DNS is checked. Until then, guests use the Lookuvi link.</span></dd></div>
                <div><dt className="text-muted">Created</dt><dd>{when(selected.createdAt)}</dd></div>
                <div><dt className="text-muted">Trial ends</dt><dd>{when(selected.trialEndsAt)}</dd></div>
              </dl>
            </TabsContent>
            <TabsContent value="plan">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{selected.planName}</Badge>
                <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
              </div>
              <p className="mt-3 text-sm">{selected.credits} credits</p>
              <fieldset className="mt-4 grid gap-2">
                <legend className="text-sm font-medium">Products</legend>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.productTryOn}
                    onChange={(event) => void update(selected.id, { productTryOn: event.target.checked })}
                  />
                  AI Try-on
                  <span className="block text-xs text-muted">Guests can preview a look on their photo.</span>
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.productQueue}
                    onChange={(event) => void update(selected.id, { productQueue: event.target.checked })}
                  />
                  Queue
                  <span className="block text-xs text-muted">Guests can join a line and get a token.</span>
                </label>
              </fieldset>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn secondary" type="button" onClick={() => openPlan(selected)}>Change plan</button>
                <button className="btn secondary" type="button" onClick={() => openCredits(selected)}>Adjust credits</button>
                <button className="btn secondary" type="button" onClick={() => openSuspend(selected)}>{selected.status === "SUSPENDED" ? "Resume" : "Suspend"}</button>
              </div>
            </TabsContent>
            <TabsContent value="usage">
              <dl className="grid gap-2 text-sm">
                <div><dt className="text-muted">Previews this month</dt><dd className="font-medium">{selected.previewsThisMonth}</dd></div>
                <div><dt className="text-muted">Leads</dt><dd className="font-medium">{selected.leads}</dd></div>
                <div><dt className="text-muted">In the queue today</dt><dd className="font-medium">{selected.queueToday}</dd></div>
              </dl>
            </TabsContent>
          </Tabs>
        ) : null}
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="New salon" description="Starts a trial with the Starter credit grant.">
          <form className="grid gap-3" onSubmit={createSalon}>
            <label className="text-sm">Name
              <input className="field mt-1" value={name} onChange={(event) => {
                const next = event.target.value;
                setName(next);
                if (!slugTouched) setSlug(slugFromName(next));
              }} required minLength={2} />
            </label>
            <label className="text-sm">Slug
              <input className="field mt-1" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(event.target.value); }} required minLength={2} pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-describedby="slug-hint" />
              <span id="slug-hint" className="mt-1 block text-xs text-muted">Lowercase letters, numbers, and hyphens. Example: demo-salon</span>
            </label>
            <label className="text-sm">Plan
              <select className="field mt-1" aria-label="New salon plan" value={createPlan} onChange={(event) => setCreatePlan(event.target.value as PlanId)}>
                {Object.values(PLANS).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}{item.id === "STARTER" ? " trial" : ""}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">Owner email
              <input className="field mt-1" type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} />
            </label>
            <label className="text-sm">Owner password
              <input className="field mt-1" type="password" value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} minLength={12} aria-describedby="password-rules" />
              <span id="password-rules" className="mt-1 block text-xs text-muted">At least 12 characters. Do not reuse a demo password.</span>
            </label>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Create salon"}</button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent title="Change plan" description="Included tries are added. MRR counts only while the salon is active.">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selected) return;
              void update(selected.id, { plan: nextPlan });
            }}
          >
            <label className="text-sm">Plan
              <select className="field mt-1" aria-label="Plan" value={nextPlan} onChange={(event) => setNextPlan(event.target.value as PlanId)}>
                {Object.values(PLANS).map((item) => (
                  <option key={item.id} value={item.id}>{item.name} · {item.credits} tries</option>
                ))}
              </select>
            </label>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Set plan"}</button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={creditOpen} onOpenChange={(open) => { setCreditOpen(open); if (!open) setGoodwillConfirm(false); }}>
        <DialogContent title="Adjust credits" description="1 credit is 1 AI preview. The credits are free to the salon. The reason is saved on the credit ledger and the audit log.">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selected || !reason.trim()) return;
              void update(selected.id, { creditDelta: Number(delta), note: reason.trim() });
            }}
          >
            <label className="text-sm">Amount
              <input className="field mt-1" aria-label="Credit amount" type="number" value={delta} onChange={(event) => setDelta(event.target.value)} required />
            </label>
            <label className="text-sm">Reason
              <input className="field mt-1" aria-label="Credit reason" value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={200} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn" type="submit" disabled={busy || !reason.trim()}>{busy ? "Saving…" : "Confirm adjustment"}</button>
              {goodwillConfirm ? (
                <div className="grid w-full gap-2 rounded-[10px] border border-line p-3">
                  <p className="text-sm">Add 50 credits as goodwill? That is about ₹115–150 of AI cost. It is free to the salon. The reason “goodwill” is saved on the credit ledger and the audit log.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || !selected}
                      onClick={() => {
                        if (!selected) return;
                        void update(selected.id, { creditDelta: 50, note: "goodwill" });
                      }}
                    >
                      Confirm +50 goodwill
                    </button>
                    <button className="btn secondary" type="button" onClick={() => setGoodwillConfirm(false)}>Back</button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy || !selected}
                  onClick={() => setGoodwillConfirm(true)}
                >
                  +50 goodwill
                </button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent
          title={selected?.status === "SUSPENDED" ? "Resume salon" : "Suspend salon"}
          description={selected?.status === "SUSPENDED" ? "The salon home opens again." : "Guests see a paused page until you resume."}
        >
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              type="button"
              disabled={busy || !selected}
              onClick={() => {
                if (!selected) return;
                void update(selected.id, { status: selected.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" });
              }}
            >
              {busy ? "Saving…" : selected?.status === "SUSPENDED" ? "Confirm resume" : "Confirm suspend"}
            </button>
            <button className="btn secondary" type="button" onClick={() => setSuspendOpen(false)}>Cancel</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
