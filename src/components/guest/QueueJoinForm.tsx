"use client";

import { useEffect, useState } from "react";
import { t } from "@/data/i18n";
import { QueueWait } from "@/components/guest/QueueWait";
import { QUEUE_POLL_MS } from "@/lib/queue/poll";

type Board = {
  name: string;
  slug: string;
  open: boolean;
  mode: string;
  waitMin: number;
  ahead: number;
  tryOn: boolean;
  lang: string;
  services: { id: string; name: string; minutes: number }[];
};

type Memory = { name: string; phone: string; ref: string };

export function QueueJoinForm({ initial }: { initial: Board }) {
  const lang = initial.lang || "en";
  const [board, setBoard] = useState(initial);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const request = board.mode === "REQUEST";

  useEffect(() => {
    setReady(true);
    try {
      const saved = JSON.parse(localStorage.getItem(`lookuvi-queue:${board.slug}`) || "null") as Memory | null;
      if (saved?.phone && saved.ref) setMemory(saved);
    } catch {
      setMemory(null);
    }
  }, [board.slug]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetch(`/api/v1/queue?slug=${encodeURIComponent(board.slug)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data.open === "boolean") {
            setBoard(data);
            setRefreshKey((key) => key + 1);
          }
        })
        .catch(() => undefined);
    }, QUEUE_POLL_MS);
    return () => clearInterval(timer);
  }, [board.slug]);

  function deviceId() {
    const key = "lookuvi-device";
    try {
      const saved = localStorage.getItem(key) || "";
      if (saved.length >= 8) return saved;
      const next = crypto.randomUUID();
      localStorage.setItem(key, next);
      return next;
    } catch {
      return "";
    }
  }

  async function join(nextName: string, nextPhone: string, agreed: boolean) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: board.slug,
        name: nextName,
        phone: nextPhone,
        serviceId: serviceId || undefined,
        consent: agreed,
        requestedDate: request ? date : undefined,
        requestedSlot: request ? slot : undefined,
        deviceId: deviceId(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "That did not work. Try again.");
      return;
    }
    localStorage.setItem(`lookuvi-queue:${board.slug}`, JSON.stringify({ name: nextName, phone: nextPhone, ref: data.ref }));
    window.location.href = data.statusPath;
  }

  return (
    <div>
      <div data-queue-open={board.open ? "yes" : "no"} data-queue-mode={board.mode}>
        {request ? <p className="mt-2 text-sm">{t(lang, "queueRequestNote")}</p> : board.open ? (
          <QueueWait key={refreshKey} serverWait={board.waitMin} ahead={board.ahead} lang={lang} phrase="join" />
        ) : <p className="mt-2 text-sm">{t(lang, "queueClosed")}</p>}
      </div>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">{board.open ? t(lang, "queueOpenNow") : t(lang, "queueClosedNow")}</p>
      {memory ? (
        <div className="card mt-4 grid gap-2 p-4">
          <p>{t(lang, "queueWelcome", { name: memory.name || memory.phone })}</p>
          <a className="btn secondary" href={`/s/${board.slug}/q/${memory.ref}`}>{t(lang, "queueSeePlace")}</a>
          <button className="btn" type="button" disabled={busy || (!board.open && !request)} onClick={() => void join(memory.name, memory.phone, true)}>{t(lang, "queueRejoin")}</button>
        </div>
      ) : null}
      <form
        className="card mt-4 grid gap-3 p-4"
        data-ready={ready ? "yes" : "no"}
        onSubmit={(event) => {
          event.preventDefault();
          void join(name, phone, consent);
        }}
      >
        <label className="text-sm">{t(lang, "queueName")}
          <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoComplete="name" />
        </label>
        <label className="text-sm">{t(lang, "queuePhone")}
          <input className="field mt-1" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
        </label>
        <label className="text-sm">{t(lang, "queueService")}
          <select className="field mt-1" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            <option value="">{t(lang, "queueNoService")}</option>
            {board.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        {request ? (
          <>
            <label className="text-sm">{t(lang, "queueDate")}
              <input className="field mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label className="text-sm">{t(lang, "queueTime")}
              <input className="field mt-1" type="time" value={slot} onChange={(event) => setSlot(event.target.value)} required />
            </label>
          </>
        ) : null}
        <label className="flex min-h-11 items-start gap-2 text-sm" htmlFor="queue-updates">
          <input id="queue-updates" className="mt-1" type="checkbox" checked={consent} aria-label={t(lang, "queueConsent")} onChange={(event) => setConsent(event.target.checked)} required />
          <span>{t(lang, "queueConsent")}</span>
        </label>
        <button className="btn w-full text-lg" type="submit" disabled={busy || (!board.open && !request)}>{busy ? "…" : request ? t(lang, "queueRequest") : t(lang, "queueJoin")}</button>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
      </form>
      {board.tryOn ? <p className="mt-4"><a className="btn secondary" href={`/s/${board.slug}`}>{t(lang, "queueTryLook")}</a></p> : null}
    </div>
  );
}
