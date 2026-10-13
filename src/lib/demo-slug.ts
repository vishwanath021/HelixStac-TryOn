const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slug of the seeded demo salon. `npm run seed` and the Demo salon link both use this. */
export function demoSlug(env: NodeJS.ProcessEnv = process.env) {
  const raw = (env.DEMO_SLUG || "demo").trim().toLowerCase();
  return SLUG.test(raw) ? raw : "demo";
}

export function demoSalonPath(env: NodeJS.ProcessEnv = process.env) {
  return `/s/${demoSlug(env)}`;
}
