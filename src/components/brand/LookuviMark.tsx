export function LookuviMark({ className = "h-10 w-10", title }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role={title ? "img" : "presentation"} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="64" height="64" rx="16" fill="#3E304B" />
      <rect x="18" y="8" width="28" height="48" rx="14" fill="none" stroke="#F4F1F8" strokeWidth="3" />
      <path d="M24 28c2.4-4.2 4.6-4.6 6.4-.4 1.6-4.4 4-4.4 6.6-.2" fill="none" stroke="#B6A0C9" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24 36.5c2.4-4.2 4.6-4.6 6.4-.4 1.6-4.4 4-4.4 6.6-.2" fill="none" stroke="#D5C6E4" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function LookuviLockup({ tagline = true, compact = false }: { tagline?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LookuviMark className={compact ? "h-9 w-9" : "h-12 w-12"} title="Lookuvi" />
      <div>
        <p className="font-sans text-[1.65rem] font-semibold leading-none tracking-tight text-aubergine">lookuvi</p>
        {tagline && <p className="mt-1 text-sm text-muted">See your next look.</p>}
      </div>
    </div>
  );
}
