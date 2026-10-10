export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { productionEnvProblems } = await import("@/lib/env");
  const problems = productionEnvProblems();
  if (problems.length) {
    console.error(`Lookuvi will not start. ${problems.join(" ")}`);
    process.exit(1);
  }
}
