/**
 * useDashboard — Fetches all dashboard data from Supabase.
 * Mirrors the web dashboard page.tsx queries.
 *
 * Note: Supabase joined selects return nested shapes that don't round-trip
 * cleanly through generated types without writing a dozen manual interfaces.
 * Using `any` narrowly inside this file is deliberate — the output contract
 * (DashboardData) is fully typed below and that's what callers see.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import {
  resolveTodayCustody,
  findNextCustodyHandover,
  computeCustodyStreak,
  type CustodyEvent as CustodyEventInput,
} from '../lib/custody-resolve';
import { signChildAvatar } from '../services/children';
import { PARENT_COLORS, getDisplayName } from '../lib/constants';
import { cacheGet, cacheSet, isOnline } from '../services/offline';
import { subscribeToNotifications } from '../services/notifications';
import { withTimeout } from '../lib/with-timeout';
import { reportError } from '../lib/error-reporter';

// Hard ceiling pra todo o ciclo de fetch. Sem isso, uma query do Supabase
// pendurada (TLS travado, token expirado, DNS lento) trava a tela em
// "Carregando..." pra sempre — bug 2026-05-11 reportado pela Aline (Android).
const FETCH_TIMEOUT_MS = 15_000;

interface CustodyChild {
  childFirstName: string;
  responsibleName: string;
  isWithMe: boolean;
  color: string;
}

/** Estado de uma atividade no dia atual. So preenchido para `todayActivities`. */
export type TodayActivityState = 'upcoming' | 'ended-unreported' | 'ended-reported';

interface ActivityItem {
  id: string;
  name: string;
  category: string;
  childName: string;
  childId: string | null;
  timeStr: string;
  location: string;
  state?: TodayActivityState;
}

interface ChildHealthSummary {
  childId: string;
  childName: string;
  childPhotoUrl: string | null;
  status: 'healthy' | 'monitoring' | 'treatment';
  statusLabel: string;           // 'Em tratamento' / 'Em acompanhamento' / 'Saudavel'
  detail: string;
  nextAction: string | null;     // 'Confirmar dose' / 'Atualizar estado' / null
}

interface ChildCard {
  id: string;
  fullName: string;
  firstName: string;
  age: number;
  photoUrl: string | null;
}

export interface PendingSwap {
  id: string;
  requesterId: string; // pra chamar respondToSwap (action card inline no dashboard)
  requesterName: string;
  originalDate: string;
  proposedDate: string | null;
  reason: string | null;
  type: string;
  createdAt: string;
}

/** Pedido de troca que EU enviei, aguardando o coparente responder.
 *  Mostrado no dashboard + calendar com botao "Cancelar pedido" inline. */
export interface MySentSwap {
  id: string;
  targetUserId: string;
  targetName: string;
  originalDate: string;
  proposedDate: string | null;
  reason: string | null;
  type: string;
}

/** Detecta mudanca de custodia entre hoje e amanha — banner laranja
 *  no topo do dashboard/calendar pra pais que precisam se organizar. */
export interface TomorrowSwapInfo {
  childName: string;
  nextPerson: string;
  isWithMeTomorrow: boolean;
}

export interface PendingDecision {
  id: string;
  title: string;
  category: string;
  deadline: string | null;
}

export interface PendingExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expenseDate: string;
  paidByName: string;
}

export interface PendingReport {
  activityId: string;
  activityName: string;
  childName: string;
  childId: string | null;
  occurrenceDate: string;      // YYYY-MM-DD
  daysAgo: number;
}

interface DashboardData {
  // Greeting
  greeting: 'morning' | 'afternoon' | 'evening';
  firstName: string;
  formattedDate: string;
  custodySummary: string | null;    // "Eduarda com Angelino hoje"

  // Hero / custody
  custodyChildren: CustodyChild[];
  hasCustody: boolean;
  nextSwapLabel: string | null;     // "QUI 23/4"
  nextSwapPerson: string | null;    // "HENRIQUE"
  streakDays: number;
  streakTotal: number;
  endDateLabel: string | null;      // "regular - qua"

  // Children
  children: Array<{ id: string; full_name: string; birth_date: string }>;

  // Activities today & tomorrow
  todayActivities: ActivityItem[];
  tomorrowActivities: ActivityItem[];

  // Members with colors
  members: Array<{ user_id: string; name: string; color: string }>;

  // Group metadata
  groupName: string;
  memberCount: number;

  // Quick stats (counts)
  unreadNotifications: number;
  pendingExpenses: number;
  pendingDecisions: number;
  balance: number;
  pendingSwaps: number;

  // Detailed pending lists (actionable cards)
  pendingSwapsList: PendingSwap[];
  pendingDecisionsList: PendingDecision[];
  pendingExpensesList: PendingExpense[];
  /** Pedidos que EU enviei, aguardando o coparente. Card "Cancelar pedido". */
  mySentSwapsList: MySentSwap[];
  /** Banner "Amanha: troca de guarda". null quando custodia nao muda. */
  tomorrowSwapInfo: TomorrowSwapInfo | null;

  // Children cards
  childCards: ChildCard[];

  // Health summaries
  childHealthSummaries: ChildHealthSummary[];
  hasAnyCriticalChild: boolean;

  // Pending activity reports
  pendingReports: PendingReport[];

  // Collab Foundation — Fase 1. Unread count of school_logs for the
  // current user. Drives the dashboard "Escola · N novos" row.
  schoolUnreadCount: number;
  // Fase 1B — unread despesas (pending / cancel_pending).
  expensesUnreadCount: number;
  // Fase 3 (migration 00080). Soma agregada dos 5 record_types de Saúde
  // (appointments scheduled + illness active + medications active +
  // allergies + vaccines). Drives "Saúde · N novos" row no dashboard.
  saudeUnreadCount: number;
  // Saúde Preventiva (migration 00082): pendências reais (overdue+due_soon)
  // somadas em todas crianças do grupo via view child_vaccine_coverage.
  vaccinePendingCount: number;
  vaccineNextDue: { dueDate: string; vaccineName: string } | null;
}

function formatDate(): string {
  const now = new Date();
  const days = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]}`;
}

function getGreeting(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useDashboard() {
  const { userId, profile, activeGroup } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    // Sem usuario/grupo nao tem o que carregar — mas ainda precisamos liberar
    // o spinner pra UI nao ficar travada (bug Aline 2026-05-11). O finally
    // global no fim do try/catch cobre TODOS os caminhos de saida.
    if (!userId || !activeGroup) {
      setLoading(false);
      return;
    }
    const groupId = activeGroup.groupId;
    const cacheKey = `dashboard_${groupId}`;

    try {
      // Try cache first when offline. Antes esse path ficava no inicio e
      // tinha um `return` cru — quando offline E sem cache, loading
      // continuava true pra sempre. Agora mora dentro do try pra cair no
      // finally que libera o spinner.
      if (!isOnline()) {
        const cached = await cacheGet<DashboardData>(cacheKey);
        if (cached) { setData(cached); return; }
        // Offline + sem cache: deixa data=null mas finally vai liberar o
        // spinner e a UI mostra empty state em vez de "Carregando..." eterno.
        return;
      }

      const today = formatDateKey(new Date());
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatDateKey(tomorrow);
      // Horizonte de 60 dias pro custody fetch — bug Barata 2026-05-14:
      // query antiga só pegava events de HOJE, então findNextCustodyHandover
      // não enxergava swaps futuros e devolvia a "próxima troca" errada.
      const sixtyDaysFromToday = new Date();
      sixtyDaysFromToday.setDate(sixtyDaysFromToday.getDate() + 60);
      const sixtyDaysFromTodayStr = formatDateKey(sixtyDaysFromToday);

      // All queries in parallel (resilient — each with fallback).
      // Envolto em withTimeout: se qualquer query do Supabase pendurar
      // (TLS travado, token expirado em refresh storm), o TimeoutError
      // dispara em 15s e cai no catch — UI sai do "Carregando..." em vez
      // de bloquear pra sempre. Telemetria via error-reporter.
      const [
        { data: members },
        { data: children },
        { data: custodyEvents },
        { data: todayOccurrences },
        { data: tomorrowOccurrences },
        { data: notifications },
        { data: pendingExp },
        { data: illnessData },
        { data: medsData },
        { data: openDecisions },
        { data: approvedExpenses },
        { data: pendingSwapsData },
        { data: mySentSwapsData },
        { data: tomorrowCustodyData },
      ] = await withTimeout(Promise.all([
        supabase.from('group_members')
          .select('user_id, role, profiles(full_name)')
          .eq('group_id', groupId)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('children')
          .select('id, full_name, birth_date, photo_url')
          .eq('group_id', groupId)
          .then(r => r, () => ({ data: [] as never[] })),
        // Range expandido até +60 dias pra findNextCustodyHandover ter
        // visibilidade dos swaps futuros. Antes a query filtrava só HOJE
        // (.lte start <= today .gte end >= today), mascarando o bug Barata:
        // pra calcular a "próxima troca", o helper precisa enxergar o swap
        // aprovado pra sex 15/16/17 (não só o regular Amanda 14-18). Sem o
        // range expandido, helper achava handover errado em sex 15 (regular
        // Amanda) em vez de seg 18 (Amanda assume após fim dos swaps).
        // Filtro: events que TERMINAM em hoje ou depois, COMEÇAM em até 60d.
        activeGroup.custodyEnabled
          ? supabase.from('custody_events')
              .select('id, start_date, end_date, responsible_user_id, child_id, custody_type, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)')
              .eq('group_id', groupId)
              .gte('end_date', today)
              .lte('start_date', sixtyDaysFromTodayStr)
              .order('start_date')
              .then(r => r, () => ({ data: [] as never[] }))
          : Promise.resolve({ data: [] as never[] }),
        // calendar_occurrences has NO status column (migration 00038); filtering
        // .eq('status','active') silently returned 0 rows and hid the day card.
        // Same query shape as line 354 below — kept consistent on purpose.
        supabase.from('calendar_occurrences')
          .select('id, activity_id, occurrence_date, child_activities(id, name, category, time_start, time_end, location, child_id, children(full_name))')
          .eq('group_id', groupId)
          .eq('occurrence_date', today)
          .limit(20)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('calendar_occurrences')
          .select('id, activity_id, occurrence_date, child_activities(id, name, category, time_start, time_end, location, child_id, children(full_name))')
          .eq('group_id', groupId)
          .eq('occurrence_date', tomorrowStr)
          .limit(20)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false)
          .then(r => r, () => ({ data: null, count: 0 } as never)),
        // Pending expenses awaiting my approval (details for actionable card)
        supabase.from('expenses')
          .select('id, description, amount, category, expense_date, paid_by, profiles!expenses_paid_by_fkey(full_name)')
          .eq('group_id', groupId)
          .eq('status', 'pending')
          .neq('paid_by', userId)
          .order('created_at', { ascending: false })
          .limit(5)
          .then(r => r, () => ({ data: [] as never[] })),
        // Active illnesses for health summary
        supabase.from('illness_episodes')
          .select('id, title, status, child_id, children(full_name)')
          .eq('group_id', groupId)
          .eq('status', 'active')
          .limit(10)
          .then(r => r, () => ({ data: [] as never[] })),
        // Active medications — apenas cursos agudos (com end_date definida).
        // Medicacao sem end_date = uso continuo/cronico, fica fora da home pra
        // evitar poluicao visual; ainda visivel em /saude/medicamentos.
        supabase.from('active_medications')
          .select('id, name, child_id, children(full_name)')
          .eq('group_id', groupId)
          .eq('status', 'active')
          .not('end_date', 'is', null)
          .limit(10)
          .then(r => r, () => ({ data: [] as never[] })),
        // Open decisions with details (for actionable card)
        supabase.from('decisions')
          .select('id, title, category, deadline, status')
          .eq('group_id', groupId)
          .eq('status', 'aberta')
          .order('created_at', { ascending: false })
          .limit(10)
          .then(r => r, () => ({ data: [] as never[] })),
        // Approved expenses for balance calculation
        supabase.from('expenses')
          .select('amount, paid_by')
          .eq('group_id', groupId)
          .eq('status', 'approved')
          .limit(10000)
          .then(r => r, () => ({ data: [] as never[] })),
        // Pending swap requests (details for actionable card)
        activeGroup.custodyEnabled
          ? supabase.from('swap_requests')
              .select('id, original_date, proposed_date, reason, type, created_at, requester_id, profiles!swap_requests_requester_id_fkey(full_name)')
              .eq('group_id', groupId)
              .eq('status', 'pending')
              .eq('target_user_id', userId)
              .order('created_at', { ascending: false })
              .limit(3)
              .then(r => r, () => ({ data: [] as never[] }))
          : Promise.resolve({ data: [] as never[] }),
        // Meus pedidos enviados aguardando o coparente (cancelar pedido inline).
        activeGroup.custodyEnabled
          ? supabase.from('swap_requests')
              .select('id, original_date, proposed_date, reason, type, target_user_id, profiles!swap_requests_target_user_id_fkey(full_name)')
              .eq('group_id', groupId)
              .eq('status', 'pending')
              .eq('requester_id', userId)
              .order('created_at', { ascending: false })
              .limit(5)
              .then(r => r, () => ({ data: [] as never[] }))
          : Promise.resolve({ data: [] as never[] }),
        // Custodia de AMANHA (banner laranja "Amanha: troca de guarda").
        activeGroup.custodyEnabled
          ? supabase.from('custody_events')
              .select('id, start_date, end_date, responsible_user_id, child_id, custody_type, children(full_name)')
              .eq('group_id', groupId)
              .lte('start_date', tomorrowStr)
              .gte('end_date', tomorrowStr)
              .then(r => r, () => ({ data: [] as never[] }))
          : Promise.resolve({ data: [] as never[] }),
      ]), FETCH_TIMEOUT_MS, 'useDashboard:mainQueries');

      // Build member color map — chip de cor + nome curto, firstOnly=true
      const memberList = (members || []).map((m: any, i: number) => ({
        user_id: m.user_id,
        name: getDisplayName(m.profiles?.full_name, true),
        color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
      }));

      // Bug Barata 2026-05-14 (iOS native): a versão antiga aqui só
      // priorizava swap > regular pelo sort, ignorando exception e
      // created_at. E o cálculo de nextSwap mais abaixo era heurístico
      // (endDate + 1 day + "outro pai"), sem considerar swaps futuros
      // aprovados.
      //
      // Fix: usar src/lib/custody-resolve.ts (mesmo módulo do PWA) que
      // espelha a view SQL custody_resolved da migration 00079:
      //   swap > exception > regular, tie-break created_at DESC.
      // E pra próxima troca, iterar dia-a-dia até achar handover real.
      const allCustodyForResolve = ((custodyEvents || []) as unknown) as CustodyEventInput[];
      const todayWinnerMap = resolveTodayCustody(allCustodyForResolve, today);
      // Re-localizar evento original (com joins de profiles/children) já
      // que o helper trabalha com tipo enxuto. Mantém compat com código
      // abaixo que lê e.children.full_name, e.profiles.full_name, etc.
      const dedupedToday: any[] = [];
      for (const winner of todayWinnerMap.values()) {
        const full = (custodyEvents || []).find((c: any) => c.id === winner.id) || winner;
        dedupedToday.push(full);
      }

      // Build custody children
      // childFirstName: nome COMPLETO da criança (composed PT-BR como "Julio Cesar"
      // não pode ser truncado). responsibleName: nome curto do coparente.
      const custodyChildren: CustodyChild[] = dedupedToday.map((e: any) => {
        const member = memberList.find((m: any) => m.user_id === e.responsible_user_id);
        return {
          childFirstName: getDisplayName(e.children?.full_name),
          responsibleName: member?.name || getDisplayName(e.profiles?.full_name, true),
          isWithMe: e.responsible_user_id === userId,
          color: member?.color || PARENT_COLORS.primary,
        };
      });

      // Compute next swap + streak days for hero card
      let nextSwapLabel: string | null = null;
      let nextSwapPerson: string | null = null;
      let streakDays = 0;
      let streakTotal = 0;
      let endDateLabel: string | null = null;
      if (dedupedToday.length > 0) {
        const ce = dedupedToday[0];
        const endDate = new Date(ce.end_date + 'T12:00:00');

        // Streak: usa o BLOCO consecutivo de dias com o mesmo responsável,
        // aplicando swap > exception > regular dia-a-dia. Bug Barata 2026-05-14:
        // cálculo antigo usava só start/end do evento winner. Quando winner é
        // swap unicelular (1 dia), mostrava "1/1" mesmo quando havia 4 swaps
        // emendados (qui+sex+sáb+dom todos pro mesmo pai).
        const streak = computeCustodyStreak(
          allCustodyForResolve,
          ce.child_id,
          today,
        );
        if (streak) {
          streakDays = streak.streakDays;
          streakTotal = streak.streakTotal;
        } else {
          // Fallback ao range do evento se algo inesperado (não deve cair aqui).
          const startDate = new Date(ce.start_date + 'T12:00:00');
          const todayDate = new Date(today + 'T12:00:00');
          streakDays = Math.max(1, Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000) + 1);
          streakTotal = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
        }

        const weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
        const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

        // Próxima troca: PROPER via custody-resolve helper. A versão antiga
        // usava `endDate + 1 day` + "outro pai" como heurística, ignorando
        // swaps futuros aprovados. Bug Barata: swap aprovado pra próximo
        // fim de semana fazia ele continuar com Bernardo, mas o card mostrava
        // a próxima troca como "AMANDA" (heurística do "outro pai" — errado
        // porque o swap segura ele com Bernardo, troca real só na segunda).
        const childId = ce.child_id;
        const currentResp = ce.responsible_user_id;
        const handover = findNextCustodyHandover(
          allCustodyForResolve,
          childId,
          today,
          currentResp,
        );
        if (handover) {
          const next = new Date(handover.dateKey + 'T12:00:00');
          nextSwapLabel = `${weekdays[next.getDay()]} ${next.getDate()}/${months[next.getMonth()]}`;
          const memberOfHandover = memberList.find(
            (m) => m.user_id === handover.event.responsible_user_id,
          );
          nextSwapPerson = memberOfHandover?.name?.toUpperCase() ?? null;
        }

        // Label amigável do subtítulo do hero ("Bernardo · troca · qua").
        // Bug Barata 2026-05-14: antes era `${custody_type} - ${dia}` → o
        // user via "swap - qua" literal, termo técnico vazando do banco.
        // - regular: omite o tipo (escala normal não merece destaque)
        // - swap: "troca" (linguagem do produto)
        // - exception: "ajuste" (caso único, fora da escala)
        const dayOfWeekPt = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][endDate.getDay()];
        const custodyType = ce.custody_type || 'regular';
        const typeLabel = custodyType === 'swap'
          ? 'troca'
          : custodyType === 'exception'
            ? 'ajuste'
            : null;
        endDateLabel = typeLabel ? `${typeLabel} · ${dayOfWeekPt}` : `até ${dayOfWeekPt}`;
      }

      // Custody summary for greeting subtitle. Suporta multiplos filhos:
      //  - Todos com a mesma pessoa: "Eduarda e Joao com voce hoje"
      //  - Distribuidos: "Eduarda com voce · Joao com Angelino"
      //  - 1 filho: comportamento original
      let custodySummary: string | null = null;
      if (custodyChildren.length > 0) {
        // Agrupa por responsavel
        const groupKey = (c: CustodyChild) => c.isWithMe ? '__me__' : c.responsibleName;
        const grouped = new Map<string, CustodyChild[]>();
        custodyChildren.forEach(c => {
          const k = groupKey(c);
          const arr = grouped.get(k) || [];
          arr.push(c);
          grouped.set(k, arr);
        });

        const formatNames = (names: string[]) => {
          if (names.length === 1) return names[0];
          if (names.length === 2) return `${names[0]} e ${names[1]}`;
          return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
        };

        if (grouped.size === 1) {
          // Todos com a mesma pessoa
          const [responsible, kids] = Array.from(grouped.entries())[0];
          const who = responsible === '__me__' ? 'você' : responsible;
          const names = formatNames(kids.map(c => c.childFirstName));
          custodySummary = `${names} com ${who} hoje`;
        } else {
          // Distribuidos — uma frase por grupo
          const parts: string[] = [];
          grouped.forEach((kids, responsible) => {
            const who = responsible === '__me__' ? 'você' : responsible;
            const names = formatNames(kids.map(c => c.childFirstName));
            parts.push(`${names} com ${who}`);
          });
          custodySummary = parts.join(' · ');
        }
      }

      // Pending activity reports: ocorrencias de DIAS PASSADOS (>=7d ago,
      // <today) sem activity_report. Atividades de HOJE encerradas ficam na
      // secao "Atividades de hoje" com pill "Relatar" inline (state-aware
      // rendering em (tabs)/index.tsx). Sem duplicacao entre as duas secoes.
      const pendingReports: PendingReport[] = [];
      const todayReportedActivityIds = new Set<string>();
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = formatDateKey(weekAgo);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatDateKey(yesterday);

        const [{ data: pastOccs }, { data: existingReports }, { data: todayReportsData }] = await withTimeout(Promise.all([
          // NOTE: calendar_occurrences has NO status column (see migration
          // 00038_calendar_occurrences.sql) — filtering by status silently
          // returned 0 rows and hid the Pendentes section. Mirror the PWA
          // dashboard query which only filters by group + date range.
          supabase.from('calendar_occurrences')
            .select('activity_id, occurrence_date, child_activities!inner(id, name, child_id, children(full_name))')
            .eq('group_id', groupId)
            .gte('occurrence_date', weekAgoStr)
            .lte('occurrence_date', yesterdayStr)
            .order('occurrence_date', { ascending: false })
            .limit(30)
            .then(r => r, () => ({ data: [] as never[] })),
          supabase.from('activity_reports')
            .select('activity_id, occurrence_date')
            .eq('group_id', groupId)
            .gte('occurrence_date', weekAgoStr)
            .lte('occurrence_date', yesterdayStr)
            .limit(200)
            .then(r => r, () => ({ data: [] as never[] })),
          // Reports de HOJE — usados pra marcar visualmente atividades ja
          // relatadas (mostra check + line-through), distinguindo das que
          // ainda precisam de Relatar (mostra pill amber).
          supabase.from('activity_reports')
            .select('activity_id')
            .eq('group_id', groupId)
            .eq('occurrence_date', today)
            .limit(50)
            .then(r => r, () => ({ data: [] as never[] })),
        ]), FETCH_TIMEOUT_MS, 'useDashboard:pendingReports');

        for (const r of (todayReportsData as any[])) todayReportedActivityIds.add(r.activity_id);

        const reported = new Set((existingReports || []).map((r: any) => `${r.activity_id}__${r.occurrence_date}`));
        const seenKeys = new Set<string>();
        for (const o of (pastOccs as any[])) {
          const act = o.child_activities;
          if (!act) continue;
          const key = `${o.activity_id}__${o.occurrence_date}`;
          if (reported.has(key) || seenKeys.has(key)) continue;
          seenKeys.add(key);
          const occDate = new Date(o.occurrence_date + 'T12:00:00');
          const daysAgo = Math.max(0, Math.floor((Date.now() - occDate.getTime()) / 86400000));
          pendingReports.push({
            activityId: o.activity_id,
            activityName: act.name,
            childName: getDisplayName(act.children?.full_name) || 'Geral',
            childId: act.child_id || null,
            occurrenceDate: o.occurrence_date,
            daysAgo,
          });
          if (pendingReports.length >= 5) break;
        }
      } catch { /* pending reports are a nice-to-have */ }

      // ── School unread count (Collab Foundation — Fase 1) ─────────
      // Two-query approach: all school_log ids in group + reads by user.
      // Run in parallel inside a small try so a Storage/RLS hiccup
      // doesn't tank the whole dashboard.
      let schoolUnreadCount = 0;
      try {
        const [{ data: schoolIdsRows }, { data: readsRows }] = await withTimeout(Promise.all([
          supabase.from('school_logs').select('id').eq('group_id', groupId)
            .then(r => r, () => ({ data: [] as never[] })),
          supabase.from('collab_reads').select('record_id')
            .eq('user_id', userId).eq('record_type', 'school_log')
            .then(r => r, () => ({ data: [] as never[] })),
        ]), 8_000, 'useDashboard:schoolUnread');
        const ids = ((schoolIdsRows || []) as { id: string }[]).map(r => r.id);
        const reads = new Set(((readsRows || []) as { record_id: string }[]).map(r => r.record_id));
        schoolUnreadCount = ids.filter(id => !reads.has(id)).length;
      } catch { /* unread badge is a nice-to-have */ }

      // ── Expenses unread (Fase 1B) — só pending/cancel_pending ────────
      let expensesUnreadCount = 0;
      try {
        const [{ data: expenseIdsRows }, { data: expenseReadsRows }] = await withTimeout(Promise.all([
          supabase.from('expenses').select('id').eq('group_id', groupId)
            .in('status', ['pending', 'cancel_pending'])
            .then(r => r, () => ({ data: [] as never[] })),
          supabase.from('collab_reads').select('record_id')
            .eq('user_id', userId).eq('record_type', 'expense')
            .then(r => r, () => ({ data: [] as never[] })),
        ]), 8_000, 'useDashboard:expensesUnread');
        const ids = ((expenseIdsRows || []) as { id: string }[]).map(r => r.id);
        const reads = new Set(((expenseReadsRows || []) as { record_id: string }[]).map(r => r.record_id));
        expensesUnreadCount = ids.filter(id => !reads.has(id)).length;
      } catch { /* idem */ }

      // ── Saúde unread (Fase 3, migration 00080) — soma dos 5 ──────────
      // Agregado pra evitar 5 tiles no dashboard. Status filters batem
      // com unreadCollabCount em src/lib/services/collab.ts (mesma regra
      // PWA/native). Falha silenciosa: 0 quando algum query der hiccup.
      let saudeUnreadCount = 0;
      try {
        const [
          { data: aptRows },
          { data: illRows },
          { data: medRows },
          { data: algRows },
          { data: vacRows },
          { data: saudeReadsRows },
        ] = await withTimeout(Promise.all([
          supabase.from('medical_appointments').select('id')
            .eq('group_id', groupId).eq('status', 'scheduled')
            .then(r => r, () => ({ data: [] as never[] })),
          supabase.from('illness_episodes').select('id')
            .eq('group_id', groupId).eq('status', 'active')
            .then(r => r, () => ({ data: [] as never[] })),
          supabase.from('active_medications').select('id')
            .eq('group_id', groupId).eq('status', 'active')
            .then(r => r, () => ({ data: [] as never[] })),
          supabase.from('child_allergies').select('id')
            .eq('group_id', groupId)
            .then(r => r, () => ({ data: [] as never[] })),
          supabase.from('vaccination_records').select('id')
            .eq('group_id', groupId)
            .then(r => r, () => ({ data: [] as never[] })),
          supabase.from('collab_reads').select('record_id, record_type')
            .eq('user_id', userId)
            .in('record_type', [
              'medical_appointment',
              'illness_episode',
              'active_medication',
              'child_allergy',
              'vaccination_record',
            ])
            .then(r => r, () => ({ data: [] as never[] })),
        ]), 8_000, 'useDashboard:saudeUnread');
        const readsByType = new Map<string, Set<string>>();
        for (const r of ((saudeReadsRows || []) as { record_id: string; record_type: string }[])) {
          if (!readsByType.has(r.record_type)) {
            readsByType.set(r.record_type, new Set());
          }
          readsByType.get(r.record_type)!.add(r.record_id);
        }
        const countUnread = (rt: string, rows: { id: string }[] | null | undefined) => {
          const reads = readsByType.get(rt) || new Set();
          return ((rows || []) as { id: string }[]).filter(r => !reads.has(r.id)).length;
        };
        saudeUnreadCount =
          countUnread('medical_appointment', aptRows) +
          countUnread('illness_episode', illRows) +
          countUnread('active_medication', medRows) +
          countUnread('child_allergy', algRows) +
          countUnread('vaccination_record', vacRows);
      } catch { /* idem */ }

      // Saúde Preventiva: agrega overdue+due_soon de todas crianças.
      let vaccinePendingCount = 0;
      let vaccineNextDue: { dueDate: string; vaccineName: string } | null = null;
      try {
        const { data: coverageRows } = await withTimeout(
          supabase
            .from('child_vaccine_coverage')
            .select('overdue_count, due_soon_count, next_due_date, next_due_vaccine_name')
            .eq('group_id', activeGroup.groupId),
          5_000,
          'useDashboard:vaccinePending',
        );
        for (const r of (coverageRows || []) as Array<{
          overdue_count: number | null;
          due_soon_count: number | null;
          next_due_date: string | null;
          next_due_vaccine_name: string | null;
        }>) {
          vaccinePendingCount += Number(r.overdue_count || 0) + Number(r.due_soon_count || 0);
          if (r.next_due_date && (!vaccineNextDue || r.next_due_date < vaccineNextDue.dueDate)) {
            vaccineNextDue = {
              dueDate: r.next_due_date,
              vaccineName: r.next_due_vaccine_name || '',
            };
          }
        }
      } catch { /* idem */ }

      // Map occurrences to ActivityItems. Para hoje, classificamos o estado
      // (upcoming / ended-unreported / ended-reported) pra a UI distinguir
      // visualmente e oferecer "Relatar" inline em encerradas-sem-relato.
      const realNowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
      const classifyTodayState = (act: any): TodayActivityState => {
        const endStr: string | null = act?.time_end || act?.time_start;
        if (!endStr) return 'upcoming';
        const [h, m] = String(endStr).split(':').map(Number);
        const endMin = h * 60 + (m || 0);
        if (endMin > realNowMinutes) return 'upcoming';
        return todayReportedActivityIds.has(act.id) ? 'ended-reported' : 'ended-unreported';
      };

      const mapOccurrences = (occs: any[], isToday: boolean): ActivityItem[] =>
        (occs || []).map((o: any) => {
          const act = o.child_activities;
          return {
            id: act?.id || o.activity_id,
            name: act?.name || '',
            category: act?.category || 'other',
            childName: getDisplayName(act?.children?.full_name),
            childId: act?.child_id || null,
            timeStr: act?.time_start ? act.time_start.slice(0, 5) : '',
            location: act?.location || '',
            state: isToday ? classifyTodayState(act) : undefined,
          };
        }).filter((a: ActivityItem) => a.name);

      // Child cards. photo_url e armazenado como STORAGE PATH (nao URL),
      // entao precisa ser assinado antes de chegar no <Image>. Sem isso
      // o card renderizava um circulo vazio (Image falhava silenciosa,
      // sem fallback pra inicial). Assinatura em paralelo pra todos os
      // filhos pra nao bloquear o resto do dashboard.
      const rawCards = (children || []).map((c: any) => ({ row: c, signedUrl: null as string | null }));
      const signTasks = rawCards.map(async (item) => {
        const raw = item.row.photo_url as string | null | undefined;
        if (!raw) return;
        if (/^https?:\/\//i.test(raw)) {
          item.signedUrl = raw; // legado: ja era URL absoluta
          return;
        }
        try {
          item.signedUrl = await signChildAvatar(raw);
        } catch {
          item.signedUrl = null;
        }
      });
      // Timeout curto: assinar avatar e' nice-to-have, nao deve travar dashboard.
      // Se Storage demorar, cai no catch via Promise.race e signedUrl fica null
      // (UI usa fallback de inicial do nome).
      await withTimeout(Promise.all(signTasks), 5_000, 'useDashboard:signAvatars')
        .catch(() => { /* avatars sao opcionais */ });

      const childCards: ChildCard[] = rawCards.map(({ row: c, signedUrl }) => {
        const bd = new Date(c.birth_date + 'T12:00:00');
        const ageDiff = Date.now() - bd.getTime();
        const age = Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000));
        return {
          id: c.id,
          fullName: c.full_name,
          firstName: getDisplayName(c.full_name),
          age,
          photoUrl: signedUrl,
        };
      });

      // Health summaries per child — matches PWA src/app/(app)/dashboard/page.tsx:
      //   - active medication  → treatment  + 'Confirmar dose'
      //   - active illness     → monitoring + 'Atualizar estado'
      //   - (checkin recente)  → monitoring (no action)
      //   - healthy            → no action
      // Previous native logic had meds/illness INVERTED — fixed now.
      const childHealthSummaries: ChildHealthSummary[] = childCards.map(child => {
        const childMeds = (medsData || []).filter((m: any) => m.child_id === child.id);
        const childIllnesses = (illnessData || []).filter((i: any) => i.child_id === child.id);

        let status: 'healthy' | 'monitoring' | 'treatment' = 'healthy';
        let detail = 'Sem registros recentes';
        let nextAction: string | null = null;

        if (childMeds.length > 0) {
          status = 'treatment';
          const med = childMeds[0] as any;
          detail = med.name || 'Medicado';
          nextAction = 'Confirmar dose';
        } else if (childIllnesses.length > 0) {
          status = 'monitoring';
          const ill = childIllnesses[0] as any;
          detail = ill.title || 'Acompanhamento';
          nextAction = 'Atualizar estado';
        }

        const statusLabel =
          status === 'treatment' ? 'Em tratamento'
          : status === 'monitoring' ? 'Em acompanhamento'
          : 'Saudavel';

        return { childId: child.id, childName: child.firstName, childPhotoUrl: child.photoUrl, status, statusLabel, detail, nextAction };
      });
      // Sort: treatment (highest priority) > monitoring > healthy — matches PWA
      childHealthSummaries.sort((a, b) => {
        const order = { treatment: 0, monitoring: 1, healthy: 2 };
        return order[a.status] - order[b.status];
      });

      // Calculate balance
      let myTotal = 0;
      let otherTotal = 0;
      (approvedExpenses || []).forEach((e: any) => {
        if (e.paid_by === userId) myTotal += e.amount;
        else otherTotal += e.amount;
      });

      // Build actionable pending lists — requester/target em chip compacto, firstOnly
      const pendingSwapsList: PendingSwap[] = (pendingSwapsData || []).map((s: any) => ({
        id: s.id,
        requesterId: s.requester_id,
        requesterName: getDisplayName(s.profiles?.full_name, true) || 'Co-responsavel',
        originalDate: s.original_date,
        proposedDate: s.proposed_date,
        reason: s.reason,
        type: s.type || 'swap',
        createdAt: s.created_at,
      }));

      // Meus pedidos enviados — aguardando coparente responder
      const mySentSwapsList: MySentSwap[] = (mySentSwapsData || []).map((s: any) => ({
        id: s.id,
        targetUserId: s.target_user_id,
        targetName: getDisplayName(s.profiles?.full_name, true) || 'Co-responsavel',
        originalDate: s.original_date,
        proposedDate: s.proposed_date,
        reason: s.reason,
        type: s.type || 'swap',
      }));

      // Banner "Amanha: troca de guarda" — compara owner de hoje vs amanha
      // pra cada crianca. Se mudou, mostra. Espelha tomorrowSwapInfo do
      // calendario.tsx — necessario pra pais com comunicacao dificil terem
      // visibilidade do que vem.
      //
      // custodyData = custodia de hoje (ja buscada em cima pro hero).
      // tomorrowCustodyData = custodia de amanha (nova query).
      // Quando ambos tem o mesmo child_id mas responsible_user_id diferente,
      // banner ativa. Tie-break: custody_type='swap' ganha de 'regular'.
      let tomorrowSwapInfo: TomorrowSwapInfo | null = null;
      if (activeGroup.custodyEnabled && tomorrowCustodyData && custodyEvents) {
        const pickOwner = (rows: any[], childId: string | null): { uid: string; childName: string } | null => {
          const filtered = rows.filter(r => (r.child_id || null) === childId);
          if (filtered.length === 0) return null;
          // Swap ganha
          const winner = filtered.find(r => r.custody_type === 'swap') || filtered[0];
          return {
            uid: winner.responsible_user_id,
            childName: getDisplayName(winner.children?.full_name) || 'a crianca',
          };
        };
        // Coleta todos os child_ids unicos entre hoje + amanha
        const allChildIds = new Set<string | null>();
        for (const r of (custodyEvents as any[])) allChildIds.add(r.child_id || null);
        for (const r of (tomorrowCustodyData as any[])) allChildIds.add(r.child_id || null);
        for (const childId of allChildIds) {
          const todayOwner = pickOwner(custodyEvents as any[], childId);
          const tmwOwner = pickOwner(tomorrowCustodyData as any[], childId);
          if (!todayOwner || !tmwOwner) continue;
          if (todayOwner.uid === tmwOwner.uid) continue;
          const tmwPerson = memberList.find(m => m.user_id === tmwOwner.uid);
          tomorrowSwapInfo = {
            childName: tmwOwner.childName,
            nextPerson: tmwPerson?.name || 'o outro responsavel',
            isWithMeTomorrow: tmwOwner.uid === userId,
          };
          break; // 1 banner so
        }
      }

      // Decisions — filter out those the user already voted on
      const openDecisionList = (openDecisions || []) as any[];
      const openDecisionIds = openDecisionList.map((d: any) => d.id);
      let votedIds = new Set<string>();
      if (openDecisionIds.length > 0) {
        try {
          const { data: votes } = await withTimeout(
            supabase
              .from('decision_votes')
              .select('decision_id')
              .eq('user_id', userId)
              .in('decision_id', openDecisionIds),
            10_000,
            'useDashboard:decisionVotes',
          );
          votedIds = new Set((votes || []).map((v: any) => v.decision_id));
        } catch { /* sem votos: assume nada votado */ }
      }
      const pendingDecisionsList: PendingDecision[] = openDecisionList
        .filter((d: any) => !votedIds.has(d.id))
        .map((d: any) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          deadline: d.deadline,
        }));

      const pendingExpensesList: PendingExpense[] = (pendingExp || []).map((e: any) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount) || 0,
        category: e.category,
        expenseDate: e.expense_date,
        // Lista de pendências mostra "Pago por NOME" em chip compacto, firstOnly
        paidByName: getDisplayName(e.profiles?.full_name, true) || 'Co-responsavel',
      }));

      const hasAnyCriticalChild = childHealthSummaries.some(s => s.status === 'treatment');

      // Greeting "Bom dia, X" — sempre primeira palavra (do display_name override
      // ou do full_name). Se display_name é "Barata" (override curto), respeita;
      // se é "Angelino Silva Barata" (derived), pega só "Angelino".
      const displayFirst = getDisplayName(profile?.display_name, true)
        || getDisplayName(profile?.full_name, true)
        || (profile?.email ? profile.email.split('@')[0].split('.')[0] : '')
        || '';
      const firstName = displayFirst.charAt(0).toUpperCase() + displayFirst.slice(1);

      const dashData: DashboardData = {
        greeting: getGreeting(),
        firstName,
        formattedDate: formatDate(),
        custodySummary,
        custodyChildren,
        hasCustody: custodyChildren.length > 0,
        nextSwapLabel,
        nextSwapPerson,
        streakDays,
        streakTotal,
        endDateLabel,
        children: children || [],
        todayActivities: mapOccurrences(todayOccurrences || [], true),
        tomorrowActivities: mapOccurrences(tomorrowOccurrences || [], false),
        members: memberList,
        groupName: activeGroup.groupName || 'Familia',
        memberCount: memberList.length,
        unreadNotifications: (notifications as any)?.count || 0,
        pendingExpenses: pendingExpensesList.length,
        pendingDecisions: pendingDecisionsList.length,
        balance: (myTotal - otherTotal) / 2,
        pendingSwaps: pendingSwapsList.length,
        mySentSwapsList,
        tomorrowSwapInfo,
        pendingSwapsList,
        pendingDecisionsList,
        pendingExpensesList,
        childCards,
        childHealthSummaries,
        hasAnyCriticalChild,
        pendingReports,
        schoolUnreadCount,
        expensesUnreadCount,
        saudeUnreadCount,
        vaccinePendingCount,
        vaccineNextDue,
      };
      setData(dashData);
      cacheSet(cacheKey, dashData);
      setError(null);
    } catch (e) {
      // Falhou (timeout, rede, query 4xx/5xx). Tenta cache stale como
      // fallback pra evitar tela vazia — melhor mostrar dado de 5min atras
      // do que "Erro ao carregar". Se nao tem cache, deixa data=null e a
      // UI mostra empty state com botao "Tentar de novo".
      try {
        const stale = await cacheGet<DashboardData>(cacheKey);
        if (stale) setData(stale);
      } catch { /* cache miss: deixa data=null */ }
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados');
      reportError(e, { severity: 'error', filePath: 'useDashboard.loadData' }).catch(() => {});
    } finally {
      // SEMPRE liberar o spinner — esse e o invariante que precisa segurar
      // pra UI nunca mais ficar travada em "Carregando..." (bug Aline).
      setLoading(false);
    }
  }, [userId, activeGroup, profile]);

  // Reload every time tab gains focus
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Live update: re-fetch when a notification is created/updated so the
  // badge count + pending lists stay fresh without manual pull-to-refresh.
  useEffect(() => subscribeToNotifications(userId, loadData), [userId, loadData]);

  return { data, loading, error, refresh: loadData };
}
