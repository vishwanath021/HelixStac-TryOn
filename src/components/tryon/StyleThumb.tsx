export function StyleThumb({ category, gender }: { category: string; gender: string }) {
  const hair = gender === "men" ? "#3a2a22" : gender === "kids" ? "#6a4634" : "#4a2c24";
  const face = "#e7c2a4";
  return (
    <svg viewBox="0 0 80 96" className="h-full w-full" aria-hidden>
      <rect width="80" height="96" fill="#f6efe6" />
      <ellipse cx="40" cy="46" rx="16" ry="18" fill={face} />
      {category === "fade" || category === "short" || category === "crop" || category === "taper" ? (
        <path d="M24 40c2-14 30-16 34 2 1 8-2 10-4 12-8 2-22 2-28-2-2-4-3-8-2-12z" fill={hair} />
      ) : category === "bob" ? (
        <path d="M18 38c4-18 40-20 46 2 2 18-4 28-12 30-6-10-16-12-22-8-8 4-14-6-12-24z" fill={hair} />
      ) : category === "bangs" ? (
        <path d="M16 42c6-22 42-24 50 0-2 8-8 10-14 6 2 16-6 22-12 22s-16-8-14-22c-6 2-10 0-10-6z" fill={hair} />
      ) : (
        <path d="M14 40c6-22 46-24 54 2 0 28-8 40-16 44-4-16-10-20-16-16-8 6-14-2-16-14-6 2-8-6-6-16z" fill={hair} />
      )}
      <circle cx="34" cy="46" r="1.2" fill="#241c16" />
      <circle cx="46" cy="46" r="1.2" fill="#241c16" />
    </svg>
  );
}
