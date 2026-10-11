import { TotpPanel } from "@/components/account/TotpPanel";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const { session, membership } = await pageTenant();
  if (membership.role !== "OWNER") {
    return (
      <main>
        <h1 className="page-title">Authenticator</h1>
        <p className="mt-2 text-sm">Only a salon owner can change two-factor on this salon login.</p>
      </main>
    );
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { totpEnabled: true } });
  return <TotpPanel enabled={Boolean(user?.totpEnabled)} required={false} />;
}
