import Link from "next/link";
import { LookuviMark } from "@/components/brand/LookuviMark";
import { SignOutButton } from "@/components/admin/SignOutButton";

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="nav-side">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <div className="mr-2 flex items-center gap-2 text-white">
            <LookuviMark className="h-9 w-9" tone="inverse" />
            <span className="font-sans text-xl font-semibold tracking-tight">lookuvi</span>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Platform">
            <Link href="/super">Salons</Link>
            <Link href="/super/ai">AI settings</Link>
          </nav>
          <div className="ml-auto">
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
