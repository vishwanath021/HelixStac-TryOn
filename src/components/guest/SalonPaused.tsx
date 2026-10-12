export function SalonPaused({ name }: { name: string }) {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <p className="text-sm text-muted">{name}</p>
      <h1 className="mt-3 page-title">This salon is paused</h1>
      <p className="mt-3 text-sm leading-6">This salon&apos;s try-on is paused. Please call or message them directly.</p>
    </main>
  );
}
