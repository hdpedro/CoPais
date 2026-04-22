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

import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { PARENT_COLORS, getDisplayName } from '../lib/constants';
import { cacheGet, cacheSet, isOnline } from '../services/offline';

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
  status: 'healthy' | 'monitoring' | 'treatment';
  detail: string;
}

interface ChildCard {
  id: string;
  fullName: string;
  firstName: string;
  age: number;
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

interface DashboardData {
  // Greeting
  greeting: 'morning' | 'afternoon' | 'evening';
  firstName: string;
  formattedDate: string;

  // Custody
  custodyChildren: CustodyChild[];
  hasCustody: boolean;

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
          .select('id, full_name, birth_date')
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
        supabase.from('calendar_occurrences')
          .select('id, activity_id, occurrence_date, child_activities(id, name, category, time_start, time_end, location, children(full_name))')
          .eq('group_id', groupId)
          .eq('occurrence_date', today)
          .eq('status', 'active')
          .limit(20)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('calendar_occurrences')
          .select('id, activity_id, occurrence_date, child_activities(id, name, category, time_start, time_end, location, children(full_name))')
          .eq('group_id', groupId)
          .eq('occurrence_date', tomorrowStr)
          .eq('status', 'active')
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

      // Build custody children
      const custodyChildren: CustodyChild[] = (custodyEvents || []).map((e: any) => {
        const member = memberList.find((m: any) => m.user_id === e.responsible_user_id);
        return {
          childFirstName: getDisplayName(e.children?.full_name),
          responsibleName: member?.name || getDisplayName(e.profiles?.full_name),
          isWithMe: e.responsible_user_id === userId,
          color: member?.color || PARENT_COLORS.primary,
        };
      });

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

      // Child cards
      const childCards: ChildCard[] = (children || []).map((c: any) => {
        const bd = new Date(c.birth_date + 'T12:00:00');
        const ageDiff = Date.now() - bd.getTime();
        const age = Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000));
        return {
          id: c.id,
          fullName: c.full_name,
          firstName: getDisplayName(c.full_name),
          age,
        };
      });

      // Health summaries per child
      const childHealthSummaries: ChildHealthSummary[] = childCards.map(child => {
        const hasIllness = (illnessData || []).some((i: any) => i.child_id === child.id);
        const hasMed = (medsData || []).some((m: any) => m.child_id === child.id);
        const status: 'healthy' | 'monitoring' | 'treatment' =
          hasIllness ? 'treatment' : hasMed ? 'monitoring' : 'healthy';
        const detail = hasIllness
          ? (illnessData || []).find((i: any) => i.child_id === child.id)?.title || 'Doente'
          : hasMed
            ? (medsData || []).find((m: any) => m.child_id === child.id)?.name || 'Medicado'
            : 'Saudavel';
        return { childId: child.id, childName: child.firstName, status, detail };
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

      const dashData: DashboardData = {
        greeting: getGreeting(),
        firstName: getDisplayName(profile?.full_name),
        formattedDate: formatDate(),
        custodyChildren,
        hasCustody: custodyChildren.length > 0,
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

  return { data, loading, error, refresh: loadData };
}
