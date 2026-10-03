const POLISH: Record<string, string> = {
  "Classic French": "#f4e7dc",
  "Glossy Red": "#9d1c2f",
  "Nude Minimal": "#e7cbb8",
  "Chrome Silver": "#c5ccd4",
  "Glitter Ombre": "#d7a15e",
  "Pearl Accent": "#f7f1ea",
  "Floral Tip": "#e7b7c6",
  "Marble Nude": "#ecd8cc",
  "Cat-Eye": "#6d4c6e",
  "Bridal Glam": "#f3d5e4",
};

export function NailThumb({ name }: { name: string }) {
  const fill = POLISH[name] ?? "#e7cbb8";
  const tip = name === "Classic French" ? "#fffaf6" : fill;
  return (
    <svg viewBox="0 0 112 84" className="h-full w-full" aria-hidden>
      <rect width="112" height="84" fill="#f6efe6" />
      <path d="M18 70 C22 40 90 40 94 70 Z" fill="#e8bc96" />
      {[28, 44, 60, 76].map((x) => (
        <g key={x}>
          <rect x={x} y="28" width="10" height="28" rx="5" fill="#e8bc96" />
          <rect x={x + 1} y="22" width="8" height="14" rx="4" fill={fill} />
          <rect x={x + 1} y="22" width="8" height="4" rx="2" fill={tip} />
        </g>
      ))}
    </svg>
  );
}
