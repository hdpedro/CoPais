"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  email: string;
  fullName: string | null;
  hasNativeSubscription: boolean;
}

const REMOVAL_LIST = [
  "Seus dados pessoais (nome, email, telefone, foto)",
  "Todas as crianças cadastradas e seus históricos médicos, de crescimento, alergias, medicamentos e vacinas",
  "Todos os documentos, comprovantes e fotos enviados por você",
  "Todo o histórico de despesas, decisões, acordos, eventos e atividades",
  "Mensagens de chat enviadas por você",
  "Notificações, lembretes e quests de onboarding",
  "Sua participação nos grupos coparentais (você sai de todos)",
  "Sua sessão e tokens de acesso",
];

export default function DeleteAccountClient({ email, fullName, hasNativeSubscription }: Props) {
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = confirm.trim() === "DELETAR" && !submitting;

  async function handleDelete() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETAR" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      // Account deleted — drop to landing.
      window.location.assign("/?account_deleted=1");
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || "Não foi possível deletar a conta. Tente novamente.");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/perfil" className="text-sm text-muted hover:text-dark">
          ← Voltar para Perfil
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-dark">Excluir minha conta</h1>
        <p className="text-sm text-muted mt-2">
          {fullName ? `Olá, ${fullName.split(" ")[0]}. ` : ""}Esta ação é permanente e não pode ser desfeita.
        </p>

        <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700 font-medium">
            Os seguintes dados serão removidos imediatamente:
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-red-700 list-disc pl-5">
            {REMOVAL_LIST.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {hasNativeSubscription ? (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-800 font-semibold">
              Você tem uma assinatura ativa pela App Store ou Google Play.
            </p>
            <p className="text-sm text-amber-800 mt-1.5">
              Cancele em <strong>Ajustes &gt; Apple ID &gt; Assinaturas</strong> (iOS) ou na <strong>Play Store &gt; Pagamentos &gt; Assinaturas</strong> (Android) <em>antes</em> de deletar — caso contrário, a cobrança continuará até o fim do período em curso.
            </p>
          </div>
        ) : null}

        <div className="mt-6">
          <label className="text-sm font-medium text-dark">Email da conta</label>
          <p className="mt-1 text-sm text-muted">{email}</p>
        </div>

        <div className="mt-6">
          <label htmlFor="confirm" className="text-sm font-medium text-dark">
            Para confirmar, digite <span className="font-mono text-red-600">DELETAR</span>
          </label>
          <input
            id="confirm"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETAR"
            className="mt-2 w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-base"
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col sm:flex-row sm:justify-end gap-2">
          <Link
            href="/perfil"
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg border border-gray-200 text-sm font-medium text-dark hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleDelete}
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Deletando…" : "Deletar minha conta permanentemente"}
          </button>
        </div>

        <p className="mt-6 text-xs text-muted">
          Precisa de ajuda? <Link href="/suporte" className="underline hover:text-dark">Entre em contato com o suporte</Link> antes de deletar.
        </p>
      </div>
    </div>
  );
}
