export function TryOnUnavailable({ name }: { name: string }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="page-title">{name}</h1>
      <p className="mt-3 text-sm text-muted">Try-on is not available.</p>
    </main>
  );
}
