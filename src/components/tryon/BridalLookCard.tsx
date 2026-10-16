"use client";

import { useState } from "react";

/** A real catalogue photo when public/bridal/{id}.webp exists. Otherwise a name card, never an icon. */
export function BridalLookCard({ id, name, blurb }: { id: string; name: string; blurb: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <div className="flex aspect-[3/4] flex-col justify-end bg-[#F3E6D8] px-3 py-3 text-left" role="img" aria-label={name}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A5B48]">Bridal look</p>
        <p className="font-serif text-base leading-tight text-[#3E304B]">{name}</p>
        <p className="mt-1 line-clamp-3 text-xs leading-snug text-[#5C4A42]">{blurb}</p>
      </div>
    );
  }
  return (
    <img
      src={`/bridal/${id}.webp`}
      alt=""
      width={768}
      height={1024}
      className="aspect-[3/4] w-full object-cover"
      onError={() => setMissing(true)}
    />
  );
}
