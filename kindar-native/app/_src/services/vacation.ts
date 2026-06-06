/**
 * Vacation Service — cria períodos de FÉRIAS como custody_events com
 * `custody_type='vacation'`.
 *
 * # Por que existe (Bug Amanda 2026-05-14)
 *
 * Antes desta camada, usuárias tentando cadastrar férias do filho caíam
 * no fluxo "Novo Evento" (events table, eventos sociais) e a férias
 * NUNCA sobrepunha a escala regular. Resultado: criavam "Férias do Bê
 * 10-25/jul" mas o calendário continuava mostrando a escala normal
 * naqueles dias, e o dashboard de próxima troca ignorava as férias.
 *
 * Férias é período de CUSTÓDIA — sobrepõe a escala regular. O Kindar já
 * tem `custody_type='vacation'` no enum desde a migration 00001, e a
 * migration 00082 elevou vacation pra prio 2 no `custody_resolved` view
 * (antes era 3 = igual regular, inerte).
 *
 * # Hierarquia de prioridade
 *
 *   swap (1) > vacation/exception (2) > regular/holiday/special (3)
 *
 * Vacation overrides regular mas NÃO overrides swap aprovado pra um dia
 * dentro do range. Coparentes podem trocar dias específicos mesmo dentro
 * de férias planejadas (UX explícita: o swap-request fluxo é separado).
 *
 * # Constraints / Trigger / RLS
 *
 * Inserir vacation em `custody_events` segue todas as defesas da
 * migration 00079:
 *   - Trigger `custody_events_prevent_overlap` rejeita vacation
 *     sobreposta a outra vacation do mesmo (group, child).
 *   - EXCLUDE constraint daterange faz double-check.
 *   - vacation NÃO conflita com regular (tipos diferentes) — view
 *     resolve qual ganha pelo prio.
 *
 * # Quem chama
 *
 * - Native: `/calendario/ferias.tsx` (esta UI)
 * - PWA (futuro): paridade em src/actions/vacation.ts ou
 *   src/lib/services/vacation.ts
 * - AI Tool (futuro): create_vacation_period tool em src/lib/ai/tools.ts
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export interface VacationParams {
  groupId: string;
  /** UUID da criança. NULL = férias da família inteira (todas as crianças). */
  childId: string | null;
  /** UUID do coparente responsável durante o período. OBRIGATÓRIO — férias
   *  sem responsável não faz sentido (alguém PRECISA estar com a criança). */
  responsibleUserId: string;
  /** ISO YYYY-MM-DD — primeiro dia das férias. */
  startDate: string;
  /** ISO YYYY-MM-DD — último dia das férias (inclusivo). */
  endDate: string;
  /** Anotação opcional. Ex: "Viagem pra Caraguá", "Acampamento". */
  notes?: string;
  /** UUID do user que criou o registro (auditoria). */
  createdBy: string;
}

export async function createVacationPeriod(params: VacationParams) {
  if (!params.responsibleUserId) {
    return { success: false, error: 'Escolha quem está com a criança nas férias' as const };
  }
  if (params.endDate < params.startDate) {
    return { success: false, error: 'Data final deve ser depois da inicial' as const };
  }

  // Sanity: NÃO permitir vacation com mais de 90 dias. Provavelmente
  // erro de digitação — férias longas (> 3 meses) são raras e podem
  // sempre ser quebradas em dois registros.
  const start = new Date(params.startDate + 'T12:00:00');
  const end = new Date(params.endDate + 'T12:00:00');
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days > 90) {
    return { success: false, error: 'Período muito longo (máx 90 dias). Quebre em vários registros se necessário.' as const };
  }

  // "Família" (childId null) = férias de TODAS as crianças. Os consumidores de
  // custódia (custody-resolve.ts, view custody_resolved, useDashboard/useCalendar)
  // resolvem POR child_id — uma linha com child_id NULL não sobrepõe a escala de
  // NENHUMA criança (vira no-op silencioso) E viola o NOT NULL da coluna. Então
  // expandimos: 1 linha por criança do grupo. Bug Henrique 2026-06-06.
  let targetChildIds: string[];
  if (params.childId == null) {
    const { data: kids } = await supabase
      .from('children')
      .select('id')
      .eq('group_id', params.groupId);
    targetChildIds = (kids ?? []).map((k) => k.id as string);
    if (targetChildIds.length === 0) {
      return { success: false, error: 'Cadastre uma criança antes de marcar férias.' as const };
    }
  } else {
    targetChildIds = [params.childId];
  }

  let result: Awaited<ReturnType<typeof safeWrite>> = { success: true };
  for (const cid of targetChildIds) {
    result = await safeWrite({
      table: 'custody_events',
      operation: 'insert',
      payload: {
        group_id: params.groupId,
        child_id: cid,
        custody_type: 'vacation',
        responsible_user_id: params.responsibleUserId,
        start_date: params.startDate,
        end_date: params.endDate,
        notes: params.notes?.trim() || null,
        // created_by não é coluna padrão de custody_events; auditoria via created_at + responsible.
      },
    });
    if (!result.success) break; // aborta no primeiro erro (ex.: overlap 23505)
  }

  if (result.success && !result.queued) {
    // Notifica coparentes via PWA endpoint /api/native/notify.
    // Fire-and-forget — não bloqueia a UI.
    let childName: string | null = null;
    if (params.childId) {
      const { data: child } = await supabase
        .from('children')
        .select('full_name')
        .eq('id', params.childId)
        .maybeSingle();
      childName = child?.full_name?.split(' ')[0] ?? null;
    }
    const startLabel = new Date(params.startDate + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short',
    });
    const endLabel = new Date(params.endDate + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short',
    });
    notifyAction('vacation_created', params.groupId, {
      childName,
      startLabel,
      endLabel,
      days,
    });
  }

  return result;
}

/** Lista as férias futuras pra esse grupo. Usada pra mostrar "Próximas
 *  férias" no calendário/dashboard. */
export async function listUpcomingVacations(groupId: string, limit = 5) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('custody_events')
    .select('id, child_id, responsible_user_id, start_date, end_date, notes, created_at, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)')
    .eq('group_id', groupId)
    .eq('custody_type', 'vacation')
    .gte('end_date', today)
    .order('start_date', { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return data.map((row: any) => ({
    id: row.id as string,
    childId: row.child_id as string | null,
    childName: row.children?.full_name?.split(' ').slice(0, 2).join(' ') ?? null,
    responsibleUserId: row.responsible_user_id as string,
    responsibleName: row.profiles?.full_name?.split(' ')[0] ?? '',
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
  /* eslint-enable */
}

export async function deleteVacationPeriod(vacationId: string) {
  return await safeWrite({
    table: 'custody_events',
    operation: 'delete',
    payload: { id: vacationId },
  });
}
