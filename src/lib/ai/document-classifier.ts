/* ------------------------------------------------------------------ */
/* document-classifier.ts — classificador de documento por VISÃO         */
/*                                                                      */
/* COMPARTILHADO (não é WhatsApp-específico): dado o buffer de uma        */
/* imagem, o modelo VÊ e diz o tipo (recibo/calendário/receita/…). Serve  */
/* pra rotear a imagem pro fluxo certo quando a LEGENDA não deu intenção  */
/* clara — em vez de assumir "recibo" por padrão. Reusa                  */
/* compressImageForVision + routeVisionRequest. Nunca lança: em qualquer  */
/* falha devolve { type:"unknown", confidence:0 } (o caller mantém o      */
/* comportamento padrão = sem regressão). Pensado pra os DOIS canais      */
/* (WhatsApp hoje; assistente do app na Fase 2).                          */
/* ------------------------------------------------------------------ */

import "server-only";
import { compressImageForVision } from "./image-utils";
import { routeVisionRequest } from "./router";

export type DocumentType =
  | "receipt" // recibo/nota/comprovante de despesa
  | "prescription" // receita médica
  | "vaccine_proof" // carteira/comprovante de vacina
  | "attestation" // atestado
  | "exam" // exame/laudo médico
  | "school_calendar" // calendário/cronograma de provas da escola
  | "unknown";

export interface DocumentClassification {
  type: DocumentType;
  confidence: number; // 0..1
}

const VALID_TYPES: readonly string[] = [
  "receipt",
  "prescription",
  "vaccine_proof",
  "attestation",
  "exam",
  "school_calendar",
  "unknown",
];

const SYSTEM_PROMPT = `Você classifica o TIPO de um documento fotografado por um pai ou mãe no app de coparentalidade Kindar. Olhe a IMAGEM e responda SÓ com um JSON válido, sem texto extra:
{"type": "<um dos tipos>", "confidence": <número de 0 a 1>}

Tipos possíveis:
- "receipt": recibo, nota fiscal, boleto ou comprovante de despesa/pagamento.
- "prescription": receita médica (medicamentos prescritos).
- "vaccine_proof": carteira ou comprovante de vacinação.
- "attestation": atestado médico.
- "exam": exame ou laudo médico (resultado, imagem).
- "school_calendar": calendário/cronograma escolar com DATAS de provas/avaliações/trabalhos.
- "unknown": nada acima ou não dá pra ler.

Regras: baseie-se no CONTEÚDO visual (uma tabela de datas e disciplinas = school_calendar; valores em R$ e itens = receipt). Seja conservador: se não tiver certeza, use confidence baixa (< 0.5). NUNCA invente.`;

/** Parse PURO da resposta do modelo → classificação normalizada. Tolerante a
 *  cercas ```json, tipo inválido (→ unknown) e confidence ausente/ruim. */
export function parseClassification(raw: string): DocumentClassification {
  try {
    let txt = (raw || "").trim();
    if (txt.startsWith("```")) txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    // pega o 1º objeto JSON, caso o modelo cerque com prosa
    const match = txt.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : txt) as { type?: unknown; confidence?: unknown };
    const type = (VALID_TYPES.includes(String(parsed.type)) ? parsed.type : "unknown") as DocumentType;
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = type === "unknown" ? 0 : 0.5;
    confidence = Math.max(0, Math.min(1, confidence));
    return { type, confidence };
  } catch {
    return { type: "unknown", confidence: 0 };
  }
}

/**
 * Classifica o documento por visão. `caption` (opcional) é uma dica extra. Nunca
 * lança — falha de provedor/parse vira { type:"unknown", confidence:0 }.
 */
export async function classifyDocumentByVision(
  imageBuffer: Buffer,
  caption?: string,
): Promise<DocumentClassification> {
  try {
    const { base64, mimeType } = await compressImageForVision(imageBuffer);
    const userPrompt =
      caption && caption.trim() !== ""
        ? `Legenda que o usuário escreveu: "${caption.trim()}". Classifique a imagem pelo conteúdo.`
        : "Classifique a imagem pelo conteúdo.";
    const res = await routeVisionRequest(base64, mimeType, SYSTEM_PROMPT, userPrompt, {
      temperature: 0,
      maxTokens: 80,
      timeoutMs: 8000,
    });
    return parseClassification(res.text);
  } catch {
    return { type: "unknown", confidence: 0 };
  }
}
