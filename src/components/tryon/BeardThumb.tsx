export function BeardThumb({ name }: { name: string }) {
  const seed = [...name].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 7);
  const ink = ["#3a2418", "#2c1b12", "#5a3a28"][seed % 3];
  const ground = ["#f6efe6", "#f3e7da", "#efe4d4"][seed % 3];
  const clean = name === "Clean Shave";
  const chin = name === "Goatee" || name === "French Beard" || name === "Van Dyke" || name === "Anchor" || name === "Circle Beard";
  return (
    <svg viewBox="0 0 112 84" className="h-full w-full" aria-hidden>
      <rect width="112" height="84" fill={ground} />
      <ellipse cx="56" cy="36" rx="24" ry="28" fill="#e8bc96" />
      <path d="M34 34 C38 58 74 58 78 34" fill="#e8bc96" />
      {!clean && !chin && (
        <path d="M36 40 C38 62 74 62 76 40 C70 58 42 58 36 40 Z" fill={ink} opacity={name.includes("Stubble") ? 0.45 : 0.85} />
      )}
      {chin && <path d="M48 48 C50 66 62 66 64 48 C60 60 52 60 48 48 Z" fill={ink} />}
      {!clean && <path d="M44 44 H68" stroke={ink} strokeWidth={name === "Light Stubble" ? 2 : 3.5} strokeLinecap="round" />}
      <ellipse cx="46" cy="32" rx="4" ry="2" fill="none" stroke="#c48b6a" />
      <ellipse cx="66" cy="32" rx="4" ry="2" fill="none" stroke="#c48b6a" />
    </svg>
  );
}
