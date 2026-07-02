/* ------------------------------------------------------------------ */
/* event-invite.ts — playbook de CONVITES (foto/PDF/texto → evento)     */
/*                                                                      */
/* Convite de aniversário/festa/reunião/apresentação/campeonato vira UM */
/* evento do calendário. PURO (sem I/O): parse valida/normaliza sem     */
/* inventar (SEM DATA legível o convite não vira evento — pergunta      */
/* clarificadora), compõe a descrição final (tema/traje/levar + linha   */
/* de RSVP humana) e o plan descreve. Materialização (fatia C2)         */
/* escreve na tabela `events` existente, SEM responsável fixo (como o   */
/* formulário faz — convite não diz quem leva).                         */
/* ------------------------------------------------------------------ */

import type {
  EventInvitePlan,
  MaterializationPlan,
  PlaybookContext,
} from "../../types";

/** Evento até ~1 ano pra frente; convite "atrasado" só alguns dias. */
const FUTURE_HORIZON_DAYS = 370;
const PAST_HORIZON_DAYS = 7;
const MAX_MULTIDAY_SPAN = 14;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T12:00:00Z").getTime();
  const b = new Date(bIso + "T12:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Nome citado → criança do grupo (palavra inteira; ambíguo → null). */
function resolveChildId(name: unknown, ctx: PlaybookContext): string | null {
  if (typeof name !== "string" || !name.trim()) return ctx.resolvedChildId;
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const n = norm(name);
  const hits = ctx.children.filter((c) => {
    const first = norm((c.name || "").split(" ")[0]);
    return first.length >= 2 && new RegExp(`(^|[^a-z0-9])${first}([^a-z0-9]|$)`).test(n);
  });
  return hits.length === 1 ? hits[0].id : ctx.resolvedChildId;
}

function cleanStr(raw: unknown, max: number): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, max) : null;
}

function isoOrNull(raw: unknown): string | null {
  return typeof raw === "string" && ISO_DATE.test(raw) ? raw : null;
}

function hhmmOrNull(raw: unknown): string | null {
  return typeof raw === "string" && HHMM.test(raw) ? raw : null;
}

interface RawPayload {
  recognized_as?: unknown;
  title?: unknown;
  eventDate?: unknown;
  endDate?: unknown;
  timeStart?: unknown;
  timeEnd?: unknown;
  location?: unknown;
  childName?: unknown;
  theme?: unknown;
  rsvpDeadline?: unknown;
  rsvpContact?: unknown;
}

export const eventInvitePlaybook = {
  docType: "event_invite" as const,
  confirmation: "single" as const,
  playbookVersion: 1,
  policyVersion: 1,

  parse(payload: unknown, ctx: PlaybookContext): EventInvitePlan | null {
    const raw = payload as RawPayload | null;
    if (!raw || raw.recognized_as !== "event_invite") return null;

    // SEM DATA legível o convite não vira evento (nunca chuta).
    const eventDate = isoOrNull(raw.eventDate);
    if (!eventDate) return null;
    const delta = daysBetween(ctx.today, eventDate);
    if (delta > FUTURE_HORIZON_DAYS || delta < -PAST_HORIZON_DAYS) return null;

    const title = cleanStr(raw.title, 120) ?? "Convite";

    // Multi-dia: endDate > eventDate e span razoável; senão evento de 1 dia.
    let endDate = isoOrNull(raw.endDate);
    if (endDate && (daysBetween(eventDate, endDate) <= 0 || daysBetween(eventDate, endDate) > MAX_MULTIDAY_SPAN)) {
      endDate = null;
    }

    const timeStart = hhmmOrNull(raw.timeStart);
    const timeEnd = timeStart ? hhmmOrNull(raw.timeEnd) : null;

    // RSVP no passado do evento (faz sentido) e não antes de hoje-7.
    let rsvpDeadline = isoOrNull(raw.rsvpDeadline);
    if (rsvpDeadline && (daysBetween(rsvpDeadline, eventDate) < 0 || daysBetween(ctx.today, rsvpDeadline) < -PAST_HORIZON_DAYS)) {
      rsvpDeadline = null;
    }

    // Descrição final composta (transportador): tema/traje + linha de RSVP.
    const theme = cleanStr(raw.theme, 200);
    const rsvpContact = cleanStr(raw.rsvpContact, 120);
    const descLines: string[] = [];
    if (theme) descLines.push(theme);
    if (rsvpDeadline || rsvpContact) {
      let rsvp = "Confirmar presença";
      if (rsvpDeadline) rsvp += ` até ${ddmm(rsvpDeadline)}`;
      if (rsvpContact) rsvp += ` ${rsvpContact.startsWith("com") ? rsvpContact : `com ${rsvpContact}`}`;
      descLines.push(rsvp + ".");
    }

    return {
      title,
      description: descLines.length > 0 ? descLines.join("\n") : null,
      eventDate,
      endDate,
      timeStart,
      timeEnd,
      location: cleanStr(raw.location, 200),
      childId: resolveChildId(raw.childName, ctx),
      allDay: timeStart === null,
      rsvpDeadline,
    };
  },

  plan(data: EventInvitePlan): MaterializationPlan {
    return {
      docType: "event_invite",
      confirmation: "single",
      activities: [],
      invite: data,
      collabRecordType: "event",
    };
  },
};
