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
export type DocType = "school_calendar" | "health_visit" | "custody_routine" | "routine_setup" | "unknown_document";

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

/** Membro do grupo pro playbook resolver pessoas citadas na narrativa
 *  ("a Fernanda", "EU") — NUNCA se inventa um responsável fora desta lista. */
export interface GroupMemberRef {
  id: string;
  name: string;
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
  /** Membros do grupo (playbook de guarda/rotina resolve pessoas citadas).
   *  Opcional: escolar/saúde não usam; canais threadam p/ custody_routine. */
  members?: GroupMemberRef[];
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

/* ---- Saúde (playbook health_visit) ---------------------------------------
 * TRANSPORTADOR, nunca assistente: dose/frequência SÓ quando explícitas na
 * receita/fala do médico; senão null → materializa "Conforme prescrição" +
 * lowConfidenceFields. Orientação/diagnóstico = citação literal. Datas relativas
 * já resolvidas p/ absolutas (ISO) pelo parse. Ver brain-health-playbook-design. */

/** A consulta em si → medical_appointments. */
export interface AppointmentSpec {
  childId: string | null;
  /** Título curto ("Consulta — Pediatria" / "Consulta de rotina"). */
  title: string;
  appointmentType: "rotina" | "emergencia" | "retorno" | "exame";
  date: string; // YYYY-MM-DD (data da consulta)
  timeStart?: string | null; // "HH:MM" se dito
  /** Nome do profissional (citação; A0 não força profissional cadastrado). */
  professionalName?: string | null;
  specialty?: string | null;
  location?: string | null;
  /** Resumo = CITAÇÃO do que o médico disse (avaliação/orientação). Nunca
   *  interpretação clínica do Kindar. */
  summary?: string | null;
  lowConfidenceFields?: string[];
}

/** Diagnóstico/avaliação → illness_episodes (opcional; só se houve avaliação). */
export interface EpisodeSpec {
  childId: string | null;
  title: string; // ex "Alergia leve"
  diagnosis?: string | null; // citação
  symptoms?: string[];
  severity?: "leve" | "moderado" | "grave" | null;
  startDate: string; // YYYY-MM-DD
}

/** Medicação citada → active_medications. Dose/frequência null quando o médico
 *  não deu explícito (materializa "Conforme prescrição"). */
export interface MedicationSpec {
  childId: string | null;
  name: string;
  dosage: string | null; // "500 mg" | null
  frequency: string | null; // "a cada 8h" | null (CITAÇÃO, não cálculo)
  /** Intervalo em horas SE a frequência for numérica clara (8/12/24). Só INFORMA
   *  o registro — NÃO agenda lembrete de dose (transportador). */
  frequencyHours?: number | null;
  careType: "medication" | "treatment" | "procedure";
  /** Duração citada em dias (p/ computar endDate). null se não dita. */
  durationDays?: number | null;
  startDate: string; // YYYY-MM-DD (default = data da consulta)
  endDate?: string | null; // YYYY-MM-DD (start + duração) se duração explícita
  prescribedBy?: string | null; // médico (citação)
  reason?: string | null; // "para otite" — citação
  lowConfidenceFields?: string[];
}

/** Retorno → medical_appointments.return_date + evento no calendário. */
export interface FollowUpSpec {
  date: string; // YYYY-MM-DD (relativo já resolvido contra a data da consulta)
  notes?: string | null; // citação ("retorno em 1 mês")
}

/** Exame solicitado. A0 não tem tabela dedicada de exames → vira citação no
 *  resumo da consulta; a tabela própria é fase futura. */
export interface ExamRequestSpec {
  name: string; // "hemograma"
  notes?: string | null;
}

/** Plano de uma consulta: uma consulta, um episódio opcional, N medicações,
 *  retorno opcional, exames citados. Toda a cena de UMA criança. */
export interface HealthVisitPlan {
  appointment: AppointmentSpec;
  episode?: EpisodeSpec | null;
  medications?: MedicationSpec[];
  followUp?: FollowUpSpec | null;
  examRequests?: ExamRequestSpec[];
}

/* ---- Guarda & Rotina (docType 'custody_routine') ---- */

/** Pessoa citada na narrativa. `memberId` resolvido contra os membros do
 *  grupo; null = pessoa EXTERNA ("a avó") — permitida só em leva/busca, e
 *  mesmo assim como rótulo humano (a responsabilidade no app fica com um
 *  membro). NUNCA se inventa um membro. */
export interface PersonRef {
  memberId: string | null;
  label: string;
}

/** Exceção pontual de guarda ("ele fica comigo de 8 a 12"). Governança:
 *  notifica-e-vale + Desfazer (decisão do dono 02/jul). */
export interface CustodyExceptionItem {
  kind: "custody_exception";
  childIds: string[];
  startDate: string; // YYYY-MM-DD
  endDate: string;
  responsible: PersonRef; // sempre membro (memberId != null)
  reason: string | null;
}

/** Férias/recesso com um responsável. childIds null = família toda. */
export interface VacationItem {
  kind: "vacation";
  childIds: string[] | null;
  startDate: string;
  endDate: string;
  responsible: PersonRef; // sempre membro
  notes: string | null;
}

/** Proposta de troca de dia — cai no fluxo BILATERAL existente (swap.ts):
 *  o outro responsável aprova antes de materializar. */
export interface SwapProposalItem {
  kind: "swap_proposal";
  childIds: string[];
  originalDate: string;
  proposedDate: string | null;
  counterpart: PersonRef; // membro ≠ narrador
  reason: string | null;
}

/** Troca pontual de leva/busca num dia ("quinta quem busca é a avó").
 *  Pessoa externa vira rótulo; o responsável no app é o membro que combinou. */
export interface LegOverrideItem {
  kind: "leg_override";
  childIds: string[];
  date: string;
  leg: "dropoff" | "pickup";
  responsible: PersonRef; // memberId null = externo (rótulo)
  time: string | null; // "HH:MM"
  note: string | null;
}

/** Mudança PERMANENTE do padrão semanal ("a partir de agora segunda quem
 *  leva é o pai"). Governança: PROPOSTA — só materializa com OK do outro. */
export interface SlotChangeItem {
  kind: "slot_change";
  childIds: string[];
  weekday: number; // 0=Dom .. 6=Sáb
  leg: "dropoff" | "pickup";
  responsible: PersonRef; // sempre membro
  time: string | null;
}

export type CustodyRoutineItem =
  | CustodyExceptionItem
  | VacationItem
  | SwapProposalItem
  | LegOverrideItem
  | SlotChangeItem;

/** Plano de guarda/rotina: N itens extraídos de UMA narrativa. */
export interface CustodyRoutinePlan {
  items: CustodyRoutineItem[];
}

/** Plano declarativo: o playbook descreve, o service materializa. */
export interface MaterializationPlan {
  docType: DocType;
  confirmation: ConfirmationMode;
  activities?: ActivitySpec[];
  notes?: NoteSpec[];
  /** Plano de saúde (docType 'health_visit'). Dispatch por docType decide qual
   *  materializar; não colide com activities (escolar). */
  health?: HealthVisitPlan;
  /** Plano de guarda/rotina (docType 'custody_routine'). */
  custody?: CustodyRoutinePlan;
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
  /** Extração a partir de TEXTO (assistente/áudio transcrito) — mesmo schema
   *  da visão, o `parse` é o mesmo. Ausente = playbook só aceita imagem. */
  textExtractionPrompt?: { system: string; user: string };
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
  // intakeId é opcional: quando a ambiguidade é detectada ANTES de criar o
  // intake (createAndAnalyze*), não há id ainda — nenhum caller consome o id
  // (todos usam só `options`). Ver evita órfão preso em `analyzing`/`uploaded`.
  | { kind: "needs_child_selection"; intakeId?: string; options: BrainChild[] }
  | { kind: "unknown_document"; intakeId: string; message: string }
  | { kind: "executed"; intakeId: string; createdCount: number }
  | { kind: "already_processing"; intakeId: string }
  | { kind: "stale_plan"; intakeId: string; message: string } // contexto mudou → reanálise
  | { kind: "duplicate"; intakeId: string; priorIntakeId: string; message: string }
  | { kind: "error"; message: string };
