import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
