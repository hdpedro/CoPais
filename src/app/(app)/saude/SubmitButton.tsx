"use client";
import { useFormStatus } from "react-dom";
import { useI18n } from "@/i18n/provider";

export default function SubmitButton({ label, pendingLabel }: { label?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  const displayLabel = label || t("common.save");
  const displayPending = pendingLabel || t("health.submitButton.saving");
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3 bg-accent text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {pending ? displayPending : displayLabel}
    </button>
  );
}
