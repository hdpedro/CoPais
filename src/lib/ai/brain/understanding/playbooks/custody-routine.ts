/* ------------------------------------------------------------------ */
/* custody-routine.ts — playbook de NARRATIVA de guarda & rotina        */
/*                                                                      */
/* "O responsável conta uma história em tom natural e o Brain extrai    */
/* tudo" (visão do dono, 02/jul). Uma narrativa vira N itens de         */
/* logística: exceção de guarda, férias, proposta de troca, leva/busca  */
/* pontual, mudança permanente do padrão. TRANSPORTADOR de logística:   */
/*  - pessoas resolvem contra os MEMBROS do grupo (ctx.members); pessoa */
/*    externa ("a avó") NUNCA vira membro inventado — em leva/busca é   */
/*    rótulo humano (responsável no app = o narrador, que combinou);    */
/*    em GUARDA (exceção/férias/troca) membro é obrigatório → descarta. */
/*  - datas relativas já chegam ISO (prompt resolve contra hoje); aqui  */
/*    valida-se ISO real, ranges e horizonte.                           */
/*  - PERMANENTE nunca por presunção: slot_change só existe se o modelo */
/*    marcou (prompt exige marcador explícito); a governança dele é     */
/*    PROPOSTA com OK do outro (decisão do dono).                       */
/* Ver C:\Users\henri\.claude\plans\brain-custody-routine-design.md.     */
/* ------------------------------------------------------------------ */

import { isParseableIsoDate } from "../../confidence";
import type {
  CustodyRoutineItem,
  CustodyRoutinePlan,
  GroupMemberRef,
  MaterializationPlan,
  PersonRef,
  Playbook,
  PlaybookContext,
} from "../../types";

export const CUSTODY_ROUTINE_PLAYBOOK_VERSION = 1;
export const CUSTODY_ROUTINE_POLICY_VERSION = 1;

const LEGS = ["dropoff", "pickup"] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Horizonte máx. de um item (1 ano + folga) — narrativa não agenda 2027². */
const HORIZON_DAYS = 370;
const MAX_ITEMS = 10;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function cap(s: string | null, max: number): string | null {
  if (s === null) return null;
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** ISO validada e real; null caso contrário (nunca chuta formato). */
function isoOrNull(raw: unknown): string | null {
  const s = asString(raw);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isParseableIsoDate(iso) ? iso : null;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Normaliza pra comparação de nomes (sem acento/caixa, espaços colapsados). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match conservador: rótulo casa um membro se for exatamente o nome, o
 *  primeiro nome, ou uma palavra inteira do nome — e SÓ SE exatamente 1
 *  membro bate (ambíguo → não resolve). */
function matchMember(label: string, members: readonly GroupMemberRef[]): GroupMemberRef | null {
  const l = norm(label);
  if (!l) return null;
  const hits = members.filter((m) => {
    const n = norm(m.name);
    if (n === l) return true;
    const words = n.split(" ");
    if (words[0] === l) return true;
    return words.includes(l);
  });
  return hits.length === 1 ? hits[0] : null;
}

/** Resolve uma pessoa citada: "EU" → narrador; nome → membro (se 1 bate);
 *  senão pessoa EXTERNA (memberId null, rótulo preservado). */
export function resolvePersonRef(raw: string, ctx: PlaybookContext): PersonRef {
  const label = raw.trim();
  if (norm(label) === "eu") {
    const me = (ctx.members ?? []).find((m) => m.id === ctx.userId);
    return { memberId: ctx.userId, label: me?.name ?? "você" };
  }
  const member = matchMember(label, ctx.members ?? []);
  return member ? { memberId: member.id, label: member.name } : { memberId: null, label: cap(label, 80) ?? label };
}

/** Resolve nomes de crianças → ids. null/[] na narrativa = todas as crianças
 *  do grupo (o preview mostra por extenso). Nome desconhecido é ignorado;
 *  se nenhum resolver e o grupo tem várias, devolve todas (conservador:
 *  melhor mostrar "para Otto e Martim" no preview do que inventar uma). */
export function resolveChildIds(rawChildren: unknown, ctx: PlaybookContext): string[] {
  const all = ctx.children.map((c) => c.id);
  if (!Array.isArray(rawChildren) || rawChildren.length === 0) return all;
  const resolved: string[] = [];
  for (const raw of rawChildren) {
    const label = asString(raw);
    if (!label) continue;
    const l = norm(label);
    const hits = ctx.children.filter((c) => {
      const n = norm(c.name);
      return n === l || n.split(" ")[0] === l || n.split(" ").includes(l);
    });
    if (hits.length === 1 && !resolved.includes(hits[0].id)) resolved.push(hits[0].id);
  }
  return resolved.length > 0 ? resolved : all;
}

export interface CustodyRoutineData {
  items: CustodyRoutineItem[];
  /** Itens descartados por validação (telemetria/preview honesto). */
  skipped: number;
}

export const custodyRoutinePlaybook: Playbook<CustodyRoutineData> = {
  docType: "custody_routine",
  // A confirmação do INTAKE é single (quem narrou confirma o que entendemos);
  // a governança POR ITEM (bilateral em swap/slot_change) vive na
  // materialização — ver design doc, decisão "notifica-e-vale × OK-do-outro".
  confirmation: "single",
  playbookVersion: CUSTODY_ROUTINE_PLAYBOOK_VERSION,
  policyVersion: CUSTODY_ROUTINE_POLICY_VERSION,
  extractionPrompt: { system: "", user: "" }, // narrativa é TEXTO/ÁUDIO; foto não se aplica (injetado no registry)

  parse(payload: unknown, ctx: PlaybookContext): CustodyRoutineData | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    if (p.recognized_as !== "custody_routine") return null;
    if (!Array.isArray(p.items)) return null;

    const maxDate = addDaysIso(ctx.today, HORIZON_DAYS);
    const items: CustodyRoutineItem[] = [];
    let skipped = 0;

    for (const raw of p.items.slice(0, MAX_ITEMS * 2)) {
      if (items.length >= MAX_ITEMS) break;
      if (!raw || typeof raw !== "object") {
        skipped++;
        continue;
      }
      const it = raw as Record<string, unknown>;
      const childIds = resolveChildIds(it.children, ctx);

      switch (it.kind) {
        case "custody_exception":
        case "vacation": {
          const startDate = isoOrNull(it.start_date);
          const endDate = isoOrNull(it.end_date) ?? startDate;
          const responsible = asString(it.responsible) ? resolvePersonRef(it.responsible as string, ctx) : null;
          // Guarda exige MEMBRO; range válido dentro do horizonte; passado puro não agenda.
          if (
            !startDate ||
            !endDate ||
            startDate > endDate ||
            endDate < ctx.today ||
            startDate > maxDate ||
            !responsible ||
            responsible.memberId === null
          ) {
            skipped++;
            break;
          }
          if (it.kind === "custody_exception") {
            items.push({
              kind: "custody_exception",
              childIds,
              startDate,
              endDate,
              responsible,
              reason: cap(asString(it.reason), 200),
            });
          } else {
            items.push({
              kind: "vacation",
              // vacation família-toda materializa child_id null → preserva a
              // semântica "todas" quando a narrativa não especificou.
              childIds: Array.isArray(it.children) && it.children.length > 0 ? childIds : null,
              startDate,
              endDate,
              responsible,
              notes: cap(asString(it.notes), 200),
            });
          }
          break;
        }
        case "swap_proposal": {
          const originalDate = isoOrNull(it.original_date);
          const proposedDate = isoOrNull(it.proposed_date);
          const counterpart = asString(it.counterpart) ? resolvePersonRef(it.counterpart as string, ctx) : null;
          // Troca é com OUTRO membro (fluxo bilateral existente).
          if (
            !originalDate ||
            originalDate < ctx.today ||
            originalDate > maxDate ||
            (proposedDate !== null && (proposedDate < ctx.today || proposedDate > maxDate)) ||
            !counterpart ||
            counterpart.memberId === null ||
            counterpart.memberId === ctx.userId
          ) {
            skipped++;
            break;
          }
          items.push({
            kind: "swap_proposal",
            childIds,
            originalDate,
            proposedDate,
            counterpart,
            reason: cap(asString(it.reason), 200),
          });
          break;
        }
        case "leg_override": {
          const date = isoOrNull(it.date);
          const leg = asString(it.leg);
          const timeRaw = asString(it.time);
          const responsible = asString(it.responsible) ? resolvePersonRef(it.responsible as string, ctx) : null;
          if (
            !date ||
            date < ctx.today ||
            date > maxDate ||
            !leg ||
            !(LEGS as readonly string[]).includes(leg) ||
            !responsible
          ) {
            skipped++;
            break;
          }
          items.push({
            kind: "leg_override",
            childIds,
            date,
            leg: leg as "dropoff" | "pickup",
            responsible, // externo permitido (memberId null → rótulo)
            time: timeRaw && TIME_RE.test(timeRaw) ? timeRaw : null,
            note: cap(asString(it.note), 200),
          });
          break;
        }
        case "slot_change": {
          const weekday = it.weekday;
          const leg = asString(it.leg);
          const timeRaw = asString(it.time);
          const responsible = asString(it.responsible) ? resolvePersonRef(it.responsible as string, ctx) : null;
          // Permanente: membro obrigatório + weekday válido. (A permanência em
          // si é garantida pelo prompt — o modelo só emite slot_change com
          // marcador explícito; sem marcador vira leg_override.)
          if (
            typeof weekday !== "number" ||
            !Number.isInteger(weekday) ||
            weekday < 0 ||
            weekday > 6 ||
            !leg ||
            !(LEGS as readonly string[]).includes(leg) ||
            !responsible ||
            responsible.memberId === null
          ) {
            skipped++;
            break;
          }
          items.push({
            kind: "slot_change",
            childIds,
            weekday,
            leg: leg as "dropoff" | "pickup",
            responsible,
            time: timeRaw && TIME_RE.test(timeRaw) ? timeRaw : null,
          });
          break;
        }
        default:
          skipped++;
      }
    }

    return items.length > 0 ? { items, skipped } : null;
  },

  plan(data: CustodyRoutineData): MaterializationPlan {
    const custody: CustodyRoutinePlan = { items: data.items };
    return {
      docType: "custody_routine",
      confirmation: "single",
      activities: [],
      custody,
      collabRecordType: "custody_event",
    };
  },
};
