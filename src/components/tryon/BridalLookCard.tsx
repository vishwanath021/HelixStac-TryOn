"use client";

import { useState } from "react";

/** Shows public/bridal/{id}.webp when that file is on disk. Otherwise a named card, never a broken image or a generated face. */
export function BridalLookCard({ id, name }: { id: string; name: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <div className="flex aspect-[3/4] flex-col justify-end bg-[#F3E6D8] px-3 py-3 text-left" aria-hidden="true">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A5B48]">Photo coming</p>
        <p className="font-serif text-base leading-tight text-[#3E304B]">{name}</p>
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
