import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Image optimization: prefer modern formats
  images: {
    formats: ["image/webp", "image/avif"],
  },

  // Enable gzip compression
  compress: true,

  // Stricter React mode for catching bugs early
  reactStrictMode: true,

  // Cache build artifacts for faster rebuilds on Vercel
  experimental: {
    serverMinification: true,
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress all Sentry logs during build
  silent: true,

  // Disable source map upload (enable later with auth token)
  sourcemaps: {
    disable: true,
  },

  // Disable telemetry during build
  telemetry: false,

  // Tunnel Sentry events through Next.js to avoid ad-blockers
  tunnelRoute: "/monitoring",
});
