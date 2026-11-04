import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pglite-prisma-adapter", "pg", "@prisma/client"],
  poweredByHeader: false,
  typedRoutes: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
