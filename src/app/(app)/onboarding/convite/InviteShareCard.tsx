"use client";

import { useState } from "react";

export default function InviteShareCard({
  inviteLink,
  groupName,
  firstName,
}: {
  inviteLink: string;
  groupName: string;
  firstName: string;
}) {
  const [copied, setCopied] = useState(false);

  const whatsappMessage = encodeURIComponent(
    `Oi! Estou usando o Kindar para organizar a rotina do(s) nosso(s) filho(s). ` +
    `Criei o grupo "${groupName}" e preciso que voce se cadastre tambem. ` +
    `Clique no link para entrar: ${inviteLink}`
  );

  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = inviteLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm space-y-5">
      <div className="text-center">
        <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <h3 className="font-bold text-dark text-lg">Convite gerado!</h3>
        <p className="text-sm text-muted mt-1">Compartilhe o link abaixo com o outro responsavel</p>
      </div>

      {/* Link display */}
      <div className="bg-light rounded-lg p-3 border border-gray-100">
        <p className="text-xs text-muted font-mono break-all">{inviteLink}</p>
      </div>

      {/* Share buttons */}
      <div className="space-y-3">
        {/* WhatsApp - primary action */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 bg-[#25D366] text-white font-semibold rounded-lg hover:bg-[#20BD5A] transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Enviar por WhatsApp
        </a>

        {/* Copy link */}
        <button
          onClick={copyLink}
          className={`w-full py-3 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
            copied
              ? "bg-success/10 text-success border border-success/20"
              : "bg-light text-dark border border-gray-200 hover:bg-gray-100"
          }`}
        >
          {copied ? (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Link copiado!
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
      </div>

      {/* Instructions */}
      <div className="bg-primary/5 rounded-lg p-4">
        <p className="text-sm font-medium text-dark mb-2">Como funciona:</p>
        <ol className="text-xs text-muted space-y-1.5 list-decimal list-inside">
          <li>O outro responsavel clica no link</li>
          <li>Cria uma conta (ou entra se ja tiver)</li>
          <li>Automaticamente entra no grupo <span className="font-medium text-dark">{groupName}</span></li>
          <li>Pronto! Voces podem compartilhar a rotina dos filhos</li>
        </ol>
        <p className="text-xs text-accent mt-3 font-medium">O convite expira em 7 dias.</p>
      </div>
    </div>
  );
}
