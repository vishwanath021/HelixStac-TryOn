let draining = false;

export function isDraining() {
  return draining;
}

export function beginDrain() {
  draining = true;
}

export function installShutdown() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  const stop = () => {
    if (draining) return;
    beginDrain();
    void import("@/lib/prisma")
      .then((mod) => mod.prisma.$disconnect())
      .catch(() => undefined)
      .finally(() => {
        setTimeout(() => process.exit(0), 500).unref();
      });
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
