"use client";

import { useEffect, useState } from "react";
import { t } from "@/data/i18n";
import { displayedWait } from "@/lib/queue/wait-display";

function useDisplayedWait(serverWait: number) {
  const [sampledAt] = useState(() => Date.now());
  const [now, setNow] = useState(sampledAt);

  useEffect(() => {
    let timer = 0;
    const arm = () => {
      const elapsed = Date.now() - sampledAt;
      const into = elapsed % 60_000;
      const delay = into === 0 ? 60_000 : 60_000 - into;
      timer = window.setTimeout(() => {
        setNow(Date.now());
        arm();
      }, delay);
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [sampledAt]);

  return displayedWait(serverWait, sampledAt, now);
}

export function QueueWait({
  serverWait,
  ahead,
  token,
  lang,
  phrase,
}: {
  serverWait: number;
  ahead: number;
  token?: number;
  lang: string;
  phrase?: "next" | "turn" | "join";
}) {
  const minutes = useDisplayedWait(serverWait);
  if (phrase === "join") {
    return (
      <div className="mt-6 text-center" data-queue-wait={String(minutes)} data-queue-join="yes">
        <p className="text-4xl font-bold leading-none">{t(lang, "queueJoin")}</p>
        <p className="mt-3 text-sm text-muted">{t(lang, "queueWaitingAbout", { ahead, min: minutes })}</p>
      </div>
    );
  }
  const zero = phrase === "turn" || minutes <= 0;
  const label = phrase === "turn" ? t(lang, "queueTurnNow") : t(lang, "queueYoureNext");

  return (
    <div className="mt-6 text-center" data-queue-wait={zero ? "0" : String(minutes)}>
      {zero ? (
        <p className="text-4xl font-bold leading-none text-[var(--good)]">{label}</p>
      ) : (
        <>
          <p className="text-6xl font-bold leading-none tracking-tight text-[var(--good)] tabular-nums">{t(lang, "queueWaitMin", { min: minutes })}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">{t(lang, "queueEstWait")}</p>
        </>
      )}
      {token == null ? null : <p className="mt-4 text-base" data-queue-token={token}>{t(lang, "queueToken", { token })}</p>}
      <p className={token == null ? "mt-4 text-sm text-muted" : "text-sm text-muted"}>{t(lang, "queueAheadShort", { ahead })}</p>
    </div>
  );
}
