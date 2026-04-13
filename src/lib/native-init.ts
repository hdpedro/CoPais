/**
 * Centralized native initialization for Capacitor iOS shell.
 * Called once on app mount via NativeInit component in layout.tsx.
 *
 * Configures: StatusBar, SplashScreen, Keyboard, Push Notifications.
 * Safe to import on web — all functions check for Capacitor availability.
 *
 * Follows GripFlow pattern: gripflow/src/lib/native.ts
 */

import { isNativeApp, isIOS } from "./capacitor";

export async function initNative(): Promise<void> {
  if (!isNativeApp()) return;

  // Status bar
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
    if (isIOS()) {
      await StatusBar.setBackgroundColor({ color: "#EEECEA" });
    }
  } catch {
    // Plugin not available
  }

  // Splash screen (auto-hides via config, this is a fallback)
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    setTimeout(() => SplashScreen.hide(), 2000);
  } catch {
    // Plugin not available
  }

  // Keyboard
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    Keyboard.setAccessoryBarVisible({ isVisible: true });
  } catch {
    // Plugin not available
  }

  // Push notifications — request permission and register for APNs
  try {
    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") {
      await PushNotifications.register();
    }

    // Listen for APNs device token
    PushNotifications.addListener("registration", (token) => {
      // Save token to backend for sending notifications via APNs
      fetch("/api/push/register-apns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.value }),
      }).catch(() => {});
    });

    // Handle push received while app is in foreground
    PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        // Could show an in-app notification banner here
        console.log("[Push] Received:", notification.title);
      }
    );

    // Handle user tapping on a push notification
    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const url = action.notification.data?.url;
        if (url && typeof url === "string") {
          window.location.href = url;
        }
      }
    );
  } catch {
    // Plugin not available
  }
}
