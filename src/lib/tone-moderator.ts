// IA Mediadora — Detecção de tom agressivo + reescrita neutra
// Versão 2: Cobertura ampliada de palavrões e ofensas em PT-BR

const aggressivePatterns = {
  // CAPS LOCK contínuo (8+ caracteres)
  allCaps: /[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s!?]{8,}/,

  // Palavras absolutistas
  absolutist:
    /(?<=\s|^)(nunca|sempre|jamais|todo mundo|toda vez|ningu[eé]m|incompetente|incapaz|irrespons[aá]vel|irresponsavel|nada certo|tudo errado)(?=\s|[.,!?]|$)/i,

  // Ataques pessoais
  personalAttacks:
    /(?<=\s|^)(voc[eê]\s+[eé]|voce\s+e|voc[eê]\s+faz|voc[eê]\s+s[oó]|tu\s+[eé]|sua culpa|[eé] sua|tua culpa|por sua causa|por culpa sua|culpa [eé] sua|voc[eê]\s+n[aã]o\s+presta|voc[eê]\s+n[aã]o\s+serve)(?=\s|[.,!?]|$)/i,

  // Exclamações/interrogações demais (3+)
  excessivePunctuation: /[!?]{3,}/,

  // Sarcasmo agressivo
  sarcasm: /(?<=\s|^)(claro|[oó]bvio|l[oó]gico|[eé] claro|naturalmente|parab[eé]ns|ah [eé]|ah claro|sei sei)(?=\s|[.,!?]|$).*[!?]{1,}/i,

  // Palavrões/insultos (cobertura ampla PT-BR)
  insults:
    /(?<=\s|^)(merda|porcaria|idiota|burr[oa]|lixo|miser[aá]vel|imbecil|vagabund[oa]|in[uú]til|rid[ií]cul[oa]|nojent[oa]|cretino|ot[aá]ri[oa]|babaca|fdp|pqp|porra|caralho|cuzao|cuz[aã]o|arrombad[oa]|desgra[cç]ad[oa]|filh[oa]\s*da\s*put[ao]|filho\s*da\s*p\b|vai\s*se\s*f[ou]der|vai\s*tomar|vtnc|vsf|puta\s*que\s*pariu|put[ao]|safad[oa]|canalha|verme|escr[oó]t[oa]|palha[cç]o|monstruos[oa]|animal|besta|peste|demon[ií]o|inferno|desgraça|disgraça|pilantra|sem\s*vergonha|sem-vergonha|cara\s*de\s*pau|mal\s*car[aá]ter|mau\s*car[aá]ter|covarde|froux[oa]|patético|pat[eé]tica|nojo|asco)(?=\s|[.,!?]|$)/i,

  // Ameaças veladas
  threats:
    /(?<=\s|^)(vai se arrepender|vou tirar|vou levar|vou processar|vai perder a guarda|n[aã]o vai ver|se prepara|se prepare|vai pagar|vou acabar|vou destruir|vou denunciar|vai ver s[oó]|espera s[oó]|cuidado comigo|te arrepende|vou embora com)(?=\s|[.,!?]|$)/i,

  // Imperativos agressivos
  aggressiveCommands:
    /(?<=\s|^)(cala\s*a?\s*boca|fica\s*quiet[oa]|sai\s*daqui|some\s*daqui|desaparece|morre|vai\s*embora|sai\s*da\s*minha\s*vida|n[aã]o\s*enche|para\s*de\s*encher|me\s*deixa\s*em\s*paz|larga\s*do\s*meu\s*p[eé]|dane-se|foda-se|que\s*se\s*dane|que\s*se\s*foda|pau\s*no\s*cu)(?=\s|[.,!?]|$)/i,
};

const AGGRESSION_THRESHOLD = 30;

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
    score += 25;
    patterns.push("caps");
  }
  if (aggressivePatterns.absolutist.test(text)) {
    score += 20;
    patterns.push("absolutismo");
  }
  if (aggressivePatterns.personalAttacks.test(text)) {
    score += 35;
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
  if (aggressivePatterns.aggressiveCommands.test(text)) {
    score += 40;
    patterns.push("comando agressivo");
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
    [/\bnada certo\b/gi, "algumas coisas a melhorar"],
    [/\btudo errado\b/gi, "algumas coisas a ajustar"],

    // Ataques pessoais → observações
    [/(?<=\s|^)voc[eê]\s+[eé](?=\s|[.,!?]|$)/gi, "percebi que voce esta"],
    [/(?<=\s|^)voce\s+e(?=\s|[.,!?]|$)/gi, "percebi que voce esta"],
    [/(?<=\s|^)tu\s+[eé](?=\s|[.,!?]|$)/gi, "percebi que voce esta"],
    [/(?<=\s|^)voc[eê]\s+faz(?=\s|[.,!?]|$)/gi, "notei que voce"],
    [/(?<=\s|^)sua culpa(?=\s|[.,!?]|$)/gi, "isso pode ser melhorado"],
    [/(?<=\s|^)culpa [eé] sua(?=\s|[.,!?]|$)/gi, "isso pode ser melhorado"],
    [/(?<=\s|^)[eé] sua(?=\s|[.,!?]|$)/gi, "seria bom ajustar"],
    [/(?<=\s|^)tua culpa(?=\s|[.,!?]|$)/gi, "isso pode ser melhorado"],
    [/(?<=\s|^)por sua causa(?=\s|[.,!?]|$)/gi, "por conta dessa situacao"],
    [/(?<=\s|^)por culpa sua(?=\s|[.,!?]|$)/gi, "por conta dessa situacao"],
    [/(?<=\s|^)voc[eê]\s+n[aã]o\s+presta(?=\s|[.,!?]|$)/gi, "voce pode melhorar"],
    [/(?<=\s|^)voc[eê]\s+n[aã]o\s+serve(?=\s|[.,!?]|$)/gi, "voce pode melhorar"],

    // Qualificadores negativos
    [/\bincompetente\b/gi, "com dificuldade"],
    [/\bincapaz\b/gi, "precisando de apoio"],
    [/(?<=\s|^)irrespons[aá]vel(?=\s|[.,!?]|$)/gi, "desatento"],

    // Palavrões → remover (lista ampla)
    [/\bidiot[ao]?\b/gi, ""],
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
    [/\bbabaca\b/gi, ""],
    [/\bfdp\b/gi, ""],
    [/\bpqp\b/gi, ""],
    [/\bporra\b/gi, ""],
    [/\bcaralho\b/gi, ""],
    [/\bcuz[aã]o\b/gi, ""],
    [/\bcuzao\b/gi, ""],
    [/\barrombad[oa]\b/gi, ""],
    [/(?<=\s|^)desgra[cç]ad[oa](?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)filh[oa]\s*da\s*put[ao](?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)filho\s*da\s*p\b/gi, ""],
    [/(?<=\s|^)vai\s*se\s*f[ou]der(?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)vai\s*tomar(?=\s|[.,!?]|$)/gi, ""],
    [/\bvtnc\b/gi, ""],
    [/\bvsf\b/gi, ""],
    [/(?<=\s|^)puta\s*que\s*pariu(?=\s|[.,!?]|$)/gi, ""],
    [/\bput[ao]\b/gi, ""],
    [/\bsafad[oa]\b/gi, ""],
    [/\bcanalha\b/gi, ""],
    [/\bverme\b/gi, ""],
    [/(?<=\s|^)escr[oó]t[oa](?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)palha[cç]o(?=\s|[.,!?]|$)/gi, ""],
    [/\bbesta\b/gi, ""],
    [/\bpeste\b/gi, ""],
    [/\bpilantra\b/gi, ""],
    [/(?<=\s|^)sem\s*vergonha(?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)sem-vergonha(?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)mal\s*car[aá]ter(?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)mau\s*car[aá]ter(?=\s|[.,!?]|$)/gi, ""],
    [/\bcovarde\b/gi, ""],
    [/(?<=\s|^)pat[eé]tic[oa](?=\s|[.,!?]|$)/gi, ""],
    [/\bnojo\b/gi, ""],

    // Imperativos agressivos → pedidos
    [/(?<=\s|^)cala\s*a?\s*boca(?=\s|[.,!?]|$)/gi, "vamos conversar com calma"],
    [/(?<=\s|^)fica\s*quiet[oa](?=\s|[.,!?]|$)/gi, "vamos nos ouvir"],
    [/(?<=\s|^)some\s*daqui(?=\s|[.,!?]|$)/gi, "precisamos de um tempo"],
    [/(?<=\s|^)sai\s*daqui(?=\s|[.,!?]|$)/gi, "precisamos de um tempo"],
    [/(?<=\s|^)dane-se(?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)foda-se(?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)que\s*se\s*dane(?=\s|[.,!?]|$)/gi, ""],
    [/(?<=\s|^)que\s*se\s*foda(?=\s|[.,!?]|$)/gi, ""],

    // Ameaças → pedidos
    [/(?<=\s|^)vai se arrepender(?=\s|[.,!?]|$)/gi, "precisamos resolver isso"],
    [/\bvou tirar\b/gi, "gostaria de conversar sobre"],
    [/\bvou processar\b/gi, "precisamos alinhar isso"],
    [/\bse prepara\b/gi, "vamos conversar"],
    [/\bse prepare\b/gi, "vamos conversar"],
    [/\bvai pagar\b/gi, "precisamos resolver isso"],
    [/\bvou acabar\b/gi, "precisamos conversar sobre"],
    [/\bvou destruir\b/gi, "precisamos resolver"],
    [/(?<=\s|^)espera s[oó](?=\s|[.,!?]|$)/gi, "vamos conversar"],
  ];

  for (const [pattern, replacement] of substitutions) {
    neutral = neutral.replace(pattern, replacement);
  }

  // Remove CAPS LOCK
  if (/[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s!?]{8,}/.test(neutral)) {
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

  // Se ficou muito curto após limpeza, usa frase padrão
  if (neutral.split(" ").filter(w => w.length > 0).length < 3) {
    neutral = "Podemos conversar sobre isso com calma?";
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
