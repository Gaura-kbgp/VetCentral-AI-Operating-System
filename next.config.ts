import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // pdf-parse ESM build exposes raw PDF.js internals — keep it as CJS at runtime
  serverExternalPackages: ['pdf-parse'],
  // Raise Turbopack's internal memory limit to match the Node heap increase
  experimental: {
    turbopackMemoryLimit: 3 * 1024 * 1024 * 1024, // 3 GB
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
