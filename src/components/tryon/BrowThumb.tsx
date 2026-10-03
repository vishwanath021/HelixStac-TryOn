export function BrowThumb({ name }: { name: string }) {
  const seed = [...name].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 5);
  const ink = ["#3a2418", "#2a1c14", "#4a3024"][seed % 3];
  const ground = ["#f6efe6", "#f3e7da", "#f8f3ec"][seed % 3];
  const paths: Record<string, [string, string]> = {
    "Soft Arch": ["M18 28 C28 18 42 18 52 26", "M62 26 C72 18 86 18 96 28"],
    "Straight Brow": ["M16 24 H52", "M62 24 H98"],
    "High Arch": ["M16 32 C30 14 44 14 54 30", "M60 30 C70 14 84 14 98 32"],
    Rounded: ["M16 30 C28 16 44 16 54 30", "M60 30 C70 16 86 16 98 30"],
    "S-Shape": ["M16 30 C26 18 36 32 52 22", "M62 22 C78 32 88 18 98 30"],
    Feathered: ["M16 28 C30 20 46 22 54 26", "M60 26 C70 22 86 20 98 28"],
    "Bold Natural": ["M14 30 C28 16 46 16 56 28", "M58 28 C68 16 86 16 100 30"],
  };
  const [left, right] = paths[name] ?? paths["Soft Arch"];
  const width = name === "Bold Natural" || name === "Straight Brow" ? 5.5 : 3.2;
  return (
    <svg viewBox="0 0 112 84" className="h-full w-full" aria-hidden>
      <rect width="112" height="84" fill={ground} />
      <ellipse cx="56" cy="48" rx="22" ry="26" fill="#e8bc96" />
      <path d={left} fill="none" stroke={ink} strokeWidth={width} strokeLinecap="round" />
      <path d={right} fill="none" stroke={ink} strokeWidth={width} strokeLinecap="round" />
      <ellipse cx="40" cy="40" rx="6" ry="3.2" fill="none" stroke="#c48b6a" strokeWidth="1" />
      <ellipse cx="72" cy="40" rx="6" ry="3.2" fill="none" stroke="#c48b6a" strokeWidth="1" />
    </svg>
  );
}
