/**
 * Content-Security-Policy for HTML responses.
 *
 * Production scripts use a per-request nonce. Next.js reads that nonce from the
 * request Content-Security-Policy header and stamps the scripts it injects.
 * `strict-dynamic` then allows those scripts to load the app chunks.
 *
 * MediaPipe (`@mediapipe/tasks-vision` vision_bundle.mjs) does not call eval() or
 * new Function(). It compiles WASM from /mediapipe/wasm, which needs
 * `wasm-unsafe-eval`, and it may start a blob: worker (`worker-src`).
 * `unsafe-eval` is not in the production policy.
 *
 * Development keeps `unsafe-eval` and `unsafe-inline` because React Fast Refresh
 * evaluates code. `next dev` (Playwright) uses that policy. `next start` does not.
 *
 * `style-src` keeps `unsafe-inline` because React style attributes are not covered
 * by a style-element nonce.
 */
export function contentSecurityPolicy(nonce: string, opts: { dev: boolean; embed: boolean }) {
  if (opts.embed) return "frame-ancestors *";
  const script = opts.dev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' blob:`;
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
