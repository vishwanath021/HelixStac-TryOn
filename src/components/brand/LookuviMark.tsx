const WAVE_A = "M14 23c8 1 11 11 18 13 8 2 12-7 19-5";
const WAVE_B = "M14 41c8 1 11 9 18 11 8 2 11-6 17-4";

const PLATFORM_LOGOS = new Set(["/brand/lookuvi-mark.svg", "/brand/demo-mark.svg", "/brand/mark.svg"]);

/** True when the salon has no logo of its own, so the header should draw the Lookuvi mark. */
export function isPlatformLogo(url: string | null | undefined) {
  if (!url) return true;
  return PLATFORM_LOGOS.has(url);
}

/** Filled rounded square and two thick hair waves. Paths match public/brand/lookuvi-mark.svg. */
export function LookuviMark({
  className = "h-10 w-10",
  title,
  tone = "ink",
}: {
  className?: string;
  title?: string;
  tone?: "ink" | "inverse";
}) {
  const fill = tone === "inverse" ? "#FFFFFF" : "#3E304B";
  const wave = tone === "inverse" ? "#3E304B" : "#FFFFFF";
  const echo = tone === "inverse" ? "#69517D" : "#B6A0C9";
  return (
    <svg className={className} viewBox="0 0 64 64" role={title ? "img" : "presentation"} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="64" height="64" rx="16" fill={fill} />
      <path d={WAVE_A} fill="none" stroke={wave} strokeWidth="7" strokeLinecap="round" />
      <path d={WAVE_B} fill="none" stroke={echo} strokeWidth="6.5" strokeLinecap="round" />
    </svg>
  );
}

export function LookuviLockup({ tagline = true, compact = false }: { tagline?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LookuviMark className={compact ? "h-10 w-10" : "h-14 w-14"} title="Lookuvi" />
      <div>
        <p className="font-sans text-[1.65rem] font-bold leading-none tracking-[-0.04em] text-[#3E304B]">lookuvi</p>
        {tagline && <p className="mt-1 text-sm text-muted">See your next look.</p>}
      </div>
    </div>
  );
}
