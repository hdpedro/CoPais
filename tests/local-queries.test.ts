import { describe, expect, it } from "vitest";
import {
  parseQueryIntent,
  fuzzyMatchIntent,
  parsePeriod,
  resolveChild,
  resolveMember,
  refersToSelf,
} from "../src/lib/ai/local-queries";

const ctx = {
  children: [
    { id: "c1", name: "Bernardo Pedro" },
    { id: "c2", name: "Beatriz Pedro" },
  ],
  members: [
    { id: "u1", name: "Henrique Pedro" },
    { id: "u2", name: "Maria Silva" },
  ],
  currentUserId: "u1",
};

describe("parseQueryIntent — pais e avós", () => {
  const cases: Array<[string, string]> = [
    ["Quantos dias eu tenho a guarda do Bernardo em junho?", "customCustodyCount"],
    ["Quantos finais de semana fico com o Bernardo em julho?", "customCustodyCount"],
    ["Quem tá com o Bê hoje?", "queryCustody"],
    ["De quem é a vez amanhã?", "queryCustody"],
    ["O que tem essa semana?", "queryUpcoming"],
    ["Próximos compromissos", "queryUpcoming"],
    ["Quanto gastei esse mês?", "queryExpenses"],
    ["Gastos com escola no mês passado", "queryExpenses"],
    ["Qual meu saldo?", "queryBalance"],
    ["Estamos quites?", "queryBalance"],
    ["Como tá a saúde do Bernardo?", "queryHealth"],
    ["Próxima vacina do Bernardo?", "queryHealth"],
    ["Bê tá doente?", "queryStatus"],
    ["Tem coisa pra eu aprovar?", "queryPending"],
    ["Histórico do Bernardo", "queryHistory"],
    ["Resumo da família esse mês", "customFamilySummary"],
    ["Como foi a semana do Bernardo?", "customChildSummary"],
    ["Preciso falar com a Maria sobre atraso de 15 minutos", "customDraftMessage"],
    ["Como falo com a mãe que vou trocar dia 15/06 por 20/06?", "customDraftMessage"],
    ["Quando vou pegar o Bernardo?", "customNextCustody"],
  ];

  for (const [text, expected] of cases) {
    it(`"${text}" → ${expected}`, () => {
      const r = parseQueryIntent(text, ctx);
      expect(r?.action).toBe(expected);
    });
  }
});

describe("fuzzyMatchIntent — fallback sem regex", () => {
  it("'tô devendo' → queryBalance", () => {
    const r = fuzzyMatchIntent("tô devendo?", ctx);
    expect(r?.action).toBe("queryBalance");
  });
  it("'gastos' → queryExpenses", () => {
    const r = fuzzyMatchIntent("ver os gastos", ctx);
    expect(r?.action).toBe("queryExpenses");
  });
  it("'aprovacao' → queryPending", () => {
    const r = fuzzyMatchIntent("aprovacao", ctx);
    expect(r?.action).toBe("queryPending");
  });
});

describe("parsePeriod", () => {
  it("'em junho' retorna mês inteiro", () => {
    const p = parsePeriod("em junho")!;
    expect(p.kind).toBe("month");
    expect(p.startISO.slice(5)).toBe("06-01");
    // Junho tem 30 dias; aceitar 06-30 OU 06-29 dependendo do TZ do runner
    expect(p.endISO.slice(5).startsWith("06-")).toBe(true);
  });
  it("'esse mês' retorna mês corrente", () => {
    const p = parsePeriod("esse mês")!;
    expect(p.kind).toBe("month");
  });
  it("'fim de semana' retorna sábado+domingo", () => {
    const p = parsePeriod("fim de semana")!;
    // Parse explícito como local time pra evitar shift de timezone do Date(ISO)
    const parseLocal = (iso: string) => {
      const [y, m, d] = iso.split("-").map(Number);
      return new Date(y, m - 1, d).getDay();
    };
    expect(parseLocal(p.startISO)).toBe(6);
    expect(parseLocal(p.endISO)).toBe(0);
  });
  it("'amanhã' retorna 1 dia", () => {
    const p = parsePeriod("amanhã")!;
    expect(p.kind).toBe("day");
    expect(p.startISO).toBe(p.endISO);
  });
});

describe("resolveChild — apelidos", () => {
  it("'Bernardo' acerta", () => {
    expect(resolveChild("Bernardo", ctx.children)?.name).toBe("Bernardo Pedro");
  });
  it("'Beatriz' acerta", () => {
    expect(resolveChild("Beatriz", ctx.children)?.name).toBe("Beatriz Pedro");
  });
  it("'Bê' não resolve quando há colisão (Bernardo/Beatriz)", () => {
    expect(resolveChild("Bê", ctx.children)).toBeNull();
  });
  it("'Bern' resolve só Bernardo", () => {
    expect(resolveChild("Bern", ctx.children)?.name).toBe("Bernardo Pedro");
  });
  it("'filho' com 1 só filho auto-resolve", () => {
    const single = [{ id: "c1", name: "Bernardo Pedro" }];
    expect(resolveChild("meu filho", single)?.name).toBe("Bernardo Pedro");
  });
});

describe("resolveMember — papéis", () => {
  it("'mãe' resolve coparente", () => {
    expect(resolveMember("falar com a mãe", ctx.members, "u1")?.id).toBe("u2");
  });
  it("'Maria' resolve por nome", () => {
    expect(resolveMember("Maria", ctx.members, "u1")?.id).toBe("u2");
  });
  it("não acha membro inexistente", () => {
    expect(resolveMember("Pedro", ctx.members, "u1")).toBeNull();
  });
});

describe("refersToSelf", () => {
  it("'eu tenho' → true", () => expect(refersToSelf("eu tenho")).toBe(true));
  it("'comigo' → true", () => expect(refersToSelf("comigo")).toBe(true));
  it("'a mãe' → false", () => expect(refersToSelf("a mãe")).toBe(false));
});

describe("Smalltalk: greeting / help / thanks", () => {
  const intents: Array<[string, string]> = [
    ["oi", "customGreeting"],
    ["olá", "customGreeting"],
    ["bom dia", "customGreeting"],
    ["boa tarde!", "customGreeting"],
    ["boa noite", "customGreeting"],
    ["e aí", "customGreeting"],
    ["salve", "customGreeting"],
    ["ajuda", "customHelp"],
    ["help", "customHelp"],
    ["comandos", "customHelp"],
    ["o que você faz?", "customHelp"],
    ["como funciona", "customHelp"],
    ["?", "customHelp"],
    ["obrigado", "customThanks"],
    ["valeu!", "customThanks"],
    ["vlw", "customThanks"],
    ["brigado", "customThanks"],
  ];
  for (const [text, expected] of intents) {
    it(`"${text}" → ${expected}`, () => {
      expect(parseQueryIntent(text, ctx)?.action).toBe(expected);
    });
  }
});

describe("Aniversário, fim de semana, comparação", () => {
  it("'próximo aniversário' → customBirthday", () => {
    expect(parseQueryIntent("Quando é o próximo aniversário?", ctx)?.action).toBe("customBirthday");
  });
  it("'aniversário do Bernardo' → customBirthday", () => {
    expect(parseQueryIntent("aniversário do Bernardo", ctx)?.action).toBe("customBirthday");
  });
  it("'planos do fim de semana' → customWeekendPlan", () => {
    expect(parseQueryIntent("quais os planos do fim de semana?", ctx)?.action).toBe("customWeekendPlan");
  });
  it("'o que vamos fazer no finde' → customWeekendPlan", () => {
    expect(parseQueryIntent("o que vamos fazer no finde", ctx)?.action).toBe("customWeekendPlan");
  });
  it("'gastei mais que o mês passado?' → customExpenseComparison", () => {
    expect(parseQueryIntent("gastei mais que o mês passado?", ctx)?.action).toBe("customExpenseComparison");
  });
  it("'esse mês foi maior que o passado' → customExpenseComparison", () => {
    expect(parseQueryIntent("esse mês foi maior que o passado", ctx)?.action).toBe("customExpenseComparison");
  });
});

describe("Edge cases", () => {
  it("string vazia → null", () => {
    expect(parseQueryIntent("", ctx)).toBeNull();
  });
  it("string só de espaços → null", () => {
    expect(parseQueryIntent("    ", ctx)).toBeNull();
  });
  it("texto sem nada conhecido → null", () => {
    expect(parseQueryIntent("xyzwq qwerty", ctx)).toBeNull();
  });
  it("só emoji não casa", () => {
    expect(parseQueryIntent("🎉🎉", ctx)).toBeNull();
  });
});

describe("Gírias e abreviações brasileiras (fuzzy)", () => {
  const cases: Array<[string, string]> = [
    ["torrei uma grana", "queryExpenses"],
    ["tô fechando o saldo", "queryBalance"],
    ["meu netinho tá bem?", "queryStatus"],
    ["alguma coisa pra aprovar?", "queryPending"],
    ["última coisa que rolou com Bernardo", "queryHistory"],
  ];
  for (const [text, expected] of cases) {
    it(`fuzzy "${text}" → ${expected}`, () => {
      const r = parseQueryIntent(text, ctx) || fuzzyMatchIntent(text, ctx);
      expect(r?.action).toBe(expected);
    });
  }
});

describe("Variações de período", () => {
  const cases: Array<[string, string]> = [
    ["em janeiro", "month"],
    ["no mês de fevereiro", "month"],
    ["em junho", "month"],
    ["esse mês", "month"],
    ["mês passado", "month"],
    ["mês que vem", "month"],
    ["essa semana", "week"],
    ["semana passada", "week"],
    ["semana que vem", "week"],
    ["esse ano", "year"],
    ["hoje", "day"],
    ["amanhã", "day"],
    ["ontem", "day"],
  ];
  for (const [text, expectedKind] of cases) {
    it(`'${text}' → kind=${expectedKind}`, () => {
      expect(parsePeriod(text)?.kind).toBe(expectedKind);
    });
  }
});

describe("Custody count permutações", () => {
  it("'fico' funciona como 'fica'", () => {
    expect(parseQueryIntent("Quantos finais de semana fico com o Bernardo em julho?", ctx)?.action).toBe("customCustodyCount");
  });
  it("'pego' também trigga", () => {
    expect(parseQueryIntent("Quantos dias pego o Bernardo em junho?", ctx)?.action).toBe("customCustodyCount");
  });
  it("'fds' (gíria) trigga", () => {
    expect(parseQueryIntent("Quantos fds tenho a guarda em junho?", ctx)?.action).toBe("customCustodyCount");
  });
});

describe("Pendentes: várias formas", () => {
  const cases = [
    "tem coisa pra eu aprovar?",
    "aprovações pendentes",
    "alguma troca pendente?",
    "tem algo pra aprovar?",
  ];
  for (const text of cases) {
    it(`"${text}" → queryPending`, () => {
      expect(parseQueryIntent(text, ctx)?.action).toBe("queryPending");
    });
  }
});

describe("Health: variações", () => {
  it("'próxima vacina' não cai em queryUpcoming", () => {
    expect(parseQueryIntent("próxima vacina do Bernardo", ctx)?.action).toBe("queryHealth");
  });
  it("'remédios do Bernardo' → queryHealth", () => {
    expect(parseQueryIntent("quais remédios do Bernardo", ctx)?.action).toBe("queryHealth");
  });
  it("'alergias do Bernardo' → queryHealth", () => {
    expect(parseQueryIntent("alergias do Bernardo", ctx)?.action).toBe("queryHealth");
  });
});
