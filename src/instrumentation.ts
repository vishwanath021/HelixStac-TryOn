export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { relaxHttpServerTimeouts } = await import("@/lib/http/server-timeout");
  relaxHttpServerTimeouts();
}
