/**
 * Haptic feedback utilities for native-feeling touch interactions.
 *
 * Priority:
 * 1. Capacitor Haptics API (iOS/Android native shell)
 * 2. Web Vibration API (Android Chrome PWA)
 * 3. No-op (iOS Safari, desktop)
 *
 * Re-exports from capacitor.ts for Capacitor-native, adds web fallbacks.
 */

import {
  isNativeApp,
  hapticLight as capacitorHapticLight,
  hapticMedium as capacitorHapticMedium,
  hapticNotification,
} from "./capacitor";

export function hapticLight(): void {
  if (isNativeApp()) {
    capacitorHapticLight();
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

export function hapticMedium(): void {
  if (isNativeApp()) {
    capacitorHapticMedium();
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(20);
  }
}

export function hapticSuccess(): void {
  if (isNativeApp()) {
    hapticNotification("SUCCESS");
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([10, 50, 10]);
  }
}

export function hapticError(): void {
  if (isNativeApp()) {
    hapticNotification("ERROR");
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([30, 50, 30]);
  }
}
