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
// Porte do dashboard novo (Arco do Dia + Guarda universal + Dia em Família).
import { buildChildJourney, type JourneyItem } from '../lib/care-routine-journey';
import type { HeroCustodyContext, HeroFamilyDayContext } from '../components/DashboardHero';
import { signChildAvatar } from '../services/children';
import { PARENT_COLORS, getDisplayName } from '../lib/constants';
import { cacheGet, cacheSet, isOnline } from '../services/offline';
import { subscribeToNotifications } from '../services/notifications';
import { withTimeout, TimeoutError } from '../lib/with-timeout';
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
  detail: string | null;         // valor do banco (med.name/ill.title) ou null → render usa detailKey
  detailKey: 'noRecords' | 'medicated' | 'monitoring'; // fallback i18n (resolvido com t() no render)
  nextAction: 'confirmDose' | 'updateStatus' | null;   // fragmento de chave i18n (t('dashboard.nextAction.'+x))
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

  // === Hero v2 (porte do dashboard novo) — alimenta o DashboardHero nativo. ===
  /** Forma da família (coparenting_groups.arrangement; default 'rotating'). */
  arrangement: 'rotating' | 'together' | 'single' | 'custom';
  /** Jornada do dia (casa + atividades) pro Arco do Dia. Vazio = sem arco. */
  heroTimeline: JourneyItem[];
  /** Há atividade COM horário hoje (drives o arco no dia em família). */
  hasTodayEvents: boolean;
  /** Pais separados → Herói de Guarda universal (null caso contrário). */
  custodyContext: HeroCustodyContext | null;
  /** Família intacta/solo → voz de presença (null caso contrário). */
  familyDayContext: HeroFamilyDayContext | null;
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
      // Janela pendingReports — datas usadas pela RPC pra trazer ocorrências
      // de DIAS PASSADOS (7d) sem activity_report. Subiu pra cá pra alimentar
      // os params da RPC; antes era local ao try-block de pendingReports.
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = formatDateKey(weekAgo);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = formatDateKey(yesterday);

      // === RPC consolidada (migration 00101, 2026-05-29) =====================
      // Antes: 17 SELECTs em 7 batches sequenciais (worst-case 74s timeout
      // budget). Qualquer transient — PostgREST schema reload, cron pressure,
      // pool contention — batia no 15s ceiling do withTimeout e mostrava
      // empty state mesmo pra returning user.
      // Agora: 1 round-trip + 1 plan + 1 RLS context. EXPLAIN ANALYZE: 35ms.
      // RLS continua aplicada (SECURITY INVOKER) — corrigida em 00098-00100.
      // `arrangement` (forma da família) NÃO está na RPC consolidada (00101 <
      // 00112). Query separada EM PARALELO com a RPC (não serializa o caminho
      // crítico) + fallback 'rotating' (não-fatal: erro → trata como rotating,
      // comportamento idêntico ao de hoje).
      const [rpcRes, arrRes, eventsRes] = await Promise.all([
        withTimeout(
          supabase.rpc('get_dashboard_payload', {
            p_group_id: groupId,
            p_today: today,
            p_tomorrow: tomorrowStr,
            p_sixty_days_from_today: sixtyDaysFromTodayStr,
            p_week_ago: weekAgoStr,
            p_yesterday: yesterdayStr,
          }),
          FETCH_TIMEOUT_MS,
          'useDashboard:rpc',
        ),
        supabase.from('coparenting_groups').select('arrangement').eq('id', groupId).maybeSingle(),
        // Events da tabela `events` ativos HOJE (com horário) pro Arco do Dia.
        // A RPC só traz child_activities (occurrences); o arco do PWA inclui os
        // dois. Bug device do dono 13/jun: evento escolar não aparecia no arco
        // nativo. Query paralela, não-fatal (erro → arco sem events).
        supabase
          .from('events')
          .select('id, title, event_time, location, child_id, event_date, end_date')
          .eq('group_id', groupId)
          .lte('event_date', today)
          .or(`end_date.gte.${today},end_date.is.null`),
      ]);
      if (rpcRes.error) throw new Error(rpcRes.error.message || 'rpc failed');
      const payload = (rpcRes.data || {}) as any;
      const arrangement = (((arrRes as any)?.data?.arrangement) ?? 'rotating') as
        | 'rotating'
        | 'together'
        | 'single'
        | 'custom';
      // Eventos de hoje COM horário, ativos na data (single-day OU multi-day).
      const todayEventsForArc = (((eventsRes as any)?.data ?? []) as any[]).filter(
        (e) => e.event_time && (e.end_date ? e.end_date >= today : e.event_date === today),
      );

      // Re-shape payload pra bater com os formatos que o resto do hook espera
      // (mantém código de custody-resolve, healthSummaries, balance etc. intacto).
      // O custo de reshape é trivial — só evita refactor cascata downstream.
      const members = (payload.members || []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        profiles: { full_name: m.full_name },
      }));
      const children = payload.children || [];
      const custodyEvents = activeGroup.custodyEnabled
        ? (payload.custody_window || []).map((ce: any) => ({
            id: ce.id, start_date: ce.start_date, end_date: ce.end_date,
            responsible_user_id: ce.responsible_user_id, child_id: ce.child_id,
            custody_type: ce.custody_type,
            children: ce.child_full_name ? { full_name: ce.child_full_name } : null,
            profiles: ce.responsible_full_name ? { full_name: ce.responsible_full_name } : null,
          }))
        : [];
      const tomorrowCustodyData = activeGroup.custodyEnabled
        ? (payload.tomorrow_custody || []).map((ce: any) => ({
            id: ce.id, start_date: ce.start_date, end_date: ce.end_date,
            responsible_user_id: ce.responsible_user_id, child_id: ce.child_id,
            custody_type: ce.custody_type,
            children: ce.child_full_name ? { full_name: ce.child_full_name } : null,
          }))
        : [];
      const reshapeOccurrence = (o: any) => ({
        id: o.id, activity_id: o.activity_id, occurrence_date: o.occurrence_date,
        child_activities: o.activity ? {
          id: o.activity.id, name: o.activity.name, category: o.activity.category,
          time_start: o.activity.time_start, time_end: o.activity.time_end,
          location: o.activity.location, child_id: o.activity.child_id,
          children: o.activity.child_full_name ? { full_name: o.activity.child_full_name } : null,
        } : null,
      });
      const todayOccurrences = (payload.today_occurrences || []).map(reshapeOccurrence);
      const tomorrowOccurrences = (payload.tomorrow_occurrences || []).map(reshapeOccurrence);
      const notifications = { count: payload.notifications_unread_count || 0 } as any;
      const pendingExp = (payload.pending_expenses_list || []).map((e: any) => ({
        id: e.id, description: e.description, amount: e.amount, category: e.category,
        expense_date: e.expense_date, paid_by: e.paid_by,
        profiles: e.paid_by_full_name ? { full_name: e.paid_by_full_name } : null,
      }));
      const illnessData = (payload.illness_active || []).map((i: any) => ({
        id: i.id, title: i.title, child_id: i.child_id,
        children: i.child_full_name ? { full_name: i.child_full_name } : null,
      }));
      const medsData = (payload.meds_active || []).map((m: any) => ({
        id: m.id, name: m.name, child_id: m.child_id,
        children: m.child_full_name ? { full_name: m.child_full_name } : null,
      }));
      // openDecisions agora já vem com has_my_vote pré-computado pelo SQL —
      // eliminamos o batch extra de decision_votes (antes era 14º query).
      const openDecisions = (payload.open_decisions || []);
      // Balance já agregado server-side (SUM FILTER) em vez de baixar até
      // 10000 expenses pra somar no client. Saves bandwidth + CPU.
      const balanceBuckets = payload.balance_buckets || { my: 0, other: 0 };
      const pendingSwapsData = activeGroup.custodyEnabled
        ? (payload.pending_swaps_target || []).map((s: any) => ({
            id: s.id, original_date: s.original_date, proposed_date: s.proposed_date,
            reason: s.reason, created_at: s.created_at, requester_id: s.requester_id,
            profiles: s.requester_full_name ? { full_name: s.requester_full_name } : null,
          }))
        : [];
      const mySentSwapsData = activeGroup.custodyEnabled
        ? (payload.my_sent_swaps || []).map((s: any) => ({
            id: s.id, original_date: s.original_date, proposed_date: s.proposed_date,
            reason: s.reason, target_user_id: s.target_user_id,
            profiles: s.target_full_name ? { full_name: s.target_full_name } : null,
          }))
        : [];

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
      // Hero v2: contexto de guarda + nomes de casa do arco (populados no bloco
      // de custody abaixo; consumidos no DashboardHero/heroTimeline).
      let custodyContext: HeroCustodyContext | null = null;
      let heroHomeName: string | null = null;
      let heroHomeEvening: string | null = null;
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
            (m: any) => m.user_id === handover.event.responsible_user_id,
          );
          nextSwapPerson = memberOfHandover?.name?.toUpperCase() ?? null;
        }

        // Label amigável do subtítulo do hero ("Bernardo · troca · qua").
        // Bug Barata 2026-05-14: antes era `${custody_type} - ${dia}` → o
        // user via "swap - qua" literal, termo técnico vazando do banco.
        // - regular: omite o tipo (escala normal não merece destaque)
        // - swap: "troca" (linguagem do produto)
        // - exception: "ajuste" (caso único, fora da escala)
        //
        // Bug Barata 2026-05-18: quando endDate era HOJE (último dia da guarda),
        // o label saía "até seg" numa segunda-feira — redundante e confuso (user
        // já sabe que hoje é segunda; progress bar mostra "5 de 5 consecutivos").
        // Fix: usar termo relativo ("hoje"/"amanhã") quando aplicável.
        const dayOfWeekPt = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][endDate.getDay()];
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const endMidnight = new Date(endDate);
        endMidnight.setHours(0, 0, 0, 0);
        const daysUntilEnd = Math.round((endMidnight.getTime() - todayMidnight.getTime()) / 86400000);
        const relativeEndDay = daysUntilEnd <= 0
          ? 'hoje'
          : daysUntilEnd === 1
            ? 'amanhã'
            : dayOfWeekPt;
        const custodyType = ce.custody_type || 'regular';
        const typeLabel = custodyType === 'swap'
          ? 'troca'
          : custodyType === 'exception'
            ? 'ajuste'
            : null;
        // Quando relativeEndDay === 'hoje', "até hoje" lê estranho — usar
        // "termina hoje" pra ficar natural; outros casos seguem o padrão "até X".
        if (relativeEndDay === 'hoje') {
          endDateLabel = typeLabel ? `${typeLabel} · termina hoje` : 'termina hoje';
        } else {
          endDateLabel = typeLabel ? `${typeLabel} · ${relativeEndDay}` : `até ${relativeEndDay}`;
        }

        // === Hero v2: monta o custodyContext (Herói de Guarda universal). =====
        const distinctResp = [...new Set(dedupedToday.map((e: any) => e.responsible_user_id))];
        const isSplit = distinctResp.length > 1;
        const heroKids = custodyChildren.map((c) => c.childFirstName);
        const primaryChild = custodyChildren[0];
        const handoffMember = handover ? memberList.find((m: any) => m.user_id === handover.event.responsible_user_id) : null;
        const handoffName = handoffMember?.name ?? '';
        const handoffToday = !!handover && handover.dateKey === today;
        heroHomeName = isSplit ? null : primaryChild.responsibleName;
        heroHomeEvening = handoffToday && handoffName ? handoffName : heroHomeName;
        const groups = isSplit
          ? distinctResp.map((rid) => {
              const kidsOfResp = dedupedToday.filter((e: any) => e.responsible_user_id === rid);
              const m = memberList.find((mm: any) => mm.user_id === rid);
              return {
                name: m?.name ?? '',
                isMe: rid === userId,
                colorHex: m?.color ?? PARENT_COLORS.primary,
                kids: kidsOfResp.map((e: any) => getDisplayName(e.children?.full_name)),
              };
            })
          : undefined;
        // Semana colorida (Seg..Dom): resolve a guarda por dia. NOTA: a janela
        // de custody é hoje..+60d → dias ANTERIORES a hoje nesta semana podem
        // ficar sem cor (gap conhecido; o streak "N de M" segue correto).
        const weekLabels = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
        const nowD = new Date(today + 'T12:00:00');
        const mondayIdx = (nowD.getDay() + 6) % 7;
        const monday = new Date(nowD);
        monday.setDate(nowD.getDate() - mondayIdx);
        const firstChildId = dedupedToday[0]?.child_id ?? null;
        const week = weekLabels.map((label, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          const winners = resolveTodayCustody(allCustodyForResolve, formatDateKey(d));
          let color: string | null = null;
          for (const w of winners.values()) {
            if (firstChildId == null || (w as any).child_id === firstChildId) {
              const m = memberList.find((mm: any) => mm.user_id === (w as any).responsible_user_id);
              color = m?.color ?? null;
              break;
            }
          }
          return { label, color, isToday: i === mondayIdx };
        });
        custodyContext = {
          mode: isSplit ? 'split' : heroKids.length === 1 ? 'single' : 'together',
          withName: primaryChild.responsibleName,
          withIsMe: primaryChild.isWithMe,
          kids: heroKids,
          untilLabel: relativeEndDay,
          handoff: handoffToday ? { name: handoffName, isMe: handover!.event.responsible_user_id === userId } : null,
          groups,
          streakDays,
          streakTotal,
          week,
          nextSwap: handover
            ? { dateLabel: nextSwapLabel ?? '', dateKey: handover.dateKey, name: handoffName, isMine: handover.event.responsible_user_id === userId }
            : null,
        };
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

      // Pending activity reports + counters consolidados agora vêm da RPC
      // (ver get_dashboard_payload em 00101). Antes eram 4 batches sequenciais
      // adicionais de queries (pendingReports + schoolUnread + expensesUnread
      // + saudeUnread + vaccinePending = 14 SELECTs extras). Agora: extração
      // direta do payload, sem round-trips.

      const todayReportedActivityIds = new Set<string>(
        ((payload.today_reported_activity_ids || []) as string[]),
      );
      // Pre-computed server-side já filtrando reportadas (NOT EXISTS no SQL).
      // Client só calcula daysAgo + limita a 5 (UI mostra 3 + "Ver todos").
      const pendingReports: PendingReport[] = ((payload.past_pending_reports || []) as any[])
        .slice(0, 5)
        .map((r: any) => {
          const occDate = new Date(r.occurrence_date + 'T12:00:00');
          const daysAgo = Math.max(0, Math.floor((Date.now() - occDate.getTime()) / 86400000));
          return {
            activityId: r.activity_id,
            activityName: r.activity_name,
            childName: getDisplayName(r.child_full_name) || 'Geral',
            childId: r.child_id || null,
            occurrenceDate: r.occurrence_date,
            daysAgo,
          };
        });

      // Counters agregados — SQL faz NOT EXISTS contra collab_reads server-side
      // (mesma regra de unreadCollabCount em src/lib/services/collab.ts).
      const schoolUnreadCount = Number(payload.school_unread_count || 0);
      const expensesUnreadCount = Number(payload.expenses_unread_count || 0);
      const saudeUnreadCount = Number(payload.saude_unread_count || 0);

      // Saúde Preventiva: SQL agrega overdue+due_soon das crianças com
      // total_taken > 0 (F#25 paridade PWA — supprime alerta pra criança
      // recém-cadastrada sem histórico). Server retorna pending_count + next_due.
      const vaccinePendingCount = Number(payload.vaccine_summary?.pending_count || 0);
      const vaccineNextDue = payload.vaccine_summary?.next_due
        ? {
            dueDate: payload.vaccine_summary.next_due.due_date as string,
            vaccineName: (payload.vaccine_summary.next_due.vaccine_name as string) || '',
          }
        : null;

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
      const signTasks = rawCards.map(async (item: any) => {
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

      const childCards: ChildCard[] = rawCards.map(({ row: c, signedUrl }: any) => {
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
        let detail: string | null = null;     // valor do banco; null → render usa detailKey (i18n)
        let detailKey: ChildHealthSummary['detailKey'] = 'noRecords';
        let nextAction: ChildHealthSummary['nextAction'] = null;

        if (childMeds.length > 0) {
          status = 'treatment';
          const med = childMeds[0] as any;
          detail = med.name || null;
          detailKey = 'medicated';
          nextAction = 'confirmDose';
        } else if (childIllnesses.length > 0) {
          status = 'monitoring';
          const ill = childIllnesses[0] as any;
          detail = ill.title || null;
          detailKey = 'monitoring';
          nextAction = 'updateStatus';
        }

        // i18n: o render resolve status/detail/nextAction via t() (reativo na troca de idioma).
        return { childId: child.id, childName: child.firstName, childPhotoUrl: child.photoUrl, status, detail, detailKey, nextAction };
      });
      // Sort: treatment (highest priority) > monitoring > healthy — matches PWA
      childHealthSummaries.sort((a, b) => {
        const order = { treatment: 0, monitoring: 1, healthy: 2 };
        return order[a.status] - order[b.status];
      });

      // Balance agora vem agregado server-side (SUM FILTER em
      // balanceBuckets). Antes baixava até 10.000 rows de approved expenses
      // só pra somar no client — gasto desnecessário de banda + CPU.
      const myTotal = Number(balanceBuckets.my || 0);
      const otherTotal = Number(balanceBuckets.other || 0);

      // Build actionable pending lists — requester/target em chip compacto, firstOnly
      const pendingSwapsList: PendingSwap[] = (pendingSwapsData || []).map((s: any) => ({
        id: s.id,
        requesterId: s.requester_id,
        requesterName: getDisplayName(s.profiles?.full_name, true) || 'Co-responsavel',
        originalDate: s.original_date,
        proposedDate: s.proposed_date,
        reason: s.reason,
        // Sem coluna `type` no schema; hardcode 'swap' até modelarmos outros tipos.
        type: 'swap',
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
        type: 'swap',
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
          const tmwPerson = memberList.find((m: any) => m.user_id === tmwOwner.uid);
          tomorrowSwapInfo = {
            childName: tmwOwner.childName,
            nextPerson: tmwPerson?.name || 'o outro responsavel',
            isWithMeTomorrow: tmwOwner.uid === userId,
          };
          break; // 1 banner so
        }
      }

      // Decisions — has_my_vote já vem pré-computado pela RPC (EXISTS no SQL),
      // eliminando o batch extra de decision_votes (antes era 14º query).
      const pendingDecisionsList: PendingDecision[] = ((openDecisions || []) as any[])
        .filter((d: any) => !d.has_my_vote)
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

      // === Hero v2: jornada do arco + dia em família ===========================
      const todayActsList = mapOccurrences(todayOccurrences || [], true);
      // Estações do arco = occurrences (child_activities) + events (tabela
      // events). O PWA inclui os dois; antes o nativo só tinha occurrences →
      // evento escolar sumia do arco (bug device do dono 13/jun).
      const arcActivities = [
        ...todayActsList
          .filter((a) => !!a.timeStr)
          .map((a) => ({
            name: a.name,
            time: a.timeStr,
            category: a.category,
            activityId: a.id as string | null,
            eventId: null as string | null,
            location: a.location || null,
            childId: a.childId,
          })),
        ...todayEventsForArc.map((e: any) => ({
          name: (e.title as string) || '',
          time: (e.event_time as string) || '',
          category: 'evento',
          activityId: null as string | null,
          eventId: e.id as string | null,
          location: (e.location as string) || null,
          childId: (e.child_id as string) || null,
        })),
      ];
      const hasTodayEvents = arcActivities.length > 0;
      const familyDayContext: HeroFamilyDayContext | null =
        arrangement === 'together' || arrangement === 'single'
          ? { mode: arrangement, kids: (children || []).map((c: any) => getDisplayName(c.full_name, true)).filter(Boolean) }
          : null;
      // Arco com guarda OU dia em família. As pernas de leva/busca (rotina)
      // entram no index.tsx (outro hook) — v1 do arco nativo mostra casas +
      // atividades + eventos; beads de leva/busca = follow-up documentado.
      const heroTimeline: JourneyItem[] =
        custodyChildren.length > 0 || familyDayContext
          ? buildChildJourney({
              dropoff: null,
              pickup: null,
              activities: arcActivities,
              homeMorning: heroHomeName,
              homeEvening: heroHomeEvening ?? heroHomeName,
            })
          : [];

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
        todayActivities: todayActsList,
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
        // Hero v2 (porte do dashboard novo).
        arrangement,
        heroTimeline,
        hasTodayEvents,
        custodyContext,
        familyDayContext,
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
      // TimeoutError já foi reportado como 'info' pelo withTimeout (defesa em
      // profundidade funcionando). Re-reportar como 'error' aqui duplica row
      // no app_errors e acorda Discord à toa pra um cenário esperado.
      if (!(e instanceof TimeoutError)) {
        reportError(e, { severity: 'error', filePath: 'useDashboard.loadData' }).catch(() => {});
      }
    } finally {
      // SEMPRE liberar o spinner — esse e o invariante que precisa segurar
      // pra UI nunca mais ficar travada em "Carregando..." (bug Aline).
      setLoading(false);
    }
  }, [userId, activeGroup, profile]);

  // Cache-first hydration: hidrata data com o último snapshot ANTES do fetch.
  // Returning user nunca vê "Não consegui carregar" / skeleton infinito porque
  // sempre tem cache de uma sessão anterior. Quando o fetch completa, UI
  // atualiza em silêncio (loading não toggla pra true em refetches).
  //
  // Antes desse cache-first, qualquer transient no PostgREST (schema reload,
  // pool pressure de crons matinais) batia no 15s timeout e empurrava a UI
  // pro empty state. Agora o empty state SÓ acontece pra first-time user
  // genuíno (sem cache E sem fetch bem-sucedido).
  useEffect(() => {
    if (!activeGroup) return;
    let cancelled = false;
    (async () => {
      try {
        const cached = await cacheGet<DashboardData>(`dashboard_${activeGroup.groupId}`);
        if (cancelled) return;
        if (cached) {
          // Só hidrata se ainda não temos data — evita sobrescrever fetch
          // que já completou antes do cache resolver (race benigna).
          setData(prev => prev ?? cached);
          setLoading(false);
        }
      } catch { /* cache indisponível: deixa loadData rodar normal */ }
    })();
    return () => { cancelled = true; };
  }, [activeGroup?.groupId]);

  // Reload every time tab gains focus. Loading só toggla pra true via init
  // state ou se loadData precisar — refetches em returning user são silenciosos.
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Live update: re-fetch when a notification is created/updated so the
  // badge count + pending lists stay fresh without manual pull-to-refresh.
  useEffect(() => subscribeToNotifications(userId, loadData), [userId, loadData]);

  return { data, loading, error, refresh: loadData };
}
