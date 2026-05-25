"use client";

import { useState, forwardRef } from "react";
import { useI18n } from "@/i18n/provider";

/**
 * Input de senha com toggle de visibilidade (eye icon). Padrão moderno
 * de signup forms — reduz erro de digitação em senhas longas. Estilo
 * herda das classes existentes do form (mesmo border/focus ring).
 *
 * Usa forwardRef pra suportar refs no caller (login form precisa ler
 * o valor pra magic link). onChange via prop padrão React.
 */
type Props = React.InputHTMLAttributes<HTMLInputElement>;

const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(props, ref) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type={revealed ? "text" : "password"}
        className={
          props.className ??
          "w-full px-4 py-3 pr-12 rounded-lg border border-[#E8E0D4] focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 focus:border-[#C07055] text-[#0E0C0A] bg-white"
        }
      />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? t("auth.hidePassword") : t("auth.showPassword")}
        aria-pressed={revealed}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#9A8878] hover:text-[#2C2C2C] focus:outline-none focus:text-[#C07055] focus-visible:ring-2 focus-visible:ring-[#C07055]/40 rounded transition-colors"
        tabIndex={-1}
      >
        {revealed ? (
          // eye-off
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.585 10.587a2 2 0 002.828 2.83M9.363 5.365A9.466 9.466 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411M6.61 6.61C4.642 7.97 3.107 9.948 2.458 12c1.274 4.057 5.064 7 9.542 7a9.46 9.46 0 005.39-1.61" />
          </svg>
        ) : (
          // eye
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  );
});

export default PasswordInput;
