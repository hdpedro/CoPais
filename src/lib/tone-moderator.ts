// IA Mediadora — Detecção de tom agressivo + reescrita neutra
// Versão MVP: Regex + heurística (sem dependência de API externa)

const aggressivePatterns = {
  // CAPS LOCK contínuo (10+ caracteres)
  allCaps: /[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s!?]{10,}/,

  // Palavras absolutistas (sem \b por causa de acentos; sem /g para evitar lastIndex bug)
  absolutist:
    /(?<=\s|^)(nunca|sempre|jamais|todo mundo|toda vez|ningu[eé]m|incompetente|incapaz|irrespons[aá]vel|irresponsavel)(?=\s|[.,!?]|$)/i,

  // Ataques pessoais
  personalAttacks:
    /(?<=\s|^)(voc[eê]\s+[eé]|voce\s+e|voc[eê]\s+faz|sua culpa|[eé] sua|tua culpa|por sua causa|por culpa sua)(?=\s|[.,!?]|$)/i,

  // Exclamações/interrogações demais (3+)
  excessivePunctuation: /[!?]{3,}/,

  // Sarcasmo agressivo
  sarcasm: /(?<=\s|^)(claro|[oó]bvio|l[oó]gico|[eé] claro|naturalmente|parab[eé]ns)(?=\s|[.,!?]|$).*[!?]{2,}/i,

  // Palavrões/insultos
  insults:
    /(?<=\s|^)(merda|porcaria|idiota|burr[oa]|lixo|miser[aá]vel|imbecil|vagabund[oa]|in[uú]til|rid[ií]cul[oa]|nojent[oa]|cretino|ot[aá]ri[oa])(?=\s|[.,!?]|$)/i,

  // Ameaças veladas
  threats:
    /(?<=\s|^)(vai se arrepender|vou tirar|vou levar|vou processar|vai perder a guarda|n[aã]o vai ver|se prepara|se prepare)(?=\s|[.,!?]|$)/i,
};

const AGGRESSION_THRESHOLD = 40;

interface AnalysisResult {
  isAggressive: boolean;
  score: number;
  suggestion: string | null;
  detectedPatterns: string[];
}

function calculateAggressionScore(text: string): {
  score: number;
  patterns: string[];
} {
  let score = 0;
  const patterns: string[] = [];

  if (aggressivePatterns.allCaps.test(text)) {
    score += 30;
    patterns.push("caps");
  }
  if (aggressivePatterns.absolutist.test(text)) {
    score += 20;
    patterns.push("absolutismo");
  }
  if (aggressivePatterns.personalAttacks.test(text)) {
    score += 40;
    patterns.push("ataque pessoal");
  }
  if (aggressivePatterns.excessivePunctuation.test(text)) {
    score += 15;
    patterns.push("pontuacao");
  }
  if (aggressivePatterns.sarcasm.test(text)) {
    score += 20;
    patterns.push("sarcasmo");
  }
  if (aggressivePatterns.insults.test(text)) {
    score += 50;
    patterns.push("insulto");
  }
  if (aggressivePatterns.threats.test(text)) {
    score += 35;
    patterns.push("ameaca");
  }

  return { score: Math.min(score, 100), patterns };
}

function rewriteToNeutral(text: string): string {
  let neutral = text;

  const substitutions: [RegExp, string][] = [
    // Absolutismo → relativismo
    [/\bnunca\b/gi, "as vezes"],
    [/\bsempre\b/gi, "frequentemente"],
    [/\bjamais\b/gi, "raramente"],
    [/\btodo mundo\b/gi, "algumas pessoas"],
    [/\btoda vez\b/gi, "em algumas ocasioes"],
    [/(?<=\s|^)ningu[eé]m(?=\s|[.,!?]|$)/gi, "poucas pessoas"],

    // Ataques pessoais → observações
    [/(?<=\s|^)voc[eê]\s+[eé](?=\s|[.,!?]|$)/gi, "percebi que voce esta"],
    [/(?<=\s|^)voce\s+e(?=\s|[.,!?]|$)/gi, "percebi que voce esta"],
    [/(?<=\s|^)voc[eê]\s+faz(?=\s|[.,!?]|$)/gi, "notei que voce"],
    [/(?<=\s|^)sua culpa(?=\s|[.,!?]|$)/gi, "isso pode ser melhorado"],
    [/(?<=\s|^)[eé] sua(?=\s|[.,!?]|$)/gi, "seria bom ajustar"],
    [/(?<=\s|^)tua culpa(?=\s|[.,!?]|$)/gi, "isso pode ser melhorado"],
    [/(?<=\s|^)por sua causa(?=\s|[.,!?]|$)/gi, "por conta dessa situacao"],
    [/(?<=\s|^)por culpa sua(?=\s|[.,!?]|$)/gi, "por conta dessa situacao"],

    // Qualificadores negativos
    [/\bincompetente\b/gi, "com dificuldade"],
    [/\bincapaz\b/gi, "precisando de apoio"],
    [/(?<=\s|^)irrespons[aá]vel(?=\s|[.,!?]|$)/gi, "desatento"],
    [/\bidiot[ao]\b/gi, ""],
    [/\bburr[ao]\b/gi, ""],
    [/\bimbecil\b/gi, ""],
    [/\bvagabund[oa]\b/gi, ""],
    [/(?<=\s|^)in[uú]til(?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)rid[ií]cul[oa](?=\s|[.,!?]|$)/gi, ""],
    [/\bnojent[oa]\b/gi, ""],
    [/\bcretino\b/gi, ""],
    [/(?<=\s|^)ot[aá]ri[oa](?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)miser[aá]vel(?=\s|[.,!?]|$)/gi, ""],
    [/\blixo\b/gi, ""],
    [/\bmerda\b/gi, ""],
    [/\bporcaria\b/gi, "situacao dificil"],

    // Ameaças → pedidos
    [/(?<=\s|^)vai se arrepender(?=\s|[.,!?]|$)/gi, "precisamos resolver isso"],
    [/\bvou tirar\b/gi, "gostaria de conversar sobre"],
    [/\bvou processar\b/gi, "precisamos alinhar isso"],
    [/\bse prepara\b/gi, "vamos conversar"],
    [/\bse prepare\b/gi, "vamos conversar"],
  ];

  for (const [pattern, replacement] of substitutions) {
    neutral = neutral.replace(pattern, replacement);
  }

  // Remove CAPS LOCK
  if (/[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s!?]{10,}/.test(neutral)) {
    neutral = neutral
      .split(/(\s+)/)
      .map((word) => {
        if (word === word.toUpperCase() && word.trim().length > 1) {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        return word;
      })
      .join("");
  }

  // Reduz pontuação excessiva
  neutral = neutral.replace(/([!?]){3,}/g, ".");
  neutral = neutral.replace(/([!?]){2}/g, ".");

  // Remove espaços duplos criados por remoção de palavrões
  neutral = neutral.replace(/\s{2,}/g, " ").trim();

  // Remove pontuação duplicada/solta (ex: ", ." ou ",," ou ", ,")
  neutral = neutral.replace(/[,;]\s*\./g, ".");
  neutral = neutral.replace(/[,;]\s*[,;]/g, ",");
  neutral = neutral.replace(/\.\s*\./g, ".");

  // Remove pontuação solta no início
  neutral = neutral.replace(/^\s*[.,;:]\s*/, "");

  // Capitaliza primeira letra
  if (neutral.length > 0) {
    neutral = neutral.charAt(0).toUpperCase() + neutral.slice(1);
  }

  // Garante pontuação final
  if (neutral.length > 0 && !/[.?!]$/.test(neutral)) {
    neutral += ".";
  }

  // Se ficou muito curto após limpeza, adiciona contexto
  if (neutral.split(" ").length < 4 && neutral.length > 0) {
    neutral += " Podemos conversar sobre isso?";
  }

  return neutral;
}

export function analyzeTone(text: string): AnalysisResult {
  if (!text || text.trim().length < 5) {
    return { isAggressive: false, score: 0, suggestion: null, detectedPatterns: [] };
  }

  const { score, patterns } = calculateAggressionScore(text);
  const isAggressive = score >= AGGRESSION_THRESHOLD;

  return {
    isAggressive,
    score,
    suggestion: isAggressive ? rewriteToNeutral(text) : null,
    detectedPatterns: patterns,
  };
}
