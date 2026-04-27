"use client";

import { useEffect } from "react";
import { trackEvent, type EventName } from "@/lib/analytics";

interface Props {
  event: EventName;
  properties?: Record<string, unknown>;
}

/**
 * Drop into any client/server page to fire a single page-view event on
 * mount. Idempotent within a render — fires exactly once thanks to the
 * empty dep array. Use sparingly: only on landing/pricing/key funnel
 * pages, not every dashboard view.
 */
export default function PageViewTracker({ event, properties }: Props) {
  useEffect(() => {
    trackEvent(event, properties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
