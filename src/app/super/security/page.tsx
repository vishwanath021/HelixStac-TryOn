import { TotpPanel } from "@/components/account/TotpPanel";
import { prisma } from "@/lib/prisma";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SuperSecurityPage() {
  const session = await pageSuper({ allowEnrollment: true });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { totpEnabled: true, isSuperAdmin: true } });
  const required = process.env.NODE_ENV === "production" && Boolean(user?.isSuperAdmin);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <TotpPanel enabled={Boolean(user?.totpEnabled)} required={required} />
    </main>
  );
}
