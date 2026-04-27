/**
 * Stub do Capacitor — o iOS oficial agora é Expo (kindar-native/), o
 * shell Capacitor (DEV/ios/) foi removido na auditoria 2026-04-27.
 *
 * Este arquivo permanece apenas para os 3 chamadores que ainda perguntam
 * `isNativeApp()` no código do PWA (sw-register, NativeShellGuard,
 * PWAInstallBanner). Todas as funções viram no-op — não há mais shell
 * nativo Capacitor a configurar.
 *
 * Removido:
 *   - imports de `@capacitor/*` (deps removidos do package.json)
 *   - integração com StatusBar / SplashScreen / Keyboard / Push (Capacitor)
 *   - StoreKit plugin (`ios-plugins/` removido)
 *   - APNs registration via Capacitor (Expo cuida — ver kindar-native/)
 */

/** Sempre false: o app PWA não roda mais em shell Capacitor. */
export function isNativeApp(): boolean {
  return false;
}

/** Sempre false. */
export function isIOS(): boolean {
  return false;
}

export async function hapticLight(): Promise<void> {
  // no-op
}

export async function hapticMedium(): Promise<void> {
  // no-op
}

export async function hapticNotification(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _type: "SUCCESS" | "WARNING" | "ERROR" = "SUCCESS",
): Promise<void> {
  // no-op
}

export async function configureStatusBar(): Promise<void> {
  // no-op
}

export async function hideSplashScreen(): Promise<void> {
  // no-op
}

export async function setupBackButton(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _handler: () => void,
): Promise<() => void> {
  return () => {};
}
