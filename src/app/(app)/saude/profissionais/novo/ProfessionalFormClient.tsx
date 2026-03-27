"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { SPECIALTIES } from "@/lib/health-constants";
import SubmitButton from "../../SubmitButton";

interface Props {
  groupId: string;
  createAction: (formData: FormData) => Promise<void>;
}

export default function ProfessionalFormClient({ groupId, createAction }: Props) {
  const { t } = useI18n();

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude/profissionais" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">{t("health.newProfessional")}</h1>
      </div>

      <form action={createAction} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("health.fullName")} <span className="text-error">*</span></label>
          <input type="text" name="name" required placeholder="Dr. Maria Silva" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("health.specialty")}</label>
          <select name="specialty" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary">
            <option value="">{t("health.select")}</option>
            {SPECIALTIES.map((spec) => (
              <option key={spec.value} value={spec.value}>{spec.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("health.crmCro")}</label>
          <input type="text" name="crm" placeholder="CRM 12345/SP" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("health.phone")}</label>
          <input type="tel" name="phone" placeholder="(11) 3456-7890" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark mb-1">
            <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.7-6.412-1.9l-.447-.29-2.642.886.886-2.642-.29-.447A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
            </svg>
            WhatsApp
          </label>
          <input type="tel" name="whatsapp" placeholder="(11) 99876-5432" pattern="[0-9()\s\-+]*" inputMode="numeric" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("health.address")}</label>
          <input type="text" name="address" placeholder="Rua Exemplo, 123 - Bairro" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("health.notes")}</label>
          <textarea name="notes" rows={3} placeholder={t("health.notesPlaceholder")} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none" />
        </div>

        <SubmitButton label={t("health.registerProfessionalButton")} />
      </form>
    </div>
  );
}
