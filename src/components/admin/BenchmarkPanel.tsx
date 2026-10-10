"use client";

import { useRef, useState } from "react";
import type { LengthCategory } from "@/data/styles";

type StyleOption = { id: string; name: string; lengthCategory: LengthCategory };

type Quote = {
  model: string;
  quality: string;
  size: string;
  estimateInr: number;
  estimateUsd: number;
  capInr: number;
  outputTokens: number;
  outputUsd: number;
  imageInputTokens: number;
  imageInputUsd: number;
  textInputTokens: number;
  textInputUsd: number;
  inputSizeMode: string;
  note: string;
};

export function BenchmarkPanel({ styles }: { styles: StyleOption[] }) {
  const [styleId, setStyleId] = useState(styles[0]?.id || "");
  const [file, setFile] = useState<File | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const runLock = useRef(false);
  const [message, setMessage] = useState("");
  const [runId, setRunId] = useState("");

  async function quoteFile(next: File, nextStyle = styleId) {
    const bitmap = await createImageBitmap(next);
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    const res = await fetch(`/api/v1/super/ai/benchmark?width=${width}&height=${height}&styleId=${encodeURIComponent(nextStyle)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setQuote(null);
      setMessage(data.message || "Could not quote that photo.");
      return;
    }
    setQuote(data);
    setConfirm(false);
    setMessage("");
  }

  async function run() {
    if (!file || !quote || !confirm || runLock.current) return;
    runLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("photo", file);
      body.set("styleId", styleId);
      body.set("confirm", "yes");
      const res = await fetch("/api/v1/super/ai/benchmark", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message || "The benchmark did not run.");
        if (data.id) setRunId(data.id);
        return;
      }
      setRunId(data.id);
      setMessage(data.message || "Unvalidated model output.");
    } finally {
      runLock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-line bg-white p-4">
      <h2 className="font-serif text-2xl">Reference benchmark</h2>
      <p className="mt-2 text-sm leading-6">
        One OpenAI hairstyle edit of a selfie from this computer, plus the selected reference. Guests never use this path.
        The result is labelled unvalidated model output. There is no mask, no pasted face, and no automatic retry.
        The run cap is ₹{quote?.capInr ?? 30}, checked against the estimate below, which includes input tokens.
      </p>
      <p className="mt-2 text-sm leading-6">
        Real family photos are personal data. They are sent only to OpenAI, stored privately under var/benchmarks, and deleted after 72 hours
        or when you press Delete now on the result page.
      </p>
      <label className="mt-3 block text-sm">
        Style
        <select
          className="field mt-1"
          value={styleId}
          onChange={(event) => {
            setStyleId(event.target.value);
            setConfirm(false);
            if (file) void quoteFile(file, event.target.value);
          }}
        >
          {styles.map((style) => (
            <option key={style.id} value={style.id}>{style.name} ({style.lengthCategory})</option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm">
        Selfie from this computer
        <input
          className="mt-1 block text-sm"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const next = event.target.files?.[0] || null;
            setFile(next);
            setRunId("");
            setConfirm(false);
            if (next) void quoteFile(next);
          }}
        />
      </label>
      {quote && (
        <p className="mt-3 text-sm leading-6">
          {quote.model}, quality {quote.quality}, size {quote.size}, input_fidelity high, output png, n=1.
          Input size {quote.inputSizeMode}. Estimate ₹{quote.estimateInr.toFixed(2)} (${quote.estimateUsd.toFixed(3)}).
          Output ${quote.outputUsd.toFixed(3)} ({quote.outputTokens} tokens), image input ${quote.imageInputUsd.toFixed(3)} ({quote.imageInputTokens} tokens),
          text input ${quote.textInputUsd.toFixed(3)} ({quote.textInputTokens} tokens). {quote.note}
        </p>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} disabled={!quote} />
        <span>I understand this makes one paid OpenAI call and does not retry.</span>
      </label>
      <button className="btn mt-3" type="button" disabled={busy || !file || !quote || !confirm} onClick={() => void run()}>
        {busy ? "Running one call..." : "Run benchmark"}
      </button>
      {message && <p className="mt-3 text-sm leading-6">{message}</p>}
      {runId && (
        <p className="mt-2 text-sm">
          <a className="underline" href={`/super/ai/benchmark/${runId}`}>Open unvalidated stages</a>
        </p>
      )}
    </section>
  );
}
