import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/": ["./data/snapshot.json"],
    "/api/distribution": ["./data/snapshot.json"],
    "/api/addresses": ["./data/address-index.json"],
  },
};

export default nextConfig;
