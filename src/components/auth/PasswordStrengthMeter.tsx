"use client";

import { useI18n } from "@/i18n/provider";

/**
 * Heurística leve de força de senha — não rodamos zxcvbn no bundle pra
 * manter o /signup leve (importa ~600kb). Avalia 4 critérios:
 * comprimento, número, símbolo, mix maiúsculas/minúsculas.
 *
 * Retorna score 0..4 + a próxima dica acionável (não despejar 4 dicas
 * ao mesmo tempo — só a primeira que falta). Padrão Stripe Checkout.
 */
function evaluate(pw: string): { score: 0 | 1 | 2 | 3 | 4; hint: "len" | "num" | "sym" | "upper" | null } {
  if (!pw) return { score: 0, hint: "len" };
  const hasLen = pw.length >= 8;
  const hasNumber = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw) && /[a-z]/.test(pw);

  if (!hasLen) return { score: 0, hint: "len" };

  // Pelo menos 8 chars já dá score 1. Soma para o teto 4.
  const score = (1 +
    (hasNumber ? 1 : 0) +
    (hasSymbol ? 1 : 0) +
    (hasUpper ? 1 : 0)) as 1 | 2 | 3 | 4;

  // Ordem de prioridade pra próxima dica: número → símbolo → mix maiúscula.
  const hint = !hasNumber ? "num" : !hasSymbol ? "sym" : !hasUpper ? "upper" : null;
  return { score, hint };
}

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const { t } = useI18n();
  const { score, hint } = evaluate(password);

  // Não renderiza nada quando o campo ainda está vazio — espaço fica
  // estável via min-height pra evitar layout shift quando o user digita
  // a primeira letra.
  if (!password) {
    return <div className="mt-1.5 h-[42px]" aria-hidden="true" />;
  }

  const labelKey =
    score >= 4 ? "auth.passwordStrength.strong" :
    score === 3 ? "auth.passwordStrength.good" :
    score === 2 ? "auth.passwordStrength.fair" :
    "auth.passwordStrength.weak";

  const hintKey = hint === "len"
    ? "auth.passwordStrength.hintLengthShort"
    : hint === "num"
      ? "auth.passwordStrength.hintAddNumber"
      : hint === "sym"
        ? "auth.passwordStrength.hintAddSymbol"
        : hint === "upper"
          ? "auth.passwordStrength.hintAddUpper"
          : null;

  // Cores por nível: vermelho-suave / âmbar / verde-azulado / verde.
  // Bar fills 4 segmentos: cada um vira a cor do score atual.
  const fillColor =
    score >= 4 ? "bg-[#2E7268]" :
    score === 3 ? "bg-emerald-500" :
    score === 2 ? "bg-amber-500" :
    "bg-red-400";

  const labelColor =
    score >= 4 ? "text-[#2E7268]" :
    score === 3 ? "text-emerald-700" :
    score === 2 ? "text-amber-700" :
    "text-red-600";

  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1" role="meter" aria-valuemin={0} aria-valuemax={4} aria-valuenow={score} aria-label={t(labelKey)}>
        {[1, 2, 3, 4].map((seg) => (
          <span
            key={seg}
            className={`h-1 flex-1 rounded-full transition-colors ${seg <= score ? fillColor : "bg-stone-200"}`}
          />
        ))}
      </div>
      <p className={`text-xs mt-1.5 font-medium ${labelColor}`}>
        {t(labelKey)}
        {hintKey && <span className="text-stone-500 font-normal"> · {t(hintKey)}</span>}
      </p>
    </div>
  );
}
