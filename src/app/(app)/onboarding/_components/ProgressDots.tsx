"use client";

import { memo } from "react";
import type { Translate } from "../_lib/types";

interface Props {
  activeIndex: number;
  totalSteps: number;
  t: Translate;
}

/** Indicador de progresso (3 dots: Família · Crianças · Convite). */
function ProgressDotsImpl({ activeIndex, totalSteps, t }: Props) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="progressbar"
      aria-valuenow={activeIndex + 1}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-label={t("onboardingForm.stepIndicator", { current: activeIndex + 1, total: totalSteps })}
    >
      {Array.from({ length: totalSteps }).map((_, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <span
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              active ? "w-8 bg-primary" : done ? "w-6 bg-primary" : "w-6 bg-gray-200"
            }`}
          />
        );
      })}
    </div>
  );
}

export const ProgressDots = memo(ProgressDotsImpl);
