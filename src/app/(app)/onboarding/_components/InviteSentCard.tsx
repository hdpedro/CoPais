"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { Translate } from "../_lib/types";

interface Props {
  email: string;
  token: string;
  onAnother: () => void;
  t: Translate;
}

/**
 * Tela de sucesso pós-convite com Share + Copy. Share usa Web Share API
 * (capability-detected via `navigator.share`) — em browsers sem suporte,
 * o botão Share não aparece e Copy fica em largura total.
 */
function InviteSentCardImpl({ email, token, onAnother, t }: Props) {
  const [copied, setCopied] = useState(false);

  // origin + token são estáveis enquanto a tela existir — useMemo evita
  // recalcular o link a cada render (e referenciar `window` no SSR mata o
  // pre-render, então só consulto no client).
  const link = useMemo(() => {
    const origin = typeof window !== "undefined"
      ? window.location.origin
      : "https://kindar.com.br";
    return `${origin}/convite/${token}`;
  }, [token]);

  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard.writeText pode falhar em contextos sem permissão (iframes,
      // http). Sem fallback aqui — o usuário ainda pode usar Share.
    }
  }, [link]);

  const shareLink = useCallback(async () => {
    if (!canNativeShare) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: "Kindar",
        text: t("onboardingForm.shareMessageText"),
        url: link,
      });
    } catch {
      // Cancelado pelo usuário — não é erro real.
    }
  }, [canNativeShare, link, t, copyLink]);

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm text-center space-y-4 animate-[fadeIn_280ms_ease-out]">
      <div className="w-14 h-14 mx-auto rounded-full bg-success/10 flex items-center justify-center text-2xl" aria-hidden="true">
        📨
      </div>
      <div>
        <h3 className="font-bold text-dark">{t("onboardingForm.inviteLinkReady")}</h3>
        <p className="text-xs text-muted mt-1">{t("onboardingForm.inviteLinkHelp", { email })}</p>
      </div>

      <div className="flex gap-2">
        {canNativeShare && (
          <button
            type="button"
            onClick={shareLink}
            className="flex-1 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            {t("onboardingForm.shareInviteLink")}
          </button>
        )}
        <button
          type="button"
          onClick={copyLink}
          aria-live="polite"
          className={`${canNativeShare ? "" : "flex-1"} px-4 py-2.5 border border-gray-200 text-dark text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          {copied ? t("onboardingForm.inviteLinkCopied") : t("common.copy")}
        </button>
      </div>

      <button
        type="button"
        onClick={onAnother}
        className="text-sm text-muted hover:text-dark transition-colors"
      >
        {t("onboardingForm.sendAnotherInvite")}
      </button>
    </div>
  );
}

export const InviteSentCard = memo(InviteSentCardImpl);
