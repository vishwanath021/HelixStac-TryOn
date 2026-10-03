"use client";

import { useState } from "react";

export function StyleCard({ id, name, folder = "styles" }: { id: string; name: string; folder?: "styles" | "brows" | "beards" | "nails" }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <div className="grid aspect-square place-items-center bg-[#f4f1ec] px-3 text-center text-sm text-[#3a342e]" role="img" aria-label={`${name} style reference`}>
        {name}
      </div>
    );
  }
  return (
    <img
      src={`/${folder}/${id}.jpg`}
      width={512}
      height={512}
      alt={`${name} style reference`}
      loading="lazy"
      className="aspect-square w-full object-cover"
      onError={() => setMissing(true)}
    />
  );
}
