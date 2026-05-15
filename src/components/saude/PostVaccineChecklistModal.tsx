"use client";

/**
 * PostVaccineChecklistModal — modal opcional após registrar vacina.
 *
 * Pergunta se o user quer criar um lembrete de 48h pra observar reações leves.
 * Cria `child_activity` no calendário compartilhado. SEM juízo clínico — copy
 * validada: "Reações leves são esperadas. Em caso de dúvida, contate o pediatra."
 *
 * Visível APENAS quando URL tem `?postVaccine=<id>`. Tap "Pular" redireciona
 * limpando o param.
 */

import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { createPostVaccineReminder } from "@/actions/vaccines";

interface Props {
  vaccineRecordId: string;
  childFirstName: string;
}

export default function PostVaccineChecklistModal({ vaccineRecordId, childFirstName }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  function handleSkip() {
    router.replace(`/saude/vacinas?crianca=${encodeURIComponent("")}`.replace(/[?&]+$/, ""));
    router.refresh();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-vaccine-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-gray-100 p-5 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-xl">
            ✓
          </div>
          <div className="flex-1">
            <p
              id="post-vaccine-title"
              className="text-sm font-semibold text-dark"
            >
              {t("health.vaccineEngine.checklistPostVaccineTitle")}
              {childFirstName ? <span className="text-muted font-normal"> · {childFirstName}</span> : null}
            </p>
            <p className="text-xs text-muted mt-1">
              {t("health.vaccineEngine.checklistPostVaccineBody")}
            </p>
          </div>
        </div>

        <form action={createPostVaccineReminder} className="mt-4 flex flex-col gap-2">
          <input type="hidden" name="vaccineRecordId" value={vaccineRecordId} />
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            {t("health.vaccineEngine.checklistPostVaccineCreate")}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="w-full py-2.5 rounded-lg bg-gray-50 text-muted text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            {t("health.vaccineEngine.checklistPostVaccineSkip")}
          </button>
        </form>
      </div>
    </div>
  );
}
