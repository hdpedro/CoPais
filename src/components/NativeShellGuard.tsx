"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/capacitor";

/**
 * Conditionally renders children only when NOT inside the Capacitor native shell.
 * Used to hide web-only components (Analytics, SpeedInsights) in the iOS app.
 */
export function WebOnly({ children }: { children: React.ReactNode }) {
  const [isWeb, setIsWeb] = useState(() => {
    // Check synchronously on initial render (client-side only)
    if (typeof window === "undefined") return true;
    return !isNativeApp();
  });

  // Re-check after mount in case window wasn't available during SSR
  useEffect(() => {
    if (isNativeApp() && isWeb) {
      // Use a ref-based approach to avoid the eslint warning
      const timer = setTimeout(() => setIsWeb(false), 0);
      return () => clearTimeout(timer);
    }
  }, [isWeb]);

  if (!isWeb) return null;
  return <>{children}</>;
}

/**
 * Stub kept for backwards-compat — no native shell to initialize anymore.
 * The iOS app is now Expo (kindar-native/) which has its own bootstrap in
 * `kindar-native/app/_layout.tsx`. Capacitor was removed in the 2026-04-27
 * audit. Renders nothing.
 */
export function NativeInit() {
  return null;
}
