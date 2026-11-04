import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pglite-prisma-adapter", "pg", "@prisma/client"],
  poweredByHeader: false,
  typedRoutes: false,
  outputFileTracingIncludes: { "/cards/[cardId]/image": ["./node_modules/@fontsource/*/files/*-latin-*-*.woff"] },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
