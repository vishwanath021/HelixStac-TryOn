"use client";

import { useEffect, useState } from "react";
import { t } from "@/data/i18n";
import { QUEUE_POLL_MS } from "@/lib/queue/poll";

type Card = {
  id: string;
  token: number;
  name: string;
  phone: string;
  serviceName: string;
  status: string;
  waitMin: number;
  ahead: number;
  onTheWay: boolean;
  requestedDate: string;
  requestedSlot: string;
  whatsappUrl: string;
  callUrl: string;
};

type Desk = {
  salon: string;
  state: {
    isOpen: boolean;
    units: number;
    unitLabel: string;
    avgMinutes: number;
    alertLeadMin: number;
    mode: string;
  };
  services: { id: string; name: string }[];
  serving: { unit: number; entry: Card | null }[];
  waiting: Card[];
  requests: Card[];
  confirmed: Card[];
};

const LABELS: Record<string, string> = { chair: "queueChair", station: "queueStation", room: "queueRoom" };

export function QueueDesk({ initial, lang }: { initial: Desk; lang: string }) {
  const [desk, setDesk] = useState(initial);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [walkName, setWalkName] = useState("");
  const [walkPhone, setWalkPhone] = useState("");
  const [units, setUnits] = useState(String(initial.state.units));
  const [avg, setAvg] = useState(String(initial.state.avgMinutes));
  const [alertMin, setAlertMin] = useState(String(initial.state.alertLeadMin));
  const [mode, setMode] = useState(initial.state.mode);
  const [unitLabel, setUnitLabel] = useState(initial.state.unitLabel);
  const live = desk.state.mode === "LIVE";
  const place = t(lang, LABELS[desk.state.unitLabel] || "queueChair");

  useEffect(() => {
    setReady(true);
    const timer = setInterval(() => {
      void fetch("/api/v1/admin/queue")
        .then((res) => res.json())
        .then((data) => {
          if (data?.state) setDesk(data);
        })
        .catch(() => undefined);
    }, QUEUE_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    const res = await fetch("/api/v1/admin/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setNotice(data.message || "That did not work.");
      return;
    }
    if (data?.state) {
      setDesk(data);
      setUnits(String(data.state.units));
      setAvg(String(data.state.avgMinutes));
      setAlertMin(String(data.state.alertLeadMin));
      setMode(data.state.mode);
      setUnitLabel(data.state.unitLabel);
    }
  }

  function links(card: Card) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {card.whatsappUrl ? <a className="btn secondary" href={card.whatsappUrl} target="_blank" rel="noreferrer">{t(lang, "queueWhatsApp")}</a> : null}
        {card.callUrl ? <a className="btn secondary" href={card.callUrl}>{t(lang, "queueCall")}</a> : null}
      </div>
    );
  }

  return (
    <div data-ready={ready ? "yes" : "no"} data-queue-mode={desk.state.mode} data-queue-open={desk.state.isOpen ? "yes" : "no"}>
      <div className="mt-4 grid gap-3">
        <button className="btn w-full text-lg" type="button" disabled={busy} onClick={() => void act({ action: desk.state.isOpen ? "pause" : "open" })}>
          {desk.state.isOpen ? t(lang, "queueToggleOpen") : t(lang, "queueTogglePaused")}
        </button>
        <p className="text-sm text-muted">{desk.state.isOpen ? t(lang, "queueOpenNote") : t(lang, "queuePausedNote")}</p>
        {live ? (
          <button className="btn w-full text-2xl" type="button" disabled={busy || desk.waiting.length === 0} onClick={() => void act({ action: "next" })}>
            {t(lang, "queueNext")}
          </button>
        ) : null}
      </div>
      {notice ? <p className="mt-3 text-sm" role="status">{notice}</p> : null}

      {live ? (
        <section className="mt-6">
          <h2 className="font-serif text-2xl">{t(lang, "queueNow")}</h2>
          <div className="mt-3 grid gap-3">
            {desk.serving.map((seat) => (
              <article key={seat.unit} className="card p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">{place} {seat.unit}</p>
                {seat.entry ? (
                  <>
                    <p className="text-xs uppercase tracking-[0.14em] text-muted">Token</p>
                    <p className="font-serif text-7xl leading-none" data-queue-token={seat.entry.token}>{seat.entry.token}</p>
                    <p className="break-all text-lg">{seat.entry.name}{seat.entry.serviceName ? ` · ${seat.entry.serviceName}` : ""}</p>
                    {seat.entry.onTheWay ? <p className="text-sm">{t(lang, "queueOnTheWayBadge")}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {seat.entry.status === "CALLED" ? (
                        <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "start", id: seat.entry?.id })}>{t(lang, "queueStart")}</button>
                      ) : null}
                      <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "done", id: seat.entry?.id })}>{t(lang, "queueDone")}</button>
                      <button className="btn secondary" type="button" disabled={busy} onClick={() => void act({ action: "noshow", id: seat.entry?.id })}>{t(lang, "queueNoShow")}</button>
                    </div>
                    {links(seat.entry)}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted">{t(lang, "queueFree", { label: place, unit: seat.unit })}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {live ? (
        <section className="mt-6">
          <h2 className="font-serif text-2xl">{t(lang, "queueWaiting")}</h2>
          {desk.waiting.length === 0 ? <p className="mt-2 text-sm text-muted">{t(lang, "queueNobody")}</p> : null}
          <div className="mt-3 grid gap-3">
            {desk.waiting.map((card) => (
              <article key={card.id} className="card p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Token</p>
                <p className="font-serif text-7xl leading-none" data-queue-token={card.token}>{card.token}</p>
                <p className="break-all text-lg">{card.name}{card.serviceName ? ` · ${card.serviceName}` : ""}</p>
                <p className="text-sm text-muted">{t(lang, "queueMinShort", { min: card.waitMin })} · {t(lang, "queueAheadShort", { ahead: card.ahead })}</p>
                {card.onTheWay ? <p className="text-sm">{t(lang, "queueOnTheWayBadge")}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn secondary" type="button" disabled={busy} onClick={() => void act({ action: "noshow", id: card.id })}>{t(lang, "queueNoShow")}</button>
                </div>
                {links(card)}
              </article>
            ))}
          </div>
          <form
            className="card mt-4 grid gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void act({ action: "walkin", name: walkName, phone: walkPhone }).then(() => {
                setWalkName("");
                setWalkPhone("");
              });
            }}
          >
            <h2 className="font-serif text-2xl">{t(lang, "queueWalkIn")}</h2>
            <label className="text-sm">{t(lang, "queueWalkName")}
              <input className="field mt-1" value={walkName} maxLength={80} onChange={(event) => setWalkName(event.target.value)} />
            </label>
            <label className="text-sm">{t(lang, "queuePhoneOptional")}
              <input className="field mt-1" inputMode="tel" value={walkPhone} onChange={(event) => setWalkPhone(event.target.value)} />
            </label>
            <button className="btn w-full" type="submit" disabled={busy}>{t(lang, "queueWalkIn")}</button>
          </form>
        </section>
      ) : null}

      {!live ? (
        <section className="mt-6">
          <h2 className="font-serif text-2xl">{t(lang, "queueRequests")}</h2>
          {desk.requests.length === 0 ? <p className="mt-2 text-sm text-muted">{t(lang, "queueNobody")}</p> : null}
          <div className="mt-3 grid gap-3">
            {desk.requests.map((card) => (
              <article key={card.id} className="card p-4">
                <p className="text-lg">{card.name}</p>
                <p className="text-sm">{card.requestedDate} · {card.requestedSlot}{card.serviceName ? ` · ${card.serviceName}` : ""}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "confirm", id: card.id })}>{t(lang, "queueConfirm")}</button>
                  <button className="btn secondary" type="button" disabled={busy} onClick={() => void act({ action: "decline", id: card.id })}>{t(lang, "queueDecline")}</button>
                </div>
                {links(card)}
              </article>
            ))}
          </div>
          {desk.confirmed.length > 0 ? (
            <>
              <h2 className="mt-6 font-serif text-2xl">{t(lang, "queueConfirmed")}</h2>
              <ul className="mt-2 text-sm">
                {desk.confirmed.map((card) => (
                  <li key={card.id} className="border-b border-line py-2">{card.name} · {card.requestedDate} {card.requestedSlot}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <details className="card mt-6 p-4">
        <summary className="cursor-pointer text-lg">{t(lang, "queueSettings")}</summary>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void act({
              action: "settings",
              units: Number(units),
              avgMinutes: Number(avg),
              alertLeadMin: Number(alertMin),
              mode,
              unitLabel,
            });
          }}
        >
          <label className="text-sm">{t(lang, "queueUnits", { unit: unitLabel === "station" ? "Stations" : unitLabel === "room" ? "Rooms" : "Chairs" })}
            <input className="field mt-1" type="number" min={1} max={30} value={units} onChange={(event) => setUnits(event.target.value)} />
          </label>
          <label className="text-sm">{t(lang, "queueAvg")}
            <input className="field mt-1" type="number" min={5} max={240} value={avg} onChange={(event) => setAvg(event.target.value)} />
          </label>
          <label className="text-sm">{t(lang, "queueAlert")}
            <input className="field mt-1" type="number" min={0} max={120} value={alertMin} onChange={(event) => setAlertMin(event.target.value)} />
          </label>
          <label className="text-sm">{t(lang, "queuePlace")}
            <select className="field mt-1" aria-label={t(lang, "queuePlace")} value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)}>
              <option value="chair">{t(lang, "queueChair")}</option>
              <option value="station">{t(lang, "queueStation")}</option>
              <option value="room">{t(lang, "queueRoom")}</option>
            </select>
          </label>
          <label className="text-sm">{t(lang, "queueHow")}
            <select className="field mt-1" aria-label={t(lang, "queueHow")} value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="LIVE">{t(lang, "queueLive")}</option>
              <option value="REQUEST">{t(lang, "queueRequestMode")}</option>
            </select>
          </label>
          <button className="btn" type="submit" disabled={busy}>{t(lang, "queueSave")}</button>
        </form>
      </details>
    </div>
  );
}
