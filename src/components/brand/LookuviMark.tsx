const WAVE_A = "M24 104c14-16 26-4 36 6 14 14 22 8 32-2 8-8 14-6 18 0";
const WAVE_B = "M24 126c14-16 26-4 36 6 14 14 22 8 32-2 8-8 14-6 18 0";

/** Stadium outline and two lavender hair-waves. Paths match public/brand/lookuvi-mark.svg. */
export function LookuviMark({
  className = "h-14 w-10",
  title,
  tone = "ink",
}: {
  className?: string;
  title?: string;
  tone?: "ink" | "inverse";
}) {
  const stroke = tone === "inverse" ? "#FFFFFF" : "#3E304B";
  return (
    <svg className={className} viewBox="0 0 120 176" role={title ? "img" : "presentation"} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect x="9" y="9" width="102" height="158" rx="51" fill="none" stroke={stroke} strokeWidth="12" />
      <path d={WAVE_A} fill="none" stroke="#B6A0C9" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <path d={WAVE_B} fill="none" stroke="#D5C6E4" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LookuviLockup({ tagline = true, compact = false }: { tagline?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LookuviMark className={compact ? "h-10 w-7" : "h-14 w-10"} title="Lookuvi" />
      <div>
        <p className="font-sans text-[1.65rem] font-bold leading-none tracking-[-0.04em] text-[#3E304B]">lookuvi</p>
        {tagline && <p className="mt-1 text-sm text-muted">See your next look.</p>}
      </div>
    </div>
  );
}
