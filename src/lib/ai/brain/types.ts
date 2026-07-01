/* ------------------------------------------------------------------ */
/* Kindar Brain — contratos do pipeline (Family Inbox)                  */
/*                                                                      */
/* Toda entrada percorre: 1.INTAKE → 2.UNDERSTANDING → 3.IMPACT →       */
/* 4.PRIORITIZE → 5.PLAN → 6.CONFIRM → 7.EXECUTE → 8.COORDINATE.        */
/*                                                                      */
/* Os estágios 2-5 são PUROS (recebem snapshots, devolvem dados) e      */
/* vivem em src/lib/ai/brain/*. Os estágios 1/6/7/8 (I/O, storage,      */
/* push) vivem em src/lib/services/brain.ts (Regra 11). Este arquivo só */
/* define os tipos compartilhados — sem I/O, sem dependências de banco. */
/* ------------------------------------------------------------------ */

/** Canais de entrada. */
export type IntakeChannel = "pwa" | "native" | "whatsapp";

/** Tipos de entrada (Épico A: document; áudio em B; resto previsto). */
export type IntakeSource = "document" | "audio" | "message" | "command";

/** Tipo de documento resolvido pelo classificador. `unknown_document`
 *  dispara a pergunta de esclarecimento (nunca vira recibo por default). */
export type DocType = "school_calendar" | "routine_setup" | "unknown_document";

/** Estados do intake — espelha o CHECK da migration 00126. */
export type IntakeStatus =
  | "uploaded"
  | "analyzing"
  | "analyzed"
  | "awaiting_confirmation"
  | "executing"
  | "executed"
  | "failed"
  | "expired"
  | "canceled"
  | "undone";

/** Modo de confirmação declarado pelo playbook. */
export type ConfirmationMode = "single" | "bilateral";

/* ---- Confiança ---- */

export type ConfidenceLevel = "high" | "medium" | "low";

/** Confiança por campo, já composta (LLM + validações determinísticas). */
export interface FieldConfidence {
  score: number; // 0..1, JÁ composto — não é o autorrelato cru do LLM
  level: ConfidenceLevel;
}

/* ---- Understanding ---- */

/** Criança referenciada no contexto do grupo. */
export interface BrainChild {
  id: string;
  name: string;
  birthDate?: string;
}

/** Contexto que os estágios puros recebem (snapshot, sem I/O). */
export interface PlaybookContext {
  groupId: string;
  userId: string;
  channel: IntakeChannel;
  today: string; // YYYY-MM-DD (timezone do grupo já aplicada upstream)
  timezone: string; // IANA, ex: 'America/Sao_Paulo'
  children: BrainChild[];
  resolvedChildId: string | null; // já desambiguado, ou null
  schoolYearAnchor: number; // ano letivo inferido
}

/** Saída do Understanding: o que o classificador+extração entenderam.
 *  `payload` é específico por playbook (validado pelo Playbook.parse). */
export interface ExtractedIntent<P = unknown> {
  docType: DocType;
  classifierConfidence: number; // confiança do classificador (0..1)
  childHint: string | null;
  payload: P;
}

/* ---- Impact ---- */

export type ImpactKind =
  | "same_day"
  | "tight_sequence"
  // adiados (Épico A só usa os 2 acima):
  | "activity_clash"
  | "custody_handoff"
  | "trip_overlap"
  | "post_holiday";

export interface ImpactFinding {
  kind: ImpactKind;
  /** Tom calmo: nunca 'urgent'/vermelho no impacto (Regra 6). */
  severity: "info" | "attention";
  date: string; // YYYY-MM-DD
  childId: string | null;
  /** i18n: chave + vars (sem texto cru). */
  titleKey: string;
  titleVars?: Record<string, unknown>;
  relatedRecordId?: string;
}

/* ---- Prioritization ---- */

export interface Priority {
  /** Mapeia no enum collab_priority. `urgent` adiado no v1. */
  level: "info" | "important" | "urgent";
  delivery: "digest" | "immediate" | "immediate_both";
}

/* ---- Planning (MaterializationPlan) ---- */

/** Regra de lembrete estruturada (correção 4): nada de número mágico. */
export interface ReminderRule {
  type: "previous_day_at_time" | "same_day_at_time" | "minutes_before";
  time?: string; // "HH:MM" para *_at_time
  minutesBefore?: number; // para minutes_before
  timezone: string; // IANA
}

export type ReminderRouting = "auto" | "static" | "by_custody" | "by_dropoff";

/** Spec de uma atividade a materializar (vira child_activities). */
export interface ActivitySpec {
  /** null = criança ainda não resolvida (preview bloqueia até escolher). */
  childId: string | null;
  name: string;
  category: "school" | "sport" | "health" | "art" | "music" | "therapy" | "course" | "other";
  startDate: string; // YYYY-MM-DD
  timeStart?: string | null; // "HH:MM"
  notes?: string | null; // ex: conteúdo da prova
  checklist?: string[]; // ex: materiais a levar
  reminderRule?: ReminderRule;
  reminderRouting?: ReminderRouting;
  /** Matéria/disciplina (ex: "Matemática") — alimenta o fingerprint
   *  semântico do dedup, separada do `name`/título. */
  subject?: string | null;
  /** Tipo do item (ex: "prova", "trabalho", "entrega") — o fingerprint
   *  distingue prova × trabalho da MESMA matéria no MESMO dia. */
  activityType?: string | null;
  /** Campos com confiança baixa que devem ser revisados antes de confirmar. */
  lowConfidenceFields?: string[];
}

/** Spec de uma nota a materializar. */
export interface NoteSpec {
  childId: string | null;
  title: string;
  body: string;
}

/** Plano declarativo: o playbook descreve, o service materializa. */
export interface MaterializationPlan {
  docType: DocType;
  confirmation: ConfirmationMode;
  activities?: ActivitySpec[];
  notes?: NoteSpec[];
  /** record_type pro fan-out de coordenação (Foundation Collab). */
  collabRecordType?: string;
}

/* ---- Playbook ---- */

/** Um playbook = prompt de extração + parse + plan + summarize. Puro:
 *  não escreve no banco; o service materializa o MaterializationPlan. */
export interface Playbook<P = unknown> {
  docType: DocType;
  confirmation: ConfirmationMode;
  /** Versões pro plan_hash canônico (rastreabilidade da confirmação). */
  playbookVersion: number;
  policyVersion: number;
  extractionPrompt: { system: string; user: string };
  /** Valida/normaliza o payload do classificador. null se irrecuperável. */
  parse(payload: unknown, ctx: PlaybookContext): P | null;
  /** Descreve os registros a criar (declarativo, sem I/O). */
  plan(data: P, ctx: PlaybookContext): MaterializationPlan;
}

/* ---- Resultado do pipeline (preview / execução) ---- */

export interface IntakePreview {
  intakeId: string;
  docType: DocType;
  confirmation: ConfirmationMode;
  plan: MaterializationPlan;
  impacts: ImpactFinding[];
  priority: Priority;
  planHash: string;
  confirmationToken: string;
  needsChildSelection?: boolean;
  childOptions?: BrainChild[];
  /** Quantas provas do documento JÁ estavam no Kindar e foram omitidas do
   *  plano (reenvio parcial do mesmo calendário). >0 → o canal avisa
   *  "X já estavam lá; adiciono só as novas". */
  alreadyPresent?: number;
}

export type IntakeResult =
  | { kind: "preview"; preview: IntakePreview }
  | { kind: "needs_child_selection"; intakeId: string; options: BrainChild[] }
  | { kind: "unknown_document"; intakeId: string; message: string }
  | { kind: "executed"; intakeId: string; createdCount: number }
  | { kind: "already_processing"; intakeId: string }
  | { kind: "stale_plan"; intakeId: string; message: string } // contexto mudou → reanálise
  | { kind: "duplicate"; intakeId: string; priorIntakeId: string; message: string }
  | { kind: "error"; message: string };
