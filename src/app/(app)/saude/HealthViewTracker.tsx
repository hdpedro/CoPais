"use client";

import { useEffect, useTransition } from "react";
import { trackHealthView } from "@/actions/health";

interface HealthViewTrackerProps {
  recordType: string;
  recordId?: string | null;
  childId: string;
  groupId: string;
}

export default function HealthViewTracker({
  recordType,
  recordId,
  childId,
  groupId,
}: HealthViewTrackerProps) {
  const [, startTransition] = useTransition();

  useEffect(() => {
    const fd = new FormData();
    fd.set("recordType", recordType);
    if (recordId) fd.set("recordId", recordId);
    fd.set("childId", childId);
    fd.set("groupId", groupId);
    startTransition(() => {
      trackHealthView(fd);
    });
  }, [recordType, recordId, childId, groupId]);

  return null;
}
