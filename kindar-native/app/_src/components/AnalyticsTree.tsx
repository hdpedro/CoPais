/**
 * AnalyticsTree — wraps the app with `<PostHogProvider>` and emits
 * `$screen` events on every expo-router pathname change.
 *
 * Why manual screen capture? `posthog-react-native` auto-captures
 * screens only when wrapped in a React Navigation `<NavigationContainer>`,
 * which expo-router does not expose. Per official Expo docs, the
 * recommended pattern is `usePathname()` → `posthog.screen(path)`.
 *
 * If analytics is disabled (no env key), this renders children directly
 * with zero overhead.
 */

import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { getAnalyticsClient } from '../lib/analytics';

function ScreenTracker() {
  const pathname = usePathname();
  const posthog = usePostHog();

  useEffect(() => {
    if (!pathname || !posthog) return;
    try {
      posthog.screen(pathname);
    } catch {
      // swallow — analytics never breaks UX
    }
  }, [pathname, posthog]);

  return null;
}

export default function AnalyticsTree({ children }: { children: React.ReactNode }) {
  const client = getAnalyticsClient();
  if (!client) return <>{children}</>;

  // `captureScreens: false` — required for expo-router (auto-capture
  // needs a NavigationContainer ref, which expo-router hides). The
  // ScreenTracker below replaces it cleanly.
  return (
    <PostHogProvider client={client} autocapture={{ captureScreens: false }}>
      <ScreenTracker />
      {children}
    </PostHogProvider>
  );
}
