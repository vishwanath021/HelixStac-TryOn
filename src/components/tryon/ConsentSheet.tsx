"use client";

import { CONSENT_SHEET } from "@/data/consent-copy";

export function ConsentSheet({ open, onAgree, onClose }: { open: boolean; onAgree: () => void; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/55 p-3 sm:place-items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-copy" className="w-full max-w-md rounded-2xl bg-white p-5 text-ink shadow-xl">
        <div className="flex justify-end">
          <button className="cam-round" type="button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <h2 id="consent-title" className="font-serif text-2xl">Before the camera</h2>
        <p id="consent-copy" className="mt-3 text-base leading-relaxed">
          {CONSENT_SHEET}{" "}
          <a className="underline" href="/privacy">Details</a>
        </p>
        <button className="btn sheen mt-5 w-full" type="button" autoFocus onClick={onAgree}>I agree, start</button>
      </div>
    </div>
  );
}
