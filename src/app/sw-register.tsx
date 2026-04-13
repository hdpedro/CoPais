"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/capacitor";

export function ServiceWorkerRegister() {
  useEffect(() => {
    // Skip SW registration inside Capacitor native shell (WKWebView handles caching differently)
    if (isNativeApp()) return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service worker registration failed silently
      });
    }
  }, []);

  return null;
}
