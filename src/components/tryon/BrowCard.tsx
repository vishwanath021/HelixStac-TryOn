"use client";

import { browCardPhoto } from "@/data/brow-cards";
import { browShapeById } from "@/data/brow-shapes";

function BrowDiagram({ id, name, badge }: { id: string; name: string; badge: boolean }) {
  const shape = browShapeById(id);
  if (!shape) return null;
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
    <svg
      viewBox="0 0 240 240"
      className={badge ? "pointer-events-none absolute bottom-1 right-1 h-9 w-9 overflow-hidden rounded-md ring-2 ring-white" : "aspect-square w-full"}
      aria-hidden={badge ? true : undefined}
    >
      {badge ? null : <title>{name}</title>}
      <rect width="240" height="240" fill="#E6C3A4" />
      <path d={shape.d} {...shared} />
      <path d={shape.d} transform="translate(240 0) scale(-1 1)" {...shared} />
    </svg>
  );
}

export function BrowCard({ id, name }: { id: string; name: string }) {
  const shape = browShapeById(id);
  if (!shape) {
    return <div className="grid aspect-square place-items-center bg-[#E6C3A4] px-2 text-center text-sm" />;
  }
  const photo = browCardPhoto(id);
  if (!photo) return <BrowDiagram id={id} name={name} badge={false} />;
  return (
    <span className="relative block aspect-square w-full" data-brow-card="photo">
      <img src={photo} alt="" width={512} height={512} className="aspect-square w-full object-cover" />
      <BrowDiagram id={id} name={name} badge />
    </span>
  );
}
