"use client";

import { useEffect, useState } from "react";
import { isLocale, LOCALE_LABELS, t, type Locale } from "@/data/i18n";
import type { SalonConfig } from "@/lib/salon";

type Person = { id: string; label: string; audience: string; hairLength: string };
type Booking = { id: string; lookName: string; preferredAt: string; status: string; note: string };
type Look = { id: string; tool: string; lookId: string; lookName: string };
type Customer = {
  name: string;
  dob: string;
  audience: string;
  hairLength: string;
  onboarded: boolean;
  phoneHint: string;
  people: Person[];
  bookings: Booking[];
  looks: Look[];
};

const HAIR = ["neck", "shoulder", "below", "mid", "waist", "extra"] as const;
type Tab = "home" | "try" | "bookings" | "profile";

export function GuestHub({
  config,
  book,
  look,
  styleId,
  tool,
}: {
  config: SalonConfig;
  book?: boolean;
  look?: string;
  styleId?: string;
  tool?: string;
}) {
  const [lang, setLang] = useState<Locale>(isLocale(config.defaultLang) ? config.defaultLang : "en");
  const [tab, setTab] = useState<Tab>(book ? "bookings" : "home");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [audience, setAudience] = useState<"women" | "men" | "kids">("women");
  const [hairLength, setHairLength] = useState("shoulder");
  const [serviceKey, setServiceKey] = useState(config.services[0]?.key ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("11:00");
  const [note, setNote] = useState("");
  const [personLabel, setPersonLabel] = useState("");
  const [personAudience, setPersonAudience] = useState<"women" | "men" | "kids">("kids");
  const [status, setStatus] = useState("");

  async function refresh() {
    const res = await fetch(`/api/v1/guest/me?slug=${config.slug}`);
    const data = await res.json();
    setCustomer(data.customer);
    setReady(true);
    if (data.customer?.onboarded) {
      setName(data.customer.name || "");
      setDob(data.customer.dob || "");
      if (data.customer.audience) setAudience(data.customer.audience);
      if (data.customer.hairLength) setHairLength(data.customer.hairLength);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/v1/guest/me?slug=${config.slug}`);
      const data = await res.json();
      if (cancelled) return;
      setCustomer(data.customer);
      setReady(true);
      if (data.customer?.onboarded) {
        setName(data.customer.name || "");
        setDob(data.customer.dob || "");
        if (data.customer.audience) setAudience(data.customer.audience);
        if (data.customer.hairLength) setHairLength(data.customer.hairLength);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.slug]);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/v1/guest/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, phone }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || t(lang, "hubError"));
      return;
    }
    setSent(true);
    setDevCode(data.devCode || "");
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/v1/guest/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, phone, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || t(lang, "hubError"));
      return;
    }
    await refresh();
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/v1/guest/me", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, name, dob, audience, hairLength: audience === "women" ? hairLength : "" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || t(lang, "hubError"));
      return;
    }
    await refresh();
    if (book) setTab("bookings");
  }

  async function requestBooking(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/v1/guest/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: config.slug,
        lookName: look || "",
        lookId: styleId || "",
        tool: tool || "",
        serviceKey,
        preferredAt: `${date} ${time}`,
        note,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || t(lang, "hubError"));
      return;
    }
    setStatus(t(lang, "hubRequested"));
    await refresh();
  }

  async function addPerson(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/v1/guest/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, label: personLabel, audience: personAudience }),
    });
    if (res.ok) {
      setPersonLabel("");
      await refresh();
    }
  }

  async function removePerson(id: string) {
    await fetch(`/api/v1/guest/people?slug=${config.slug}&id=${id}`, { method: "DELETE" });
    await refresh();
  }

  async function deleteData() {
    if (!window.confirm(t(lang, "hubDeleteConfirm"))) return;
    await fetch(`/api/v1/guest/me?slug=${config.slug}`, { method: "DELETE" });
    setCustomer(null);
    setSent(false);
    setCode("");
    setStatus(t(lang, "hubDeleted"));
  }

  const upcoming = (customer?.bookings || []).filter((item) => item.status !== "DECLINED");

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">{config.name}</p>
          <h1 className="font-serif text-3xl">{t(lang, "hubTitle")}</h1>
        </div>
        <select className="field py-1" aria-label={t(lang, "language")} value={lang} onChange={(event) => setLang(event.target.value as Locale)}>
          {config.languages.filter(isLocale).map((code) => <option key={code} value={code}>{LOCALE_LABELS[code]}</option>)}
        </select>
      </header>
      <p className="mb-4 text-sm leading-6 text-muted">{t(lang, "hubIntro")}</p>

      {!ready ? <p role="status">{t(lang, "progress")}</p> : !customer ? (
        <section className="card space-y-3 p-4" aria-labelledby="otp-title">
          <h2 id="otp-title" className="font-serif text-2xl">{t(lang, "hubLogin")}</h2>
          <form className="space-y-2" onSubmit={sendCode}>
            <label className="block text-sm">{t(lang, "hubPhone")}
              <input className="field mt-1" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <button className="btn" type="submit">{t(lang, "hubSend")}</button>
          </form>
          {sent && (
            <form className="space-y-2" onSubmit={verify}>
              <label className="block text-sm">{t(lang, "hubCode")}
                <input className="field mt-1" inputMode="numeric" autoComplete="one-time-code" pattern="\d{4,6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value)} aria-label={t(lang, "hubCode")} />
              </label>
              {devCode && <p className="text-sm" data-testid="dev-otp">{t(lang, "hubDevCode")}: {devCode}</p>}
              <button className="btn" type="submit">{t(lang, "hubVerify")}</button>
            </form>
          )}
        </section>
      ) : !customer.onboarded ? (
        <form className="card space-y-3 p-4" onSubmit={saveProfile} aria-labelledby="setup-title">
          <h2 id="setup-title" className="font-serif text-2xl">{t(lang, "hubSetup")}</h2>
          <p className="text-xs text-muted">{t(lang, "hubAgeNote")}</p>
          <label className="block text-sm">{t(lang, "hubName")}
            <input className="field mt-1" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm">{t(lang, "hubDob")}
            <input className="field mt-1" type="date" required value={dob} onChange={(event) => setDob(event.target.value)} />
          </label>
          <fieldset>
            <legend className="text-sm">{t(lang, "hubFor")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["women", "men", "kids"] as const).map((item) => (
                <label key={item} className="flex items-center gap-1 text-sm">
                  <input type="radio" name="audience" checked={audience === item} onChange={() => setAudience(item)} />
                  {t(lang, item)}{item === "kids" ? ` (${t(lang, "kidsAge")})` : ""}
                </label>
              ))}
            </div>
          </fieldset>
          {audience === "women" && (
            <label className="block text-sm">{t(lang, "hubHair")}
              <select className="field mt-1" value={hairLength} onChange={(event) => setHairLength(event.target.value)}>
                {HAIR.map((item) => <option key={item} value={item}>{t(lang, `hair_${item}`)}</option>)}
              </select>
            </label>
          )}
          <button className="btn" type="submit">{t(lang, "hubSave")}</button>
        </form>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1 rounded-full bg-[#241c16] p-1" role="tablist" aria-label={t(lang, "hubTitle")}>
            {(["home", "try", "bookings", "profile"] as const).map((item) => (
              <button key={item} className={`rounded-full px-3 py-2 text-xs font-semibold ${tab === item ? "bg-white text-[#241c16]" : "text-white"}`} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{t(lang, `tab_${item}`)}</button>
            ))}
          </div>
          {tab === "home" && (
            <div className="space-y-3">
              <section className="card p-4">
                <h2 className="font-serif text-2xl">{t(lang, "hubSaved")}</h2>
                {customer.looks.length === 0 && <p className="mt-2 text-sm text-muted">{t(lang, "hubEmptyLooks")}</p>}
                <ul className="mt-2 space-y-2 text-sm">
                  {customer.looks.map((item) => (
                    <li key={item.id}>
                      <a className="underline" href={`/s/${config.slug}?tool=${item.tool || "style"}&style=${item.lookId}`}>{item.lookName}</a>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card p-4">
                <h2 className="font-serif text-2xl">{t(lang, "hubUpcoming")}</h2>
                {upcoming.length === 0 && <p className="mt-2 text-sm text-muted">{t(lang, "hubEmptyBookings")}</p>}
                <ul className="mt-2 space-y-2 text-sm">
                  {upcoming.map((item) => (
                    <li key={item.id}>{item.lookName || t(lang, "hubVisit")} · {item.preferredAt} · {t(lang, `status_${item.status}`)}</li>
                  ))}
                </ul>
              </section>
            </div>
          )}
          {tab === "try" && (
            <section className="card space-y-2 p-4">
              <h2 className="font-serif text-2xl">{t(lang, "tab_try")}</h2>
              <p className="text-sm text-muted">{t(lang, "hubTryNote")}</p>
              <a className="btn" href={`/s/${config.slug}`}>{t(lang, "backToTry")}</a>
              {config.toolStyle && <a className="btn secondary" href={`/s/${config.slug}?tool=style`}>{t(lang, "styleTab")}</a>}
              {config.showKids && <a className="btn secondary" href={`/s/${config.slug}?tool=style`}>{t(lang, "kids")}</a>}
              {config.toolBrows && <a className="btn secondary" href={`/s/${config.slug}?tool=brows`}>{t(lang, "browsTab")}</a>}
              {config.toolBeard && <a className="btn secondary" href={`/s/${config.slug}?tool=beard`}>{t(lang, "beardTab")}</a>}
              {config.toolNails && <a className="btn secondary" href={`/s/${config.slug}?tool=nails`}>{t(lang, "nailsTab")}</a>}
              <a className="btn secondary" href={`/s/${config.slug}/guide`}>{t(lang, "guideLink")}</a>
            </section>
          )}
          {tab === "bookings" && (
            <form className="card space-y-3 p-4" onSubmit={requestBooking}>
              <h2 className="font-serif text-2xl">{t(lang, "hubRequest")}</h2>
              {look && <p className="text-sm">{t(lang, "hubSelected")}: {look}</p>}
              <label className="block text-sm">{t(lang, "services")}
                <select className="field mt-1" value={serviceKey} onChange={(event) => setServiceKey(event.target.value)}>
                  {config.services.map((service) => <option key={service.key} value={service.key}>{service.nameI18n[lang] || service.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">{t(lang, "hubDate")}
                <input className="field mt-1" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label className="block text-sm">{t(lang, "hubTime")}
                <input className="field mt-1" type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
              </label>
              <label className="block text-sm">{t(lang, "hubNote")}
                <textarea className="field mt-1" value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <button className="btn" type="submit">{t(lang, "hubRequest")}</button>
              {status && <p role="status" className="text-sm">{status}</p>}
              <ul className="space-y-1 text-sm">
                {customer.bookings.map((item) => (
                  <li key={item.id}>{item.preferredAt} · {item.lookName || t(lang, "hubVisit")} · {t(lang, `status_${item.status}`)}</li>
                ))}
              </ul>
            </form>
          )}
          {tab === "profile" && (
            <div className="space-y-3">
              <section className="card p-4 text-sm">
                <h2 className="font-serif text-2xl">{customer.name}</h2>
                <p className="mt-1 text-muted">{customer.phoneHint}</p>
                <p className="mt-2">{t(lang, "hubFor")}: {t(lang, customer.audience || "women")}</p>
              </section>
              <form className="card space-y-2 p-4" onSubmit={addPerson}>
                <h2 className="font-serif text-2xl">{t(lang, "hubFamily")}</h2>
                <label className="block text-sm">{t(lang, "hubPerson")}
                  <input className="field mt-1" required value={personLabel} onChange={(event) => setPersonLabel(event.target.value)} />
                </label>
                <label className="block text-sm">{t(lang, "hubFor")}
                  <select className="field mt-1" value={personAudience} onChange={(event) => setPersonAudience(event.target.value as typeof personAudience)}>
                    <option value="women">{t(lang, "women")}</option>
                    <option value="men">{t(lang, "men")}</option>
                    <option value="kids">{t(lang, "kids")}</option>
                  </select>
                </label>
                <button className="btn" type="submit">{t(lang, "hubAddPerson")}</button>
                <ul className="space-y-2 text-sm">
                  {customer.people.map((person) => (
                    <li key={person.id} className="flex items-center justify-between gap-2">
                      <span>{person.label} · {t(lang, person.audience)}</span>
                      <button className="btn secondary" type="button" onClick={() => void removePerson(person.id)}>{t(lang, "remove")}</button>
                    </li>
                  ))}
                </ul>
              </form>
              <section className="card p-4 text-sm">
                <h2 className="font-serif text-xl">{t(lang, "roadmapTitle")}</h2>
                <p className="mt-1 text-muted">{t(lang, "roadmapBody")}</p>
              </section>
              <button className="btn secondary" type="button" onClick={() => void deleteData()}>{t(lang, "hubDelete")}</button>
            </div>
          )}
        </>
      )}
      {error && <p className="mt-3 text-sm text-[var(--bad)]" role="alert">{error}</p>}
      <p className="mt-6 text-center text-sm"><a className="underline" href={`/s/${config.slug}`}>{t(lang, "backToTry")}</a></p>
    </div>
  );
}
