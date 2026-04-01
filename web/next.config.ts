import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "development" && {
    async rewrites() {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:8000/api/:path*",
        },
      ];
    },
    experimental: {
      proxyTimeout: 300000,
      proxyClientMaxBodySize: 50 * 1024 * 1024,
    },
  }),
};

export default nextConfig;
