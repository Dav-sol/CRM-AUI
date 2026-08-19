import type { NextConfig } from "next";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_BASE_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;