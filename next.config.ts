import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ["./data/snapshot.json"],
    "/api/distribution": ["./data/snapshot.json"],
  },
};

export default nextConfig;
