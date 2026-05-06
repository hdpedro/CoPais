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
import { signChildAvatar } from '../services/children';
import { PARENT_COLORS, getDisplayName } from '../lib/constants';
import { cacheGet, cacheSet, isOnline } from '../services/offline';
import { subscribeToNotifications } from '../services/notifications';

interface CustodyChild {
  childFirstName: string;
  responsibleName: string;
  isWithMe: boolean;
  color: string;
}

interface ActivityItem {
  id: string;
  name: string;
  category: string;
  childName: string;
  timeStr: string;
  location: string;
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
  requesterName: string;
  originalDate: string;
  proposedDate: string | null;
  reason: string | null;
  type: string;
  createdAt: string;
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

  // Children cards
  childCards: ChildCard[];

  // Health summaries
  childHealthSummaries: ChildHealthSummary[];
  hasAnyCriticalChild: boolean;

  // Pending activity reports
  pendingReports: PendingReport[];
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
    if (!userId || !activeGroup) return;
    const groupId = activeGroup.groupId;
    const cacheKey = `dashboard_${groupId}`;

    // Try cache first when offline
    if (!isOnline()) {
      const cached = await cacheGet<DashboardData>(cacheKey);
      if (cached) { setData(cached); setLoading(false); return; }
    }

    try {
      const today = formatDateKey(new Date());
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = formatDateKey(tomorrow);

      // All queries in parallel (resilient — each with fallback)
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
      ] = await Promise.all([
        supabase.from('group_members')
          .select('user_id, role, profiles(full_name)')
          .eq('group_id', groupId)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('children')
          .select('id, full_name, birth_date, photo_url')
          .eq('group_id', groupId)
          .then(r => r, () => ({ data: [] as never[] })),
        activeGroup.custodyEnabled
          ? supabase.from('custody_events')
              .select('id, start_date, end_date, responsible_user_id, child_id, custody_type, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)')
              .eq('group_id', groupId)
              .lte('start_date', today)
              .gte('end_date', today)
              .then(r => r, () => ({ data: [] as never[] }))
          : Promise.resolve({ data: [] as never[] }),
        // calendar_occurrences has NO status column (migration 00038); filtering
        // .eq('status','active') silently returned 0 rows and hid the day card.
        // Same query shape as line 354 below — kept consistent on purpose.
        supabase.from('calendar_occurrences')
          .select('id, activity_id, occurrence_date, child_activities(id, name, category, time_start, time_end, location, children(full_name))')
          .eq('group_id', groupId)
          .eq('occurrence_date', today)
          .limit(20)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('calendar_occurrences')
          .select('id, activity_id, occurrence_date, child_activities(id, name, category, time_start, time_end, location, children(full_name))')
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
        // Active medications
        supabase.from('active_medications')
          .select('id, name, child_id, children(full_name)')
          .eq('group_id', groupId)
          .eq('status', 'active')
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
      ]);

      // Build member color map
      const memberList = (members || []).map((m: any, i: number) => ({
        user_id: m.user_id,
        name: getDisplayName(m.profiles?.full_name),
        color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
      }));

      // Resolve duplicate today-coverage (regular range + swap single-day).
      // When both rows are returned for the same child + date, the swap row
      // is the source of truth. Reduce to one entry per child where swap
      // wins over regular (matches PWA `buildCustodyMap` precedence rule).
      const customSorted = ((custodyEvents || []) as any[]).slice().sort((a, b) => {
        const aSwap = a.custody_type === 'swap' ? 1 : 0;
        const bSwap = b.custody_type === 'swap' ? 1 : 0;
        return bSwap - aSwap; // swap first
      });
      const seenChild = new Set<string>();
      const dedupedToday: any[] = [];
      for (const ev of customSorted) {
        const cid = ev.child_id || '__no_child__';
        if (seenChild.has(cid)) continue;
        seenChild.add(cid);
        dedupedToday.push(ev);
      }

      // Build custody children
      const custodyChildren: CustodyChild[] = dedupedToday.map((e: any) => {
        const member = memberList.find((m: any) => m.user_id === e.responsible_user_id);
        return {
          childFirstName: getDisplayName(e.children?.full_name),
          responsibleName: member?.name || getDisplayName(e.profiles?.full_name),
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
        const startDate = new Date(ce.start_date + 'T12:00:00');
        const endDate = new Date(ce.end_date + 'T12:00:00');
        const todayDate = new Date(today + 'T12:00:00');
        streakDays = Math.max(1, Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000) + 1);
        streakTotal = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);

        // end_date + 1 day = next swap day
        const next = new Date(endDate);
        next.setDate(next.getDate() + 1);
        const weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
        const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        nextSwapLabel = `${weekdays[next.getDay()]} ${next.getDate()}/${months[next.getMonth()]}`;

        // Find who takes custody after end_date by looking at the next event
        // (heuristic: the OTHER parent — we only show the name of whoever isn't current)
        const currentResponsible = ce.responsible_user_id;
        const otherMember = memberList.find(m => m.user_id !== currentResponsible);
        if (otherMember) nextSwapPerson = otherMember.name.toUpperCase();

        const custodyType = ce.custody_type || 'regular';
        const dayOfWeekPt = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][endDate.getDay()];
        endDateLabel = `${custodyType} - ${dayOfWeekPt}`;
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

      // Pending activity reports: for each recurring activity, find occurrences
      // in the last 7 days (excluding today) that have no activity_report row.
      const pendingReports: PendingReport[] = [];
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = formatDateKey(weekAgo);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatDateKey(yesterday);

        const [{ data: pastOccs }, { data: existingReports }] = await Promise.all([
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
        ]);

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

      // Map occurrences to ActivityItems
      const mapOccurrences = (occs: any[]): ActivityItem[] =>
        (occs || []).map((o: any) => {
          const act = o.child_activities;
          return {
            id: act?.id || o.activity_id,
            name: act?.name || '',
            category: act?.category || 'other',
            childName: getDisplayName(act?.children?.full_name),
            timeStr: act?.time_start ? act.time_start.slice(0, 5) : '',
            location: act?.location || '',
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
      await Promise.all(signTasks);

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

      // Build actionable pending lists
      const pendingSwapsList: PendingSwap[] = (pendingSwapsData || []).map((s: any) => ({
        id: s.id,
        requesterName: getDisplayName(s.profiles?.full_name) || 'Co-responsavel',
        originalDate: s.original_date,
        proposedDate: s.proposed_date,
        reason: s.reason,
        type: s.type || 'swap',
        createdAt: s.created_at,
      }));

      // Decisions — filter out those the user already voted on
      const openDecisionList = (openDecisions || []) as any[];
      const openDecisionIds = openDecisionList.map((d: any) => d.id);
      let votedIds = new Set<string>();
      if (openDecisionIds.length > 0) {
        const { data: votes } = await supabase
          .from('decision_votes')
          .select('decision_id')
          .eq('user_id', userId)
          .in('decision_id', openDecisionIds);
        votedIds = new Set((votes || []).map((v: any) => v.decision_id));
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
        paidByName: getDisplayName(e.profiles?.full_name) || 'Co-responsavel',
      }));

      const hasAnyCriticalChild = childHealthSummaries.some(s => s.status === 'treatment');

      // Prefer display_name → full_name's first word → email prefix (never the raw email)
      const displayFirst = profile?.display_name
        || getDisplayName(profile?.full_name)
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
        todayActivities: mapOccurrences(todayOccurrences || []),
        tomorrowActivities: mapOccurrences(tomorrowOccurrences || []),
        members: memberList,
        groupName: activeGroup.groupName || 'Familia',
        memberCount: memberList.length,
        unreadNotifications: (notifications as any)?.count || 0,
        pendingExpenses: pendingExpensesList.length,
        pendingDecisions: pendingDecisionsList.length,
        balance: (myTotal - otherTotal) / 2,
        pendingSwaps: pendingSwapsList.length,
        pendingSwapsList,
        pendingDecisionsList,
        pendingExpensesList,
        childCards,
        childHealthSummaries,
        hasAnyCriticalChild,
        pendingReports,
      };
      setData(dashData);
      cacheSet(cacheKey, dashData);
      setError(null);
    } catch {
      setError('Erro ao carregar dados');
    } finally {
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
