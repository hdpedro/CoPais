/* ------------------------------------------------------------------ */
/* Fase 1 (paridade native): o native FORKA os gates do Brain (app/_src */
/* não importa do PWA). Este teste roda os DOIS lados na mesma bateria  */
/* e trava o drift: mudou o gate no PWA sem espelhar no native (ou      */
/* vice-versa) → quebra aqui, não no bolso do usuário.                  */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import {
  looksLikeExamText as pwaExam,
  looksLikeConsultText as pwaConsult,
  looksLikeCustodyText as pwaCustody,
  looksLikeExpenseText as pwaExpense,
} from "@/lib/ai/brain/exam-text-gate";
import { matchOneChildOption as pwaMatch } from "@/components/AIAssistant";
import {
  looksLikeExamText as natExam,
  looksLikeConsultText as natConsult,
  looksLikeCustodyText as natCustody,
  looksLikeExpenseText as natExpense,
  matchOneChildOption as natMatch,
} from "../../kindar-native/app/_src/lib/brain-capture";

const BATTERY = [
  // provas
  "A prova de matemática do Otto é dia 20/08.",
  "Simulado de ciências dia 3",
  "quando é a prova de história?",
  "trabalho de geografia sem data nenhuma aqui ó",
  // consulta
  "A consulta do Lucas foi boa, a pediatra passou antialérgico por 7 dias.",
  "a médica passou um remédio, acho que de 8 em 8 horas",
  "pode marcar dentista?",
  "remédio", // curto demais
  // guarda
  "Semana que vem o Otto fica comigo, a Fernanda viaja",
  "Na quinta quem busca é a minha mãe",
  "A partir de segunda quem leva é o pai",
  "Quem busca o Otto amanhã?",
  "a guarda tá tranquila ultimamente",
  "Semana que vem o Otto vai dormir na minha casa na quinta", // porta única (gate NÃO morde)
  // despesas (Fase 2)
  "paguei 250 na consulta do Otto",
  "gastei 89,90 no tênis do Martim ontem",
  "R$ 45 de uber pra escola",
  "paguei a consulta do Otto", // sem valor — gate não morde
  // ruído
  "oi, tudo bem?",
  "quanto gastei esse mês?",
];

describe("paridade PWA ↔ native — gates do Brain", () => {
  it.each(BATTERY)("mesmo veredito nos dois lados: %s", (s) => {
    expect(natExam(s)).toBe(pwaExam(s));
    expect(natConsult(s)).toBe(pwaConsult(s));
    expect(natCustody(s)).toBe(pwaCustody(s));
    expect(natExpense(s)).toBe(pwaExpense(s));
  });
});

describe("paridade PWA ↔ native — resposta digitada de criança", () => {
  const OPTIONS = [
    { id: "c1", name: "Otto de Pedro" },
    { id: "c2", name: "Martim de Pedro" },
  ];
  it.each(["do Otto", "é do martim", "OTTO", "dos dois", "sei lá", "Otto e Martim"]) (
    "mesmo match: %s",
    (s) => {
      expect(natMatch(s, OPTIONS)?.id ?? null).toBe(pwaMatch(s, OPTIONS)?.id ?? null);
    },
  );
});
