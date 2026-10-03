import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-5 py-20">
      <h1 className="font-serif text-4xl">That page is not here.</h1>
      <p className="mt-3 text-sm text-muted">Check the salon link, or go back to the demo.</p>
      <Link className="btn mt-6" href="/s/demo-salon">Demo salon</Link>
    </main>
  );
}
