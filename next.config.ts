import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {"/*": ["./.data/**/*", "./.env*", "./.reference/**/*"]},
  outputFileTracingIncludes: {
    "/api/siting": ["./runtime-data/*.json.gz"],
    "/api/data": ["./runtime-data/mongolia-logistics.json.gz"],
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
