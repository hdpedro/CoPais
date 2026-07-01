/* ------------------------------------------------------------------ */
/* exam-text-gate.ts — gate CONSERVADOR: um texto livre é captura de     */
/* provas? (PURO, compartilhado entre assistente do app e WhatsApp)      */
/*                                                                      */
/* Só um filtro barato pra NÃO chamar o Brain em toda mensagem — a       */
/* extração por IA é a decisão final e, se não achar provas, o canal cai */
/* no chat/assistente. Palavra de prova + sinal de data, sem ser         */
/* pergunta. Regex, sem dependência de rede/DOM → serve cliente e server.*/
/* ------------------------------------------------------------------ */

export function looksLikeExamText(text: string): boolean {
  const s = (text || "").toLowerCase().trim();
  if (s.length < 6 || s.length > 600) return false;
  // Pergunta ("quando é a prova?", "tem prova amanhã?") NÃO é captura.
  if (/[?]\s*$/.test(s)) return false;
  if (/^\s*(quando|qual|que dia|onde|como|por que|porque|quem|será que)\b/.test(s)) return false;
  const examWord = /\b(prova|provas|trabalho|trabalhos|avalia\w+|av\d|simulado|entrega|recupera\w+)\b/.test(s);
  const dateSignal = /\b\d{1,2}\/\d{1,2}\b|\bdia\s+\d{1,2}\b|\b(jan|fev|mar[çc]|abr|mai|jun|jul|ago|set|out|nov|dez)/.test(s);
  return examWord && dateSignal;
}
