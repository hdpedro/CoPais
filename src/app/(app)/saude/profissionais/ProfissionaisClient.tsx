"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { formatCRM } from "@/lib/format";

interface Professional {
  id: string;
  name: string;
  specialty: string | null;
  crm: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  notes: string | null;
}

interface Props {
  professionals: Professional[] | null;
  isReadonly: boolean;
  success?: string;
  error?: string;
}

export default function ProfissionaisClient({ professionals, isReadonly, success, error: errorMsg }: Props) {
  const { t } = useI18n();

  function cleanWhatsAppNumber(number: string | null | undefined): string {
    if (!number) return "";
    const digits = number.replace(/\D/g, "");
    if (digits.length < 8) return "";
    if (digits.length <= 11) return "55" + digits;
    return digits;
  }

  function isValidWhatsApp(number: string | null): boolean {
    if (!number) return false;
    return number.replace(/\D/g, "").length >= 8;
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark" aria-label={t("health.backToHealth")}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">{t("health.healthProfessionals")}</h1>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {professionals && professionals.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[10px] text-muted/70 italic flex items-center gap-1 px-1">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t("health.recordsNotEditable")}
          </p>
          {professionals.map((prof) => (
            <div key={prof.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="mb-2">
                <h3 className="font-semibold text-dark">{prof.name}</h3>
                {prof.specialty && <p className="text-sm text-muted capitalize">{prof.specialty}</p>}
              </div>
              {prof.crm && <p className="text-xs text-muted mb-1">{t("health.crmCro")}: {formatCRM(prof.crm)}</p>}
              <div className="space-y-1 mt-3">
                {prof.phone && (
                  <div className="flex items-center gap-2 text-sm text-dark">
                    <span>📞</span><span>{prof.phone}</span>
                  </div>
                )}
                {prof.whatsapp && (
                  <div className="flex items-center gap-2 text-sm text-dark">
                    <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.7-6.412-1.9l-.447-.29-2.642.886.886-2.642-.29-.447A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
                    </svg>
                    <span>{prof.whatsapp}</span>
                  </div>
                )}
                {prof.address && (
                  <div className="flex items-center gap-2 text-sm text-dark">
                    <span>📍</span><span>{prof.address}</span>
                  </div>
                )}
              </div>
              {prof.notes && <p className="text-xs text-muted mt-2 italic">{prof.notes}</p>}
              {isValidWhatsApp(prof.whatsapp) && (
                <a href={`https://wa.me/${cleanWhatsAppNumber(prof.whatsapp)}`} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 w-full py-2 bg-[#25D366] text-white text-sm font-medium rounded-lg hover:bg-[#20bd5a] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.7-6.412-1.9l-.447-.29-2.642.886.886-2.642-.29-.447A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
                  </svg>
                  {t("health.sendWhatsApp")}
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-3" aria-hidden="true">👨‍⚕️</p>
          <p className="text-muted text-sm mb-1">{t("health.noProfessionalRegistered")}</p>
          <p className="text-muted text-xs mb-2">{t("health.registerDoctorsDentists")}</p>
          {!isReadonly && (
            <Link href="/saude/profissionais/novo" className="text-primary font-medium">{t("health.registerProfessional")}</Link>
          )}
        </div>
      )}

      {!isReadonly && (
        <Link href="/saude/profissionais/novo" className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-primary-dark transition-colors z-10">
          +
        </Link>
      )}
    </div>
  );
}
