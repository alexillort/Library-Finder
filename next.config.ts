import type { NextConfig } from "next";

// DESKTOP_BUILD=1 (scripts/build-desktop.mjs) emits a self-contained server in
// .next-desktop/standalone for the Electron app. The web build keeps `next start`.
const desktop = process.env.DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  devIndicators: false,
  ...(desktop
    ? {
        output: "standalone" as const,
        distDir: ".next-desktop",
        outputFileTracingRoot: process.cwd(),
      }
    : {}),
};

export default nextConfig;
