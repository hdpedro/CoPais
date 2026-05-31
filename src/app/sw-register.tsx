"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/capacitor";

export function ServiceWorkerRegister() {
  useEffect(() => {
    // Skip SW registration inside Capacitor native shell (WKWebView handles caching differently)
    if (isNativeApp()) return;

    // Skip on localhost: the SW caches hashed JS chunks and, with Turbopack
    // HMR on Windows/OneDrive, serves stale client bundles across restarts
    // (causing phantom hydration mismatches in dev). Prod domains still register.
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host)) {
      navigator.serviceWorker?.getRegistrations?.().then((regs) => {
        for (const r of regs) r.unregister();
      }).catch(() => {});
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service worker registration failed silently
      });
    }
  }, []);

  return null;
}
