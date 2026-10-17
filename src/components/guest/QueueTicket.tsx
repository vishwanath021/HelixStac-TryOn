"use client";

import { useEffect, useState } from "react";
import { t } from "@/data/i18n";
import { QueueWait } from "@/components/guest/QueueWait";
import { QUEUE_POLL_MS } from "@/lib/queue/poll";

type Ticket = {
  ref: string;
  token: number;
  status: string;
  waitMin: number;
  ahead: number;
  name: string;
  onTheWay: boolean;
  mode: string;
  requestedDate: string;
  requestedSlot: string;
  statusPath: string;
  salon: string;
  tryOn: boolean;
  lang: string;
  serviceName: string;
};

export function QueueTicket({ slug, initial }: { slug: string; initial: Ticket }) {
  const [ticket, setTicket] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const lang = ticket.lang || "en";
  const open = ticket.status === "WAITING" || ticket.status === "CALLED" || ticket.status === "REQUESTED" || ticket.status === "CONFIRMED";

  useEffect(() => {
    setReady(true);
    const timer = setInterval(() => {
      void fetch(`/api/v1/queue/status?slug=${encodeURIComponent(slug)}&ref=${encodeURIComponent(ticket.ref)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data.status === "string") {
            setTicket((current) => ({ ...current, ...data }));
            setRefreshKey((key) => key + 1);
          }
        })
        .catch(() => undefined);
    }, QUEUE_POLL_MS);
    return () => clearInterval(timer);
  }, [slug, ticket.ref]);

  async function act(action: "way" | "cancel") {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/queue/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, ref: ticket.ref, action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "That did not work. Try again.");
      return;
    }
    setTicket((current) => ({ ...current, ...data }));
    setRefreshKey((key) => key + 1);
  }

  const live = ticket.status === "WAITING" || ticket.status === "CALLED";
  let line = "";
  if (ticket.status === "IN_SERVICE") line = t(lang, "queueServingYou");
  if (ticket.status === "REQUESTED") line = t(lang, "queueWaitingConfirm");
  if (ticket.status === "CONFIRMED") line = t(lang, "queueConfirmedWhen", { date: ticket.requestedDate, slot: ticket.requestedSlot });
  if (ticket.status === "CANCELLED") line = t(lang, "queueCancelled");
  if (ticket.status === "DONE") line = t(lang, "queueFinished");
  if (ticket.status === "NO_SHOW") line = t(lang, "queueMissed");

  const joined = ticket.status === "WAITING" || ticket.status === "CALLED" || ticket.status === "IN_SERVICE"
    ? t(lang, "queueJoined", { token: ticket.token, min: ticket.waitMin })
    : "";

  return (
    <div data-status={ticket.status} data-ready={ready ? "yes" : "no"}>
      {joined ? <p className="mt-4 text-lg" data-queue-joined="yes">{joined}</p> : null}
      {live ? (
        <QueueWait key={refreshKey} serverWait={ticket.waitMin} ahead={ticket.ahead} token={ticket.token} lang={lang} phrase={ticket.status === "CALLED" ? "turn" : undefined} />
      ) : (
        <>
          <p className="mt-6 text-lg">{line}</p>
          <p className="text-sm text-muted" data-queue-token={ticket.token}>{t(lang, "queueToken", { token: ticket.token })}</p>
        </>
      )}
      {ticket.serviceName ? <p className="mt-1 text-sm text-muted">{ticket.serviceName}</p> : null}
      {ticket.onTheWay ? <p className="mt-3 text-sm">{t(lang, "queueComing")}</p> : null}
      {open ? (
        <div className="mt-6 grid gap-2">
          {!ticket.onTheWay ? <button className="btn w-full text-lg" type="button" disabled={busy} onClick={() => void act("way")}>{t(lang, "queueOnWay")}</button> : null}
          <button className="btn secondary w-full" type="button" disabled={busy} onClick={() => void act("cancel")}>{t(lang, "queueCancel")}</button>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
      {ticket.tryOn ? <p className="mt-6"><a className="btn secondary" href={`/s/${slug}`}>{t(lang, "queueTryLook")}</a></p> : null}
    </div>
  );
}
