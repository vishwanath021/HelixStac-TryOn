"use client";

import { browShapeById } from "@/data/brow-shapes";

export function BrowCard({ id, name }: { id: string; name: string }) {
  const shape = browShapeById(id);
  if (!shape) {
    return <div className="grid aspect-square place-items-center bg-[#E6C3A4] px-2 text-center text-sm" />;
  }
  const shared = shape.fill
    ? { fill: "#2C1810", stroke: "none" }
    : {
        fill: "none",
        stroke: "#2C1810",
        strokeWidth: shape.stroke,
        strokeLinecap: "round" as const,
        strokeLinejoin: shape.join ?? "round",
      };
  return (
    <svg viewBox="0 0 240 240" className="aspect-square w-full" aria-hidden="true">
      <title>{name}</title>
      <rect width="240" height="240" fill="#E6C3A4" />
      <path d={shape.d} {...shared} />
      <path d={shape.d} transform="translate(240 0) scale(-1 1)" {...shared} />
    </svg>
  );
}
