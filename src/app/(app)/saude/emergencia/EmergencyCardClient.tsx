"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { regenerateEmergencyToken } from "@/actions/health";

interface ChildInfo {
  id: string;
  full_name: string;
  emergency_token: string;
}

interface HealthSummary {
  bloodType: string | null;
  allergiesCount: number;
  medicationsCount: number;
  hasInsurance: boolean;
  hasSus: boolean;
  contactsCount: number;
  hasPediatrician: boolean;
}

interface Props {
  childrenList: ChildInfo[];
  selectedChildId: string;
  groupId: string;
  healthSummary: HealthSummary;
}

export default function EmergencyCardClient({
  childrenList,
  selectedChildId,
  groupId,
  healthSummary,
}: Props) {
  const router = useRouter();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedChild = childrenList.find((c) => c.id === selectedChildId) || childrenList[0];

  const appUrl = typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

  const emergencyUrl = `${appUrl}/api/health/emergency/${selectedChild.id}?token=${selectedChild.emergency_token}`;

  useEffect(() => {
    if (!selectedChild) return;
    QRCode.toDataURL(emergencyUrl, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    }).then(setQrDataUrl).catch(console.error);
  }, [emergencyUrl, selectedChild]);

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: `Ficha de Emergência — ${selectedChild.full_name}`,
        text: `Ficha de emergência com dados de saúde de ${selectedChild.full_name}`,
        url: emergencyUrl,
      }).catch(() => {});
    } else {
      handleCopy();
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(emergencyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleRegenerate() {
    const formData = new FormData();
    formData.set("childId", selectedChild.id);
    formData.set("groupId", groupId);
    startTransition(() => {
      regenerateEmergencyToken(formData);
    });
    setShowConfirm(false);
  }

  if (childrenList.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-3">👶</p>
          <p className="text-muted mb-4">Adicione uma criança para gerar a ficha de emergência.</p>
          <Link href="/criancas/nova" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg">
            Adicionar criança
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Child selector tabs */}
      {childrenList.length > 1 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
          {childrenList.map((child) => (
            <button
              key={child.id}
              onClick={() => router.push(`/saude/emergencia?crianca=${child.id}`)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all min-h-[44px] ${
                child.id === selectedChildId
                  ? "bg-red-600 text-white shadow-md"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {child.full_name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      {/* QR Code Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
        <div className="bg-gradient-to-br from-red-600 to-red-700 px-5 py-4 text-white text-center">
          <p className="text-lg font-bold">Ficha de Emergência</p>
          <p className="text-sm opacity-90">{selectedChild.full_name}</p>
        </div>

        <div className="p-6 flex flex-col items-center">
          {qrDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qrDataUrl}
              alt="QR Code de Emergência"
              className="w-64 h-64 rounded-xl border-2 border-gray-100"
            />
          ) : (
            <div className="w-64 h-64 rounded-xl bg-gray-100 animate-pulse" />
          )}
          <p className="text-xs text-muted mt-3 text-center">
            Escaneie este QR Code para acessar a ficha de emergência
          </p>
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-5 flex flex-col gap-2.5">
          <button
            onClick={handleShare}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 active:scale-[0.98] transition-all min-h-[44px]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Compartilhar
          </button>
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-[0.98] transition-all min-h-[44px]"
          >
            {copied ? (
              <>
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-600">Link copiado!</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copiar link
              </>
            )}
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all min-h-[44px]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerar QR Code
          </button>
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <p className="text-lg font-bold text-dark mb-2">Regenerar QR Code?</p>
            <p className="text-sm text-muted mb-5">
              O QR Code atual será invalidado. Qualquer pessoa que tenha o QR antigo não poderá mais acessar a ficha.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegenerate}
                disabled={isPending}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
              >
                {isPending ? "Regenerando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Health Summary Checklist */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-dark mb-3">Dados incluídos na ficha</h3>
        <div className="space-y-2.5">
          <CheckItem
            filled={!!healthSummary.bloodType}
            label="Tipo sanguíneo"
            detail={healthSummary.bloodType || undefined}
            href={`/saude/alergias?crianca=${selectedChildId}`}
          />
          <CheckItem
            filled={healthSummary.allergiesCount > 0}
            label="Alergias"
            detail={healthSummary.allergiesCount > 0 ? `${healthSummary.allergiesCount} registrada(s)` : "Nenhuma registrada"}
            href={`/saude/alergias?crianca=${selectedChildId}`}
            warnIfEmpty
          />
          <CheckItem
            filled
            label="Medicações ativas"
            detail={healthSummary.medicationsCount > 0 ? `${healthSummary.medicationsCount} ativa(s)` : "Nenhuma"}
          />
          <CheckItem
            filled={healthSummary.hasInsurance || healthSummary.hasSus}
            label="Convênio / SUS"
            href={`/saude/alergias?crianca=${selectedChildId}`}
          />
          <CheckItem
            filled={healthSummary.contactsCount > 0}
            label="Contatos de emergência"
            detail={`${healthSummary.contactsCount} contato(s)`}
          />
          <CheckItem
            filled={healthSummary.hasPediatrician}
            label="Pediatra"
            href="/saude/profissionais"
          />
        </div>
      </div>
    </div>
  );
}

function CheckItem({
  filled,
  label,
  detail,
  href,
  warnIfEmpty,
}: {
  filled: boolean;
  label: string;
  detail?: string;
  href?: string;
  warnIfEmpty?: boolean;
}) {
  const showWarning = !filled && (warnIfEmpty || href);
  const icon = filled ? (
    <span className="text-green-600 text-base">&#10003;</span>
  ) : showWarning ? (
    <span className="text-amber-500 text-base">&#9888;</span>
  ) : (
    <span className="text-green-600 text-base">&#10003;</span>
  );

  const content = (
    <div className={`flex items-center gap-3 p-2.5 rounded-xl ${showWarning ? "bg-amber-50" : "bg-gray-50"}`}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-dark">{label}</p>
        {detail && <p className="text-[11px] text-muted">{detail}</p>}
      </div>
      {showWarning && href && (
        <span className="text-xs text-amber-600 font-semibold">Preencher</span>
      )}
    </div>
  );

  if (showWarning && href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
