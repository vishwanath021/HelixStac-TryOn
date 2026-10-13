import { SuperShell } from "@/components/admin/SuperShell";

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  return <SuperShell>{children}</SuperShell>;
}
