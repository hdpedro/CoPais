"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCheckin } from "@/actions/checkin";
import { CHECKIN_CATEGORIES } from "@/lib/constants";
import { useI18n } from "@/i18n/provider";

interface CheckinFormProps {
  groupId: string;
  childrenList: { id: string; full_name: string }[];
}

export default function CheckinForm({ groupId, childrenList }: CheckinFormProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [childId, setChildId] = useState(childrenList[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !selectedCategory || !childId) return;

    setSubmitting(true);
    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("childId", childId);
    formData.set("category", selectedCategory);
    formData.set("title", title);
    formData.set("description", description);

    const result = await createCheckin(formData);
    setSubmitting(false);

    if (result.success) {
      setTitle("");
      setDescription("");
      setSelectedCategory("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      router.refresh();
    }
  }

  // Quick templates based on category
  const quickTemplates: Record<string, string[]> = {
    screen_time: [
      t("checkinForm.screen1h"),
      t("checkinForm.screen2h"),
      t("checkinForm.screen3h"),
      t("checkinForm.screen4h"),
    ],
    food: [
      t("checkinForm.ateWellLunch"),
      t("checkinForm.ateHamburger"),
      t("checkinForm.refusedDinner"),
      t("checkinForm.ateFruits"),
    ],
    sleep: [
      t("checkinForm.sleptEarly"),
      t("checkinForm.sleptLate"),
      t("checkinForm.hadNightmare"),
      t("checkinForm.sleptWell"),
    ],
    mood: [
      t("checkinForm.wasHappy"),
      t("checkinForm.criedALot"),
      t("checkinForm.wasIrritated"),
      t("checkinForm.calmDay"),
    ],
    health: [
      t("checkinForm.hadFever"),
      t("checkinForm.tookMedicine"),
      t("checkinForm.sneezedALot"),
      t("checkinForm.hurtKnee"),
    ],
    activity: [
      t("checkinForm.playedPark"),
      t("checkinForm.playedBall"),
      t("checkinForm.swimming"),
      t("checkinForm.rodeBike"),
    ],
    school: [
      t("checkinForm.didHomework"),
      t("checkinForm.testTomorrow"),
      t("checkinForm.parentMeeting"),
      t("checkinForm.schoolTrip"),
    ],
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-4">
      {/* Child selector (if multiple) */}
      {childrenList.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("checkinForm.child")}</label>
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {childrenList.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Category pills */}
      <div>
        <label className="block text-sm font-medium text-dark mb-2">{t("checkinForm.category")}</label>
        <div className="flex flex-wrap gap-2">
          {CHECKIN_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                selectedCategory === cat.value
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-dark hover:bg-gray-200"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Health shortcut: link to register illness */}
      {selectedCategory === "health" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-xs text-red-700 mb-2">
            {t("checkinForm.healthHelpText")}
          </p>
          <Link
            href="/saude/doencas/nova"
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors"
          >
            🏥 {t("checkinForm.registerIllness")}
          </Link>
        </div>
      )}

      {/* Quick templates */}
      {selectedCategory && quickTemplates[selectedCategory] && (
        <div>
          <label className="block text-xs text-dark/60 mb-1">{t("checkinForm.quick")}</label>
          <div className="flex flex-wrap gap-1">
            {quickTemplates[selectedCategory].map((tmpl) => (
              <button
                key={tmpl}
                type="button"
                onClick={() => setTitle(tmpl)}
                className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                  title === tmpl
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-gray-50 text-dark/50 hover:bg-gray-100"
                }`}
              >
                {tmpl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("checkinForm.whatHappened")}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Description */}
      <div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("checkinForm.optionalDetails")}
          rows={2}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !title.trim() || !selectedCategory}
        className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {success ? t("checkinForm.registered") : submitting ? t("checkinForm.saving") : t("checkinForm.registerCheckin")}
      </button>
    </form>
  );
}
