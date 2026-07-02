/**
 * brain-capture.ts — captura do Kindar Brain no app NATIVO (Fase 1: paridade).
 *
 * FORK CONSCIENTE de `src/lib/ai/brain/exam-text-gate.ts` (gates) e do
 * `matchOneChildOption` de `src/components/AIAssistant.tsx` (PWA) — o native
 * não importa código do PWA (tudo vive em app/_src). O teste
 * `tests/unit/native-brain-gate-parity.test.ts` (suíte da raiz) TRAVA o drift:
 * mudou o gate no PWA sem espelhar aqui → teste quebra.
 *
 * O servidor é a decisão final (extração por IA); estes gates são só o filtro
 * barato pra não chamar o Brain em toda mensagem. Flags vivem no SERVIDOR
 * (endpoint devolve {found:false} quando OFF) — nenhuma flag nova no cliente.
 */

/* ---- gates (espelho byte-a-byte da lógica do PWA) ---- */

export function looksLikeExamText(text: string): boolean {
  const s = (text || "").toLowerCase().trim();
  if (s.length < 6 || s.length > 600) return false;
  if (/[?]\s*$/.test(s)) return false;
  if (/^\s*(quando|qual|que dia|onde|como|por que|porque|quem|será que)\b/.test(s)) return false;
  const examWord = /\b(prova|provas|trabalho|trabalhos|avalia\w+|av\d|simulado|entrega|recupera\w+)\b/.test(s);
  const dateSignal = /\b\d{1,2}\/\d{1,2}\b|\bdia\s+\d{1,2}\b|\b(jan|fev|mar[çc]|abr|mai|jun|jul|ago|set|out|nov|dez)/.test(s);
  return examWord && dateSignal;
}

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

/* ---- resposta digitada a "de qual criança?" (espelho do PWA) ---- */

export interface ChildOption {
  id: string;
  name: string;
}

export function matchOneChildOption(
  text: string,
  options: ChildOption[],
): ChildOption | null {
  const norm = (x: string) => (x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const t = norm(text);
  if (!t.trim()) return null;
  const hits = options.filter((o) => {
    const first = norm((o.name || "").split(" ")[0]);
    return first.length >= 2 && new RegExp(`(^|[^a-z0-9])${first}([^a-z0-9]|$)`).test(t);
  });
  return hits.length === 1 ? hits[0] : null;
}

/* ---- tipos do contrato com o servidor (mesmo shape do widget PWA) ---- */

/** Intake aguardando confirmação (resposta dos endpoints de captura). */
export interface BrainIntakeRef {
  id: string;
  planHash?: string;
  confirmationToken?: string;
  count: number;
  /** 'health' | 'custody' | escolar (ausente). Dirige as copies. */
  doc?: string;
}

export interface CaptureResponse {
  found?: boolean;
  content?: string;
  childSelection?: { options: ChildOption[]; doc?: string };
  intake?: BrainIntakeRef;
}

/** Endpoint do playbook pelo docType da porta única (espelho do widget). */
export function endpointForDocType(docType: string): string {
  if (docType === "health_visit") return "/api/ai/assistant/consult-text";
  if (docType === "custody_routine") return "/api/ai/assistant/custody-text";
  return "/api/ai/assistant/exam-text";
}
