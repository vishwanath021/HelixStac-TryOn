import Link from "next/link";
import { AiSettingsForm } from "@/components/admin/AiSettingsForm";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { platformAiView } from "@/lib/ai/settings-store";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SuperAiPage() {
  await pageSuper();
  const initial = await platformAiView();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Super admin</p>
          <h1 className="font-serif text-4xl">AI settings</h1>
        </div>
        <SignOutButton />
      </div>
      <p className="mb-4 text-sm">
        <Link className="underline" href="/super">Back to salons</Link>
      </p>
      <p className="mb-4 max-w-xl text-sm leading-6">
        Paste an OpenAI or Gemini key for paid style previews. Leave this empty to keep the demo, which shows the guest photo with the style reference. Calibration run checks mask placement on five pictures and will not spend more than about ₹30.
      </p>
      <AiSettingsForm scope="platform" initial={initial} canToggleByo />
    </main>
  );
}
