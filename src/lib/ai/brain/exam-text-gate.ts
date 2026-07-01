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

/**
 * Um texto livre DESCREVE uma consulta médica? Gate CONSERVADOR (mesmo espírito
 * do de provas): âncora médica forte + um sinal secundário (dose/frequência,
 * data/retorno, ou 2ª palavra médica), sem ser pergunta. A extração por IA é a
 * decisão final; se não achar consulta, o canal cai no chat. PURO (regex).
 * Deve ser checado DEPOIS de looksLikeExamText (não sequestra captura de provas).
 */
export function looksLikeConsultText(text: string): boolean {
  const s = (text || "").toLowerCase().trim();
  if (s.length < 8 || s.length > 800) return false;
  if (/[?]\s*$/.test(s)) return false;
  if (/^\s*(quando|qual|que dia|onde|como|por que|porque|quem|será que|pode|posso|consigo|tem como)\b/.test(s)) return false;
  const medAnchor =
    /\b(consulta|m[ée]dic\w+|pediatra|dentista|receita|rem[ée]dio|medicamento|comprimido|xarope|dose|diagn[óo]stic\w+|retorno|alergia|antibi[óo]tico|prescri\w+|posologia)\b/.test(s);
  if (!medAnchor) return false;
  const freqDoseSignal =
    /\b\d{1,3}\s*(mg|ml|gotas?)\b|\b(a cada|de)\s*\d{1,2}\s*h|\b\d+\s*x\s*(ao|por)\s*dia|\bpor\s+\d+\s+dias?\b|\bde\s+\d+\s+em\s+\d+\b/.test(s);
  const dateSignal =
    /\b\d{1,2}\/\d{1,2}\b|\bdia\s+\d{1,2}\b|\bem\s+\d+\s+(dias?|semanas?|m[êe]s|meses)\b|\b(jan|fev|mar[çc]|abr|mai|jun|jul|ago|set|out|nov|dez)/.test(s);
  const secondMed =
    (s.match(/\b(consulta|m[ée]dic\w+|pediatra|receita|rem[ée]dio|medicamento|dose|diagn[óo]stic\w+|retorno|alergia|sintoma|febre|dor|tomar|exame)\b/g) || []).length >= 2;
  return freqDoseSignal || dateSignal || secondMed;
}
