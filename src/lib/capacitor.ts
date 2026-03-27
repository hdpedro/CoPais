/**
 * Capacitor bridge utilities for iOS native features.
 * Safe to import on web — all functions check for Capacitor availability.
 */

/** Check if running inside Capacitor native shell */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor injects this on the window object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).Capacitor;
}

/** Check if running on iOS specifically */
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor as
    | { getPlatform?: () => string }
    | undefined;
  return cap?.getPlatform?.() === "ios";
}

/** Trigger haptic feedback (light impact) — no-op on web */
export async function hapticLight(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Silently fail on web
  }
}

/** Trigger haptic feedback (medium impact) — no-op on web */
export async function hapticMedium(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // Silently fail on web
  }
}

/** Trigger haptic notification feedback — no-op on web */
export async function hapticNotification(
  type: "SUCCESS" | "WARNING" | "ERROR" = "SUCCESS"
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    const typeMap = {
      SUCCESS: NotificationType.Success,
      WARNING: NotificationType.Warning,
      ERROR: NotificationType.Error,
    };
    await Haptics.notification({ type: typeMap[type] });
  } catch {
    // Silently fail on web
  }
}

/** Configure iOS status bar — call once on app init */
export async function configureStatusBar(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#EEECEA" });
  } catch {
    // Silently fail on web
  }
}

/** Hide splash screen — call after app is ready */
export async function hideSplashScreen(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    // Silently fail on web
  }
}

/** Listen for hardware back button (iOS swipe-back is native, this is for Android) */
export async function setupBackButton(
  handler: () => void
): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  try {
    const { App } = await import("@capacitor/app");
    const listener = await App.addListener("backButton", handler);
    return () => listener.remove();
  } catch {
    return () => {};
  }
}
