import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR?.trim();
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  assetPrefix: isProduction ? "/cdn" : undefined,
  images: {
    unoptimized: true,
  },
  output: "export",
  reactStrictMode: true,
  ...(distDir ? { distDir } : {}),
};

export default nextConfig;
