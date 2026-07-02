/* ------------------------------------------------------------------ */
/* brain-memory.ts — carga do snapshot da Memória da Família (M1)       */
/*                                                                      */
/* I/O fino e ESCOPADO por playbook: consultas mínimas, sempre dentro   */
/* do grupo (RLS-friendly), devolvendo o FamilyMemorySnapshot que o     */
/* detector puro (family-memory.ts) transforma em findings factuais.    */
/* Chamado SÓ com FEATURE_BRAIN_FAMILY_MEMORY ligada; qualquer erro é   */
/* non-fatal (memória enriquece, nunca bloqueia o preview).             */
/* ------------------------------------------------------------------ */

import type { createClient } from "@/lib/supabase/server";
import type { DocType, MaterializationPlan } from "@/lib/ai/brain/types";
import type { FamilyMemorySnapshot } from "@/lib/ai/brain/family-memory";
import { timestamptzToBrazilDateKey } from "@/lib/calendar-utils";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

const FOLLOWUP_WINDOW_DAYS = 14;

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Segunda e domingo (ISO) da semana de uma data. */
function isoWeekRange(iso: string): { mon: string; sun: string } {
  const d = new Date(iso + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=dom
  const toMon = dow === 0 ? -6 : 1 - dow;
  return { mon: shiftDays(iso, toMon), sun: shiftDays(iso, toMon + 6) };
}

function monthRange(iso: string): { start: string; end: string } {
  const start = `${iso.slice(0, 7)}-01`;
  const d = new Date(start + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0); // último dia do mês
  return { start, end: d.toISOString().slice(0, 10) };
}

/** "1234.5" → "1.234,50" (mesmo formato BR das prévias de despesa). */
function formatBrl(total: number): string {
  return total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Busca o snapshot relevante pro (docType, plano). Campos ausentes = sem
 * contexto (o detector não emite nada). Nunca lança: erro → snapshot vazio
 * parcial (cada bloco é independente).
 */
export async function loadFamilyMemory(
  supabase: SupabaseServer,
  groupId: string,
  docType: DocType,
  plan: MaterializationPlan,
): Promise<FamilyMemorySnapshot> {
  const memory: FamilyMemorySnapshot = {};

  if (docType === "health_visit") {
    const visit = plan.health?.appointment;
    const childId = visit?.childId ?? null;
    if (visit?.date && childId) {
      try {
        const { data: last } = await supabase
          .from("medical_appointments")
          .select("id, child_id, title, appointment_date")
          .eq("group_id", groupId)
          .eq("child_id", childId)
          .lt("appointment_date", `${visit.date}T00:00:00`)
          .order("appointment_date", { ascending: false })
          .limit(1);
        const row = last?.[0];
        if (row) {
          memory.lastVisit = {
            childId,
            date: timestamptzToBrazilDateKey(row.appointment_date as string),
            title: (row.title as string) ?? "",
            // M2 resolve o profissional (professional_id → nome); M1 fica factual sem ele.
            professional: null,
            recordId: row.id as string,
          };
        }
      } catch {
        // non-fatal
      }
      try {
        const { data: ret } = await supabase
          .from("medical_appointments")
          .select("id, child_id, return_date")
          .eq("group_id", groupId)
          .eq("child_id", childId)
          .not("return_date", "is", null)
          .gte("return_date", shiftDays(visit.date, -FOLLOWUP_WINDOW_DAYS))
          .lte("return_date", shiftDays(visit.date, FOLLOWUP_WINDOW_DAYS))
          .order("return_date", { ascending: true })
          .limit(1);
        const row = ret?.[0];
        if (row) {
          memory.pendingReturn = {
            childId,
            returnDate: row.return_date as string,
            recordId: row.id as string,
          };
        }
      } catch {
        // non-fatal
      }
    }
  }

  if (docType === "expense") {
    const items = plan.expense?.items ?? [];
    const byCategory = new Map<string, string>(); // category → expenseDate de referência
    for (const it of items) {
      if (!byCategory.has(it.category)) byCategory.set(it.category, it.expenseDate);
    }
    const aggs: FamilyMemorySnapshot["expenseMonth"] = [];
    for (const [category, refDate] of byCategory) {
      try {
        const { start, end } = monthRange(refDate);
        const { data: rows } = await supabase
          .from("expenses")
          .select("amount")
          .eq("group_id", groupId)
          .eq("category", category)
          .gte("expense_date", start)
          .lte("expense_date", end);
        if (rows && rows.length >= 1) {
          const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
          aggs.push({ category, count: rows.length, totalFormatted: formatBrl(total) });
        }
      } catch {
        // non-fatal
      }
    }
    if (aggs.length > 0) memory.expenseMonth = aggs;
  }

  if (docType === "event_invite") {
    const invite = plan.invite;
    if (invite?.eventDate && invite.childId) {
      try {
        const { mon, sun } = isoWeekRange(invite.eventDate);
        const { count } = await supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("child_id", invite.childId)
          .eq("status", "active")
          .gte("event_date", mon)
          .lte("event_date", sun);
        if (typeof count === "number" && count >= 2) {
          memory.busyWeek = { childId: invite.childId, count };
        }
      } catch {
        // non-fatal
      }
    }
  }

  return memory;
}
