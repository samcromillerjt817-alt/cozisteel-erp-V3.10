import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",

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
