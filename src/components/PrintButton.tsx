"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button className="btn secondary" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
