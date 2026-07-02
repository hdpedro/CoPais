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
/**
 * Um texto livre DESCREVE logística de guarda/rotina? Gate CONSERVADOR
 * (3º da fila: roda DEPOIS de provas e consulta — não sequestra os outros).
 * Âncora de guarda ("fica comigo", "troquei o sábado", "férias") OU de
 * leva/busca ("quem busca é", "vou levar") + sinal de data/dia-da-semana.
 * A extração por IA é a decisão final; se não achar, o canal cai no chat.
 */
export function looksLikeCustodyText(text: string): boolean {
  const s = (text || "").toLowerCase().trim();
  if (s.length < 8 || s.length > 800) return false;
  if (/[?]\s*$/.test(s)) return false;
  if (/^\s*(quando|qual|que dia|onde|como|por que|porque|quem foi|será que|pode|posso)\b/.test(s)) return false;
  const custodyAnchor =
    /\b(fica(m)? comigo|fica(m)? com (a|o|ele|ela|\w+)|guarda|troquei|trocar? o (dia|fim de semana|s[áa]bado|domingo)|troca de (dia|fim de semana)|revezamento|f[ée]rias)\b/.test(
      s,
    );
  const legAnchor =
    /\b(quem (leva|busca)|vou (levar|buscar)|vai (levar|buscar)|(leva|busca) (é|e) (a|o)?\s*\w+|a partir de (agora|segunda|ter[çc]a|quarta|quinta|sexta))\b/.test(
      s,
    );
  if (!custodyAnchor && !legAnchor) return false;
  const dateSignal =
    /\b\d{1,2}\/\d{1,2}\b|\bdia\s+\d{1,2}\b|semana que vem|pr[óo]xima semana|amanh[ãa]|depois de amanh[ãa]|feriado|fim de semana|m[êe]s que vem|(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(-feira)?\b|de \d{1,2} a \d{1,2}|at[ée] (o dia )?\d{1,2}/.test(
      s,
    );
  return dateSignal;
}

export function looksLikeConsultText(text: string): boolean {
  const s = (text || "").toLowerCase().trim();
  if (s.length < 8 || s.length > 800) return false;
  if (/[?]\s*$/.test(s)) return false;
  if (/^\s*(quando|qual|que dia|onde|como|por que|porque|quem|será que|pode|posso|consigo|tem como)\b/.test(s)) return false;
  // Pagamento com valor ("paguei 250 na consulta") é DESPESA, não registro
  // clínico — deixa a frase chegar ao gate de despesa (4º da fila). Sem esta
  // exclusão, "consulta"+"remédio" sequestrava e a extração de saúde
  // rejeitava (unknown) — a despesa nunca chegava ao playbook dela (E2E 02/jul).
  if (/\b(paguei|gastei|custou|desembolsei)\b/.test(s) && /\b\d{1,6}([.,]\d{1,2})?\b/.test(s)) return false;
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

/**
 * Um texto livre DESCREVE um gasto feito? Gate CONSERVADOR (4º da fila:
 * roda DEPOIS de provas, consulta e guarda — não sequestra os outros).
 * Âncora de pagamento ("paguei", "gastei", "comprei", "custou", "R$") +
 * um VALOR numérico, sem ser pergunta. A extração por IA é a decisão
 * final; se não achar despesa, o canal cai no chat. PURO (regex).
 */
export function looksLikeExpenseText(text: string): boolean {
  const s = (text || "").toLowerCase().trim();
  if (s.length < 6 || s.length > 800) return false;
  if (/[?]\s*$/.test(s)) return false;
  if (/^\s*(quando|qual|quanto|que dia|onde|como|por que|porque|quem|será que|pode|posso)\b/.test(s)) return false;
  const payAnchor = /\b(paguei|gastei|comprei|custou|paguei|desembolsei|gasto de|despesa de)\b|r\$\s*\d/.test(s);
  if (!payAnchor) return false;
  const amountSignal = /\b\d{1,6}([.,]\d{1,2})?\b|\br\$\s*\d/.test(s);
  return amountSignal;
}

/**
 * Um texto livre DESCREVE um convite/evento de família? Gate CONSERVADOR
 * (5º da fila: depois de provas, consulta, guarda e despesa). Âncora de
 * ocasião (aniversário/festa/convite/reunião/apresentação/campeonato/
 * formatura) + sinal de data, sem ser pergunta. A extração por IA é a
 * decisão final. PURO (regex).
 */
export function looksLikeInviteText(text: string): boolean {
  const s = (text || "").toLowerCase().trim();
  if (s.length < 8 || s.length > 800) return false;
  if (/[?]\s*$/.test(s)) return false;
  if (/^\s*(quando|qual|que dia|onde|como|por que|porque|quem|será que|pode|posso)\b/.test(s)) return false;
  const occasionAnchor =
    /\b(convite|convidamos|convidou|anivers[áa]rio|festinha|festa d[eo]|apresenta[çc][ãa]o|campeonato|formatura|reuni[ãa]o de pais|festa junina)\b/.test(s);
  if (!occasionAnchor) return false;
  const dateSignal =
    /\b\d{1,2}\/\d{1,2}\b|\bdia\s+\d{1,2}\b|semana que vem|pr[óo]xim[oa]|amanh[ãa]|\b(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(-feira)?\b|\b(jan|fev|mar[çc]|abr|mai|jun|jul|ago|set|out|nov|dez)/.test(s);
  return dateSignal;
}
