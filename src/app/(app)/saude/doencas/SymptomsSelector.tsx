"use client";

import { useState } from "react";
import { ILLNESS_COMMON_SYMPTOMS } from "@/lib/health-constants";

export default function SymptomsSelector() {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(symptom: string) {
    setSelected((prev) =>
      prev.includes(symptom)
        ? prev.filter((s) => s !== symptom)
        : [...prev, symptom]
    );
  }

  return (
    <div>
      <input type="hidden" name="symptoms" value={selected.join(", ")} />
      <div className="flex flex-wrap gap-2">
        {ILLNESS_COMMON_SYMPTOMS.map((symptom) => {
          const isSelected = selected.includes(symptom);
          return (
            <button
              key={symptom}
              type="button"
              onClick={() => toggle(symptom)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-accent text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {symptom}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-muted mt-2">
          Selecionados: {selected.join(", ")}
        </p>
      )}
    </div>
  );
}
