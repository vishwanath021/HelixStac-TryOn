const tones = {
  neutral: { background: "var(--selected)", color: "var(--aubergine)" },
  good: { background: "#e5f4ec", color: "var(--good)" },
  warn: { background: "#f8efdc", color: "var(--warn)" },
  bad: { background: "#f8e6e6", color: "var(--bad)" },
} as const;

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof tones }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={tones[tone]}>
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof tones {
  if (status === "ACTIVE") return "good";
  if (status === "TRIAL") return "warn";
  if (status === "SUSPENDED") return "bad";
  return "neutral";
}
