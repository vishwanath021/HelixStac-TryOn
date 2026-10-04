import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // The dev/router proxy otherwise stops at 30 seconds. Fal comparisons wait one hour.
    proxyTimeout: 3_780_000,
  },
  serverExternalPackages: ["sharp", "bcryptjs", "@prisma/client"],
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
