import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.MENDELEY_SERVER === '1' ? undefined : 'export',
  images: { unoptimized: true },
  devIndicators: false,
};

export default nextConfig;
