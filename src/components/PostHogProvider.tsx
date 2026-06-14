"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getPostHogClient } from "@/lib/posthog";

export default function PostHogProvider({
  userId,
  userEmail,
  isAndroidTester,
  children,
}: {
  userId?: string;
  userEmail?: string;
  isAndroidTester?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const identifiedRef = useRef(false);

  // Initialize and identify user on mount
  useEffect(() => {
    const posthog = getPostHogClient();
    if (!posthog) return;

    if (userId && !identifiedRef.current) {
      posthog.identify(userId, {
        email: userEmail,
        is_android_tester: isAndroidTester ?? false,
      });
      identifiedRef.current = true;
    }
  }, [userId, userEmail, isAndroidTester]);

  // Track page views on route change
  useEffect(() => {
    const posthog = getPostHogClient();
    if (!posthog) return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    posthog.capture("$pageview", {
      $current_url: url,
    });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
