import { AiSettingsForm } from "@/components/admin/AiSettingsForm";
import { salonAiView } from "@/lib/ai/settings-store";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminAiPage() {
  const { tenant, membership } = await pageTenant();
  if (membership.role !== "OWNER") {
    return (
      <main>
        <h1 className="font-serif text-4xl">AI settings</h1>
        <p className="mt-2">Only the salon owner can manage the AI key.</p>
      </main>
    );
  }
  const initial = await salonAiView(tenant.id);
  return (
    <main>
      <h1 className="mb-2 font-serif text-4xl">AI settings</h1>
      {initial.allowByo ? (
        <>
          <p className="mb-4 max-w-xl text-sm leading-6">
            Paste this salon&apos;s OpenAI or Gemini key. Guests still try a look without an account. Without a key, they see their photo beside the style reference.
          </p>
          <AiSettingsForm scope="salon" initial={initial} />
        </>
      ) : (
        <p className="max-w-xl text-sm leading-6">
          HelixStac manages the platform key for this salon. Paid previews use that key. The testing spend cap is ₹{initial.spend.capInr.toFixed(0)}.
        </p>
      )}
    </main>
  );
}
