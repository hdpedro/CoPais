/**
 * Versões dos documentos legais. Bump quando o conteúdo de
 * /termos ou /privacidade mudar de forma material — todos os
 * users vão precisar re-aceitar (UI a entregar próxima sprint).
 *
 * **Por que este arquivo separado:** server action modules (`"use server"`)
 * só podem exportar funções async. Constantes nomeadas exportadas de lá
 * quebram o Turbopack build do Next.js. Movido pra cá pra que `actions/auth.ts`
 * importe em vez de exportar.
 *
 * MANTER COMO STRINGS — pra suportar versões tipo "2.1-beta" no
 * futuro sem migration.
 */
export const APP_TERMS_VERSION = "1.0";
export const APP_PRIVACY_VERSION = "1.0";
