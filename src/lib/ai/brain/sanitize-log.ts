/* ------------------------------------------------------------------ */
/* sanitize-log.ts — redação de PII antes de logar/persistir (PURO)     */
/*                                                                      */
/* OCR/transcrição bruta NUNCA devem ir crus pra campos analíticos /    */
/* logs (ai_event_logs etc.). Antes de qualquer persistência analítica, */
/* o texto passa por aqui: redige telefone, e-mail, CPF, CNPJ, CEP e    */
/* sequências longas de dígitos (cartão/RG/etc.). Conservador — prefere */
/* redigir a mais do que vazar. Determinístico, sem I/O.                */
/*                                                                      */
/* (Gap pré-existente confirmado no plano: parse-vaccines/parse-invite  */
/* logam OCR cru — retrofitar com este util.)                           */
/* ------------------------------------------------------------------ */

/** Ordem importa: padrões mais específicos primeiro (CNPJ antes de CPF;
 *  e-mail antes de telefone; dígitos longos por último). */
const REDACTIONS: Array<{ re: RegExp; tag: string }> = [
  { re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, tag: "[email]" },
  // CNPJ: 00.000.000/0000-00 (com ou sem pontuação)
  { re: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, tag: "[cnpj]" },
  // CPF: 000.000.000-00 (com ou sem pontuação)
  { re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, tag: "[cpf]" },
  // CEP: 00000-000
  { re: /\b\d{5}-\d{3}\b/g, tag: "[cep]" },
  // Telefone BR: (+55) (00) 0000-0000 / 00000-0000, com variações
  { re: /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}-?\d{4}\b/g, tag: "[telefone]" },
  // Sequências longas de dígitos remanescentes (cartão, RG, etc.)
  { re: /\b\d{6,}\b/g, tag: "[numero]" },
];

/**
 * Redige PII de um texto bruto. Retorna string vazia para entrada vazia.
 * Não tenta entender contexto — é uma rede de segurança conservadora.
 */
export function sanitizeRawTextForLog(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  for (const { re, tag } of REDACTIONS) {
    out = out.replace(re, tag);
  }
  return out;
}

/** Conveniência: trunca + sanitiza (logs não precisam do texto inteiro). */
export function sanitizeForLogPreview(text: string | null | undefined, maxLen = 280): string {
  const clean = sanitizeRawTextForLog(text);
  return clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean;
}
