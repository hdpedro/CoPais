"use client";

import { useState } from "react";

type FrequencyOption = {
  value: string;
  label: string;
  hours: number;
};

export default function FrequencySelect({
  frequencies,
}: {
  frequencies: FrequencyOption[];
}) {
  const [selectedValue, setSelectedValue] = useState("");
  const selectedFreq = frequencies.find((f) => f.value === selectedValue);

  return (
    <>
      <label className="block text-sm font-medium text-[#2D2D2D] mb-1">
        Frequência
      </label>
      <select
        name="frequency"
        value={selectedValue}
        onChange={(e) => setSelectedValue(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50"
      >
        <option value="">Selecione...</option>
        {frequencies.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <input
        type="hidden"
        name="frequencyHours"
        value={selectedFreq?.hours ?? ""}
      />
    </>
  );
}
