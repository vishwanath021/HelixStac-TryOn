"use client";

import { useState } from "react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/data/i18n";

export function OnboardingWizard({
  initial,
  hairstyleOnly = true,
}: {
  hairstyleOnly?: boolean;
  initial: {
    name: string;
    primaryColor: string;
    whatsapp: string;
    address: string;
    languages: string[];
    services: { key: string; name: string; priceInr: number }[];
  };
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.primaryColor);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [address, setAddress] = useState(initial.address);
  const [languages, setLanguages] = useState<string[]>(initial.languages);
  const [message, setMessage] = useState("");
  const steps = ["Brand", "Services", "WhatsApp", "Languages", "Done"];

  async function save(done = false) {
    const res = await fetch("/api/v1/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, primaryColor: color, whatsapp, address, languages, defaultLang: languages[0] || "en", onboardingDone: done }),
    });
    const data = await res.json();
    if (!res.ok) setMessage(data.message || "Could not save");
    else setMessage(done ? "Salon page is ready." : "Saved");
  }

  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">Step {step + 1} of {steps.length} · {steps[step]}</p>
      {step === 0 && (
        <div className="mt-3 space-y-3">
          <label className="block text-sm">Salon name<input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="block text-sm">Brand colour<input className="mt-1 h-10 w-full" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        </div>
      )}
      {step === 1 && (
        <ul className="mt-3 text-sm">
          {initial.services.map((service) => (
            <li key={service.key} className="flex justify-between border-b border-line py-1"><span>{service.name}</span><span>₹{service.priceInr}</span></li>
          ))}
          <li className="pt-2 text-muted">Edit prices on the Services page. This step is a check, not a second price list.</li>
        </ul>
      )}
      {step === 2 && (
        <div className="mt-3 space-y-3">
          <label className="block text-sm">WhatsApp with country code<input className="field mt-1" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} /></label>
          <label className="block text-sm">Address<input className="field mt-1" value={address} onChange={(event) => setAddress(event.target.value)} /></label>
        </div>
      )}
      {step === 3 && (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {LOCALES.map((code) => (
            <label key={code} className="flex items-center gap-2">
              <input type="checkbox" checked={languages.includes(code)} onChange={(event) => {
                setLanguages((current) => event.target.checked ? [...current, code] : current.filter((item) => item !== code));
              }} />
              {LOCALE_LABELS[code as Locale]}
            </label>
          ))}
        </div>
      )}
      {step === 4 && <p className="mt-3 text-sm">Open the try-on, print the QR, and paste the embed if your plan includes it. {hairstyleOnly ? "The try-on is hairstyle for now." : "Colour, style, brows, beard, and nails start on. Turn a tool off in Settings."} Booking stays on WhatsApp unless you require a phone login.</p>}
      <div className="mt-4 flex gap-2">
        {step > 0 && <button className="btn secondary" type="button" onClick={() => setStep((value) => value - 1)}>Back</button>}
        {step < 4 && <button className="btn" type="button" onClick={() => { void save(false); setStep((value) => value + 1); }}>Next</button>}
        {step === 4 && <button className="btn" type="button" onClick={() => void save(true)}>Finish</button>}
      </div>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </div>
  );
}
