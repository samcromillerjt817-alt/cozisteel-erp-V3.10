import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",

  // Auditoria de segurança (2ª rodada) — remove o fingerprinting trivial de framework via header.
  poweredByHeader: false,

  turbopack: {
    root: path.resolve(__dirname),
  },

  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  serverExternalPackages: [
    "bcryptjs",
    "sharp",
  ],
};

export default nextConfig;
