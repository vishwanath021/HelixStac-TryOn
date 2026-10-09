import Link from "next/link";
import { SignOutButton } from "@/components/admin/SignOutButton";

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="nav-side">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <p className="mr-2 font-serif text-2xl">HelixStac</p>
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
