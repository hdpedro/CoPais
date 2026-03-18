// IA Mediadora — Detecção de tom agressivo + reescrita neutra
// Versão MVP: Regex + heurística (sem dependência de API externa)

const aggressivePatterns = {
  // CAPS LOCK contínuo (10+ caracteres)
  allCaps: /[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s!?]{10,}/,

  // Palavras absolutistas
  absolutist:
    /\b(nunca|sempre|jamais|todo mundo|toda vez|ninguém|incompetente|incapaz|irresponsável|irresponsavel)\b/gi,

  // Ataques pessoais
  personalAttacks:
    /\b(você é|voce é|voce e|você faz|voce faz|sua culpa|é sua|tua culpa|por sua causa|por culpa sua)\b/gi,

  // Exclamações/interrogações demais (3+)
  excessivePunctuation: /[!?]{3,}/,

  // Sarcasmo agressivo
  sarcasm: /\b(claro|óbvio|obvio|lógico|logico|é claro|naturalmente|parabéns|parabens)\b.*[!?]{2,}/gi,

  // Palavrões/insultos
  insults:
    /\b(merda|porcaria|idiota|burr[oa]|lixo|miserável|miseravel|imbecil|vagabund[oa]|inútil|inutil|ridícul[oa]|ridicul[oa]|nojent[oa]|cretino|otári[oa]|otari[oa])\b/gi,

  // Ameaças veladas
  threats:
    /\b(vai se arrepender|vou tirar|vou levar|vou processar|vai perder a guarda|não vai ver|nao vai ver|se prepara|se prepare)\b/gi,
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
    [/\bninguém\b/gi, "poucas pessoas"],

    // Ataques pessoais → observações
    [/\bvoc[eê] [eé]\b/gi, "percebi que voce"],
    [/\bvoce e\b/gi, "percebi que voce"],
    [/\bvoc[eê] faz\b/gi, "notei que voce"],
    [/\bsua culpa\b/gi, "isso pode ser melhorado"],
    [/\b[eé] sua\b/gi, "seria bom ajustar"],
    [/\btua culpa\b/gi, "isso pode ser melhorado"],
    [/\bpor sua causa\b/gi, "por conta dessa situacao"],
    [/\bpor culpa sua\b/gi, "por conta dessa situacao"],

    // Qualificadores negativos
    [/\bincompetente\b/gi, "com dificuldade"],
    [/\bincapaz\b/gi, "precisando de apoio"],
    [/\birrespons[aá]vel\b/gi, "desatento"],
    [/\bidiot[ao]\b/gi, ""],
    [/\bburr[ao]\b/gi, ""],
    [/\bimbecil\b/gi, ""],
    [/\bvagabund[oa]\b/gi, ""],
    [/\bin[uú]til\b/gi, ""],
    [/\brid[ií]cul[oa]\b/gi, ""],
    [/\bnojent[oa]\b/gi, ""],
    [/\bcretino\b/gi, ""],
    [/\bot[aá]ri[oa]\b/gi, ""],
    [/\bmiser[aá]vel\b/gi, ""],
    [/\blixo\b/gi, ""],
    [/\bmerda\b/gi, ""],
    [/\bporcaria\b/gi, "situacao dificil"],

    // Ameaças → pedidos
    [/\bvai se arrepender\b/gi, "precisamos resolver isso"],
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
