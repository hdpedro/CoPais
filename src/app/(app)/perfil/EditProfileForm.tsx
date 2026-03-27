"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/actions/profile";
import { useI18n } from "@/i18n/provider";

export default function EditProfileForm({ currentName }: { currentName: string }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm text-primary font-medium hover:underline"
      >
        {t("profileForm.editName")}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || trimmed === currentName) {
          setEditing(false);
          return;
        }
        startTransition(async () => {
          const formData = new FormData();
          formData.set("fullName", trimmed);
          await updateProfile(formData);
          setSuccess(true);
          setEditing(false);
          setTimeout(() => setSuccess(false), 3000);
        });
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        placeholder={t("profileForm.fullNamePlaceholder")}
        autoFocus
        required
        minLength={2}
        maxLength={100}
      />
      <button
        type="submit"
        disabled={isPending}
        className="px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "..." : t("common.save")}
      </button>
      <button
        type="button"
        onClick={() => { setEditing(false); setName(currentName); }}
        className="px-2 py-2 text-sm text-muted hover:text-dark"
      >
        {t("common.cancel")}
      </button>
      {success && (
        <span className="text-xs text-green-600">{t("profileForm.saved")}</span>
      )}
    </form>
  );
}
