export interface AIAction {
  name: string;
  description: string;
  params: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  category: string;
}

export const AI_ACTIONS: AIAction[] = [
  {
    name: "createEvent",
    description:
      "Criar evento/compromisso no calendário (consulta, viagem, festa, reunião)",
    category: "calendar",
    params: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Nome do evento",
      },
      {
        name: "date",
        type: "date",
        required: true,
        description: "Data no formato YYYY-MM-DD",
      },
      {
        name: "time",
        type: "time",
        required: false,
        description: "Horário no formato HH:MM",
      },
      {
        name: "endDate",
        type: "date",
        required: false,
        description: "Data fim para eventos multi-dia",
      },
      {
        name: "location",
        type: "string",
        required: false,
        description: "Local do evento",
      },
      {
        name: "description",
        type: "string",
        required: false,
        description: "Descrição",
      },
      {
        name: "category",
        type: "string",
        required: false,
        description:
          "Categoria: sport, health, school, art, music, therapy, evento, viagem, guarda, other",
      },
      {
        name: "allDay",
        type: "boolean",
        required: false,
        description: "Se é dia inteiro",
      },
    ],
  },
  {
    name: "createExpense",
    description: "Registrar despesa/gasto compartilhado",
    category: "financial",
    params: [
      {
        name: "description",
        type: "string",
        required: true,
        description: "Descrição da despesa",
      },
      {
        name: "amount",
        type: "number",
        required: true,
        description: "Valor em reais",
      },
      {
        name: "category",
        type: "string",
        required: false,
        description:
          "Categoria: alimentacao, educacao, saude, vestuario, lazer, transporte, moradia, outros",
      },
    ],
  },
  {
    name: "createAppointment",
    description: "Marcar consulta médica para uma criança",
    category: "health",
    params: [
      {
        name: "childName",
        type: "string",
        required: true,
        description: "Nome da criança",
      },
      {
        name: "appointmentType",
        type: "string",
        required: false,
        description:
          "Tipo: routine, specialist, emergency, exam, vaccine, dental, therapy, other",
      },
      {
        name: "date",
        type: "date",
        required: true,
        description: "Data YYYY-MM-DD",
      },
      {
        name: "time",
        type: "time",
        required: false,
        description: "Horário HH:MM",
      },
      {
        name: "location",
        type: "string",
        required: false,
        description: "Local/clínica",
      },
      {
        name: "notes",
        type: "string",
        required: false,
        description: "Observações",
      },
    ],
  },
  {
    name: "createHealthLog",
    description:
      "Registrar informação de saúde (febre, peso, sintoma, medicamento dado)",
    category: "health",
    params: [
      {
        name: "childName",
        type: "string",
        required: true,
        description: "Nome da criança",
      },
      {
        name: "logType",
        type: "string",
        required: true,
        description:
          "Tipo: temperature, weight, height, symptom, medication, vaccine, allergy, sleep, feeding, mood, milestone",
      },
      {
        name: "value",
        type: "string",
        required: true,
        description: "Valor (ex: 38.5 para febre, 15kg para peso)",
      },
      {
        name: "notes",
        type: "string",
        required: false,
        description: "Observações",
      },
    ],
  },
  {
    name: "createCheckin",
    description:
      "Registrar check-in diário da criança (como dormiu, comeu, humor, tela)",
    category: "daily",
    params: [
      {
        name: "childName",
        type: "string",
        required: true,
        description: "Nome da criança",
      },
      {
        name: "category",
        type: "string",
        required: true,
        description:
          "Categoria: screen, food, sleep, mood, health, activity, school",
      },
      {
        name: "text",
        type: "string",
        required: true,
        description: "O que aconteceu",
      },
    ],
  },
  {
    name: "createDecision",
    description: "Criar decisão para votação entre os pais",
    category: "decisions",
    params: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Título da decisão",
      },
      {
        name: "description",
        type: "string",
        required: false,
        description: "Descrição/contexto",
      },
      {
        name: "category",
        type: "string",
        required: false,
        description:
          "Categoria: education, health, financial, routine, travel, other",
      },
    ],
  },
  {
    name: "createNote",
    description: "Criar nota pessoal privada",
    category: "notes",
    params: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Título",
      },
      {
        name: "content",
        type: "string",
        required: true,
        description: "Conteúdo da nota",
      },
      {
        name: "category",
        type: "string",
        required: false,
        description:
          "Categoria: lembrete, observacao, preparacao, juridico, outro",
      },
    ],
  },
  {
    name: "createActivity",
    description:
      "Criar atividade recorrente (aula, esporte, terapia semanal)",
    category: "calendar",
    params: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Nome da atividade",
      },
      {
        name: "childName",
        type: "string",
        required: true,
        description: "Nome da criança",
      },
      {
        name: "category",
        type: "string",
        required: false,
        description:
          "Categoria: sport, health, school, art, music, therapy, course, other",
      },
      {
        name: "recurrenceDays",
        type: "string",
        required: false,
        description: "Dias da semana: seg,ter,qua,qui,sex,sab,dom",
      },
      {
        name: "timeStart",
        type: "time",
        required: false,
        description: "Horário início HH:MM",
      },
      {
        name: "timeEnd",
        type: "time",
        required: false,
        description: "Horário fim HH:MM",
      },
      {
        name: "location",
        type: "string",
        required: false,
        description: "Local",
      },
    ],
  },
  {
    name: "requestSwap",
    description: "Solicitar troca de dia de guarda",
    category: "calendar",
    params: [
      {
        name: "date",
        type: "date",
        required: true,
        description: "Data que quer trocar YYYY-MM-DD",
      },
      {
        name: "reason",
        type: "string",
        required: false,
        description: "Motivo",
      },
    ],
  },
  {
    name: "createAgreement",
    description: "Criar acordo/regra entre os pais",
    category: "agreements",
    params: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Título do acordo",
      },
      {
        name: "description",
        type: "string",
        required: true,
        description: "Descrição",
      },
      {
        name: "category",
        type: "string",
        required: false,
        description: "Categoria: principle, value, rule, boundary, routine",
      },
    ],
  },
];

export function getActionsForPrompt(): string {
  return AI_ACTIONS.map(
    (a) =>
      `- ${a.name}: ${a.description}\n  Params: ${a.params
        .map(
          (p) =>
            `${p.name}(${p.type}${p.required ? "*" : ""}): ${p.description}`
        )
        .join(", ")}`
  ).join("\n");
}

/**
 * Compact version of getActionsForPrompt — ~40% smaller token footprint.
 * Uses abbreviated format: action(param1*, param2) instead of verbose descriptions.
 */
export function getActionsForPromptCompact(): string {
  return AI_ACTIONS.map((a) => {
    const params = a.params
      .map((p) => `${p.name}:${p.type}${p.required ? "*" : ""}`)
      .join(", ");
    return `${a.name}(${params}) — ${a.description}`;
  }).join("\n");
}
