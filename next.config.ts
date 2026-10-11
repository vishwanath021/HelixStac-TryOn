import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/.git/**", "**/node_modules/**", "**/.next/**", "**/prisma/**", "**/test-results/**", "**/docs/screenshots/**"],
      };
    }
    return config;
  },
  serverExternalPackages: ["sharp", "bcryptjs", "@prisma/client"],
  async headers() {
    return [
      {
        source: "/s/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/embed/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
