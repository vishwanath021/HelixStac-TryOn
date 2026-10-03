export function StyleThumb({ category, gender, name }: { category: string; gender: string; name: string }) {
  const seed = [...name].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 11);
  const hair = ["#241812", "#4a3022", "#1a1411", "#6a4030", "#3a2920"][seed % 5];
  const face = gender === "kids" ? "#f3cba6" : "#e8bc96";
  const ground = ["#f6efe6", "#f3e7da", "#f8f3ec"][seed % 3];
  const part = seed % 2 === 0 ? 34 : 46;

  return (
    <svg viewBox="0 0 80 100" className="h-full w-full" aria-hidden>
      <rect width="80" height="100" fill={ground} />
      <path d="M18 100c4-18 10-28 22-28s18 10 22 28" fill="#f7f1ea" />
      <path d="M32 78c2 10 4 16 8 16s6-6 8-16c-4 3-12 3-16 0z" fill={face} />
      <ellipse cx="40" cy="52" rx="14" ry="17" fill={face} />
      <Hair category={category} hair={hair} part={part} />
      <circle cx="34" cy="52" r="1.1" fill="#241c16" />
      <circle cx="46" cy="52" r="1.1" fill="#241c16" />
      <path d="M36 60c2 2 6 2 8 0" fill="none" stroke="#c48b6a" strokeWidth="0.8" />
    </svg>
  );
}

function Hair({ category, hair, part }: { category: string; hair: string; part: number }) {
  if (category === "fade" || category === "crop" || category === "taper" || category === "short") {
    return (
      <g>
        <path d="M24 48c1-16 12-22 18-22 8 0 16 6 16 20-2 4-6 6-10 5-8-2-16-1-22-1-2-1-2-1-2-2z" fill={hair} />
        <path d="M22 50c2 8 4 12 6 12 0-6 2-10 4-12-4 0-8-1-10 0z" fill={hair} opacity="0.45" />
        <path d="M52 48c2 6 4 12 8 14-2-8-4-12-8-14z" fill={hair} opacity="0.35" />
      </g>
    );
  }
  if (category === "bob") {
    return <path d="M18 46c2-20 12-26 22-26s20 6 22 24c1 16-2 24-8 28-4-12-10-16-14-14s-10 2-14 12c-8-4-10-12-8-24z" fill={hair} />;
  }
  if (category === "bangs") {
    return (
      <g>
        <path d="M16 48c4-24 14-30 24-30s22 8 26 28c0 8-4 12-8 10 2 14-4 22-12 22s-16-8-14-22c-6 2-12 0-16-8z" fill={hair} />
        <path d={`M${part - 10} 40c6 8 14 10 22 4`} fill="none" stroke={hair} strokeWidth="6" strokeLinecap="round" />
      </g>
    );
  }
  if (category === "waves" || category === "curls") {
    return (
      <g fill={hair}>
        <path d="M16 50c4-22 16-28 24-28s20 6 24 26c2 10-2 16-6 18 4 8 2 16-2 22-6-8-8-14-12-14s-8 6-12 14c-6-6-8-14-6-22-6-2-10-8-10-16z" />
        <circle cx="22" cy="70" r="5" />
        <circle cx="58" cy="68" r="4.5" />
        <circle cx="30" cy="78" r="3.5" />
      </g>
    );
  }
  if (category === "classic") {
    return <path d={`M22 46c2-16 10-22 ${part - 16}-22 14 0 22 8 24 22 0 6-6 10-8 8 2 2-2 8-8 8-8-6-16-4-20 2-6-2-10-8-8-18z`} fill={hair} />;
  }
  if (category === "kids") {
    return <path d="M24 48c2-14 10-18 16-18s14 4 16 16c1 8-2 12-6 12 1 4-2 8-6 8s-8-4-8-8c-6 0-12-2-12-10z" fill={hair} />;
  }
  return <path d="M14 48c4-24 16-30 26-30s24 8 28 28c1 18-2 30-8 38-4-14-10-18-16-16-6 2-12 2-16 14-8-8-14-18-14-34z" fill={hair} />;
}
