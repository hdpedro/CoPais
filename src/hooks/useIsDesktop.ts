"use client";

import { useSyncExternalStore } from "react";

/**
 * Subscribe to a `matchMedia` query and return `true` while the viewport
 * matches (default: ≥768px). Implemented with `useSyncExternalStore` so
 * render stays pure (react-hooks/purity + react-hooks/set-state-in-effect)
 * and SSR returns the deterministic `false` snapshot.
 */
export function useIsDesktop(breakpoint = 768) {
  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(`(min-width: ${breakpoint}px)`);
    mql.addEventListener("change", onStoreChange);
    return () => mql.removeEventListener("change", onStoreChange);
  };
  const getSnapshot = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
  };
  const getServerSnapshot = () => false;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
