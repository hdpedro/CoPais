/**
 * Semana — Native weekly digest.
 *
 * Replaces the previous PWAWebView wrapper with a real native screen that
 * mirrors the data sources of `src/app/(app)/semana/page.tsx` (PWA):
 *   - group_members + profiles → parent colors / names
 *   - children → filter chips
 *   - custody_events → who has the kids each day (custody bar in week strip)
 *   - calendar_occurrences + child_activities → atividades das crianças
 *   - events → eventos sociais do dia
 *   - illness_episodes (active) → alerta de saúde do dia
 *   - active_medications → KPI / alerta
 *   - medical_appointments (scheduled, this week) → consultas
 *
 * Same Supabase backend / RLS; no API endpoints needed for this read-only view.
 *
 * Brazilian convention: weekStart = Monday, weekEnd = Sunday.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from 'src/lib/supabase';
import { useAuth } from 'src/store/auth';
import {
  PARENT_COLORS, getDisplayName, getBrazilToday, formatDateKey,
} from 'src/lib/constants';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import EmptyState from 'src/components/ui/EmptyState';
import { withTimeout, TimeoutError } from 'src/lib/with-timeout';
import { reportError } from 'src/lib/error-reporter';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { useI18n } from 'src/i18n';
import { useIntl } from 'src/lib/intl';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

/* ─── Types ─── */
interface Member { userId: string; name: string; color: string }
interface Child { id: string; full_name: string }
interface CustodySpan {
  responsibleUserId: string;
  childId: string | null;
  startDate: string;
  endDate: string;
  custodyType: string | null;
}
interface Activity {
  id: string;
  date: string;
  name: string;
  category: string;
  childId: string | null;
  childName: string;
  time: string | null;
  location: string | null;
}
interface SocialEv {
  id: string;
  date: string;
  title: string;
  time: string | null;
  location: string | null;
  childId: string | null;
}
interface Appt {
  id: string;
  date: string;
  title: string;
  childId: string | null;
  childName: string;
}
interface Illness {
  id: string;
  title: string;
  childId: string | null;
  childName: string;
}
interface Med {
  id: string;
  name: string;
  childId: string | null;
  childName: string;
}

interface WeekDay {
  dateKey: string;
  dayNum: number;
  initial: string;       // S/T/Q/Q/S/S/D
  fullLabel: string;     // Seg, Ter…
  isToday: boolean;
  isPast: boolean;
}

interface SemanaData {
  weekDays: WeekDay[];
  weekStartKey: string;
  weekEndKey: string;
  members: Member[];
  children: Child[];
  custodyByDay: Record<string, { responsibleId: string; color: string; responsibleName: string; custodyType: string | null }>;
  activitiesByDay: Record<string, Activity[]>;
  eventsByDay: Record<string, SocialEv[]>;
  apptsByDay: Record<string, Appt[]>;
  activeIllnesses: Illness[];
  activeMeds: Med[];
}

/** Locale-aware Intl formatters (bound to the active locale at call site). */
type IntlFns = ReturnType<typeof useIntl>;

/* ─── Date helpers ─── */
/**
 * Returns the PREVIOUS full Monday→Sunday week (paridade PWA
 * `src/app/(app)/semana/page.tsx`). The dashboard card is labeled
 * "Análise da última semana" — user expects last week's data.
 *
 * Algorithm:
 *   weekEnd   = most recent Sunday (today if today is Sunday)
 *   weekStart = weekEnd - 6 days (that Monday)
 *
 * Examples (todayDow):
 *   Sun (0)  → range = Mon..Sun = this past week ending today
 *   Mon (1)  → range = previous Mon..Sun (week that ended yesterday)
 *   Wed (3)  → range = previous Mon..Sun (most recent finished week)
 *   Sat (6)  → range = previous Mon..Sun (most recent finished week)
 */
function getLastWeek(): { start: Date; end: Date } {
  const todayStr = getBrazilToday();
  const [y, m, d] = todayStr.split('-').map(Number);
  const today = new Date(y, m - 1, d, 12, 0, 0);
  const dow = today.getDay(); // 0 Sun..6 Sat
  const end = new Date(today);
  end.setDate(end.getDate() - (dow === 0 ? 0 : dow));
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { start, end };
}

function buildWeekDays(start: Date, todayStr: string, intl: IntlFns): WeekDay[] {
  const out: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = formatDateKey(d);
    const short = intl.formatWeekdayShort(d); // Seg, Ter… (locale-aware)
    out.push({
      dateKey: key,
      dayNum: d.getDate(),
      initial: short.charAt(0).toUpperCase(),
      fullLabel: short,
      isToday: key === todayStr,
      isPast: key < todayStr,
    });
  }
  return out;
}

// "Segunda, 8 de abril" — weekday + day + month, locale-aware.
function formatLongDate(dateKey: string, intl: IntlFns): string {
  return intl.formatDate(dateKey, { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ─── Screen ─── */
export default function SemanaScreen() {
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const { activeGroup, userId } = useAuth();
  const [data, setData] = useState<SemanaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // null = all week
  const [childFilter, setChildFilter] = useState<string | null>(null); // null = all children

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const groupId = activeGroup.groupId;
    const { start, end } = getLastWeek();
    const weekStartKey = formatDateKey(start);
    const weekEndKey = formatDateKey(end);
    const todayStr = getBrazilToday();

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const [
        { data: memberRows },
        { data: childRows },
        { data: custodyRows },
        { data: occurrenceRows },
        { data: socialRows },
        { data: apptRows },
        { data: illnessRows },
        { data: medRows },
      ] = await withTimeout(Promise.all([
        supabase.from('group_members')
          .select('user_id, profiles(full_name, display_name, email)')
          .eq('group_id', groupId)
          .order('joined_at')
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('children')
          .select('id, full_name')
          .eq('group_id', groupId)
          .order('birth_date')
          .then(r => r, () => ({ data: [] as never[] })),
        activeGroup.custodyEnabled
          ? supabase.from('custody_events')
              .select('id, start_date, end_date, responsible_user_id, child_id, custody_type')
              .eq('group_id', groupId)
              .gte('end_date', weekStartKey)
              .lte('start_date', weekEndKey)
              .then(r => r, () => ({ data: [] as never[] }))
          : Promise.resolve({ data: [] as never[] }),
        supabase.from('calendar_occurrences')
          .select('id, occurrence_date, activity_id, child_activities(id, name, category, child_id, time_start, location, children(full_name))')
          .eq('group_id', groupId)
          .gte('occurrence_date', weekStartKey)
          .lte('occurrence_date', weekEndKey)
          .limit(200)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('events')
          .select('id, title, event_date, event_time, location, child_id')
          .eq('group_id', groupId)
          .gte('event_date', weekStartKey)
          .lte('event_date', weekEndKey)
          .limit(100)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('medical_appointments')
          .select('id, title, appointment_date, child_id, status, children(full_name)')
          .eq('group_id', groupId)
          .eq('status', 'scheduled')
          .gte('appointment_date', weekStartKey)
          .lte('appointment_date', weekEndKey + 'T23:59:59')
          .limit(20)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('illness_episodes')
          .select('id, title, child_id, status, children(full_name)')
          .eq('group_id', groupId)
          .eq('status', 'active')
          .limit(20)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('active_medications')
          .select('id, name, child_id, status, children(full_name)')
          .eq('group_id', groupId)
          .eq('status', 'active')
          .limit(20)
          .then(r => r, () => ({ data: [] as never[] })),
      ]), 15_000, 'semana:load:mainQueries');

      // Members + colors (sage / terracota — same convention as calendário)
      // firstOnly: chip de membro com cor é compacto, primeiro nome basta.
      const members: Member[] = (memberRows || []).map((m: any, i: number) => {
        const p = m.profiles || {};
        const raw = p.display_name
          || getDisplayName(p.full_name, true)
          || (p.email ? p.email.split('@')[0].split('.')[0] : '')
          || t('weeklyReview.partnerFallback');
        const name = raw.charAt(0).toUpperCase() + raw.slice(1);
        return {
          userId: m.user_id,
          name,
          color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
        };
      });

      const children: Child[] = (childRows || []) as Child[];

      // Expand custody spans into per-day records (clipped to this week).
      const custodyByDay: Record<string, { responsibleId: string; color: string; responsibleName: string; custodyType: string | null }> = {};
      const spans: CustodySpan[] = (custodyRows || []).map((c: any) => ({
        responsibleUserId: c.responsible_user_id,
        childId: c.child_id,
        startDate: c.start_date,
        endDate: c.end_date,
        custodyType: c.custody_type || null,
      }));
      for (const span of spans) {
        const sd = new Date(span.startDate + 'T12:00:00');
        const ed = new Date(span.endDate + 'T12:00:00');
        for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
          const key = formatDateKey(d);
          if (key < weekStartKey || key > weekEndKey) continue;
          // Only set once — first responsible wins (mirrors PWA last-write-wins, identical net effect for simple schedules)
          if (custodyByDay[key]) continue;
          const member = members.find(m => m.userId === span.responsibleUserId);
          custodyByDay[key] = {
            responsibleId: span.responsibleUserId,
            color: member?.color || colors.textMuted,
            responsibleName: member?.name || t('weeklyReview.responsibleFallback'),
            custodyType: span.custodyType,
          };
        }
      }

      // Activities (calendar_occurrences → child_activities)
      const activitiesByDay: Record<string, Activity[]> = {};
      for (const o of (occurrenceRows || []) as any[]) {
        const act = o.child_activities;
        if (!act) continue;
        const dateKey: string = o.occurrence_date;
        const childName = getDisplayName(act.children?.full_name);
        const a: Activity = {
          id: o.id,
          date: dateKey,
          name: act.name || '',
          category: act.category || 'other',
          childId: act.child_id || null,
          childName,
          time: act.time_start ? String(act.time_start).slice(0, 5) : null,
          location: act.location || null,
        };
        if (!activitiesByDay[dateKey]) activitiesByDay[dateKey] = [];
        activitiesByDay[dateKey].push(a);
      }

      // Sort each day's activities by time (nulls last)
      Object.keys(activitiesByDay).forEach(k => {
        activitiesByDay[k].sort((x, y) => {
          if (!x.time && !y.time) return x.name.localeCompare(y.name);
          if (!x.time) return 1;
          if (!y.time) return -1;
          return x.time.localeCompare(y.time);
        });
      });

      // Social events
      const eventsByDay: Record<string, SocialEv[]> = {};
      for (const e of (socialRows || []) as any[]) {
        const dateKey: string = e.event_date;
        const ev: SocialEv = {
          id: e.id,
          date: dateKey,
          title: e.title,
          time: e.event_time ? String(e.event_time).slice(0, 5) : null,
          location: e.location || null,
          childId: e.child_id || null,
        };
        if (!eventsByDay[dateKey]) eventsByDay[dateKey] = [];
        eventsByDay[dateKey].push(ev);
      }

      // Medical appointments
      const apptsByDay: Record<string, Appt[]> = {};
      for (const a of (apptRows || []) as any[]) {
        const dateKey: string = String(a.appointment_date).slice(0, 10);
        const appt: Appt = {
          id: a.id,
          date: dateKey,
          title: a.title || t('weeklyReview.appointmentFallback'),
          childId: a.child_id || null,
          childName: getDisplayName(a.children?.full_name),
        };
        if (!apptsByDay[dateKey]) apptsByDay[dateKey] = [];
        apptsByDay[dateKey].push(appt);
      }

      // Active illnesses / meds (no date — apply globally to today/future)
      const activeIllnesses: Illness[] = (illnessRows || []).map((i: any) => ({
        id: i.id,
        title: i.title || t('weeklyReview.illnessFallback'),
        childId: i.child_id || null,
        childName: getDisplayName(i.children?.full_name),
      }));
      const activeMeds: Med[] = (medRows || []).map((m: any) => ({
        id: m.id,
        name: m.name || t('weeklyReview.medicationFallback'),
        childId: m.child_id || null,
        childName: getDisplayName(m.children?.full_name),
      }));
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const weekDays = buildWeekDays(start, todayStr, intl);

      setData({
        weekDays,
        weekStartKey,
        weekEndKey,
        members,
        children,
        custodyByDay,
        activitiesByDay,
        eventsByDay,
        apptsByDay,
        activeIllnesses,
        activeMeds,
      });
    } catch (e) {
      // TimeoutError ja foi logado como 'info' pelo withTimeout. Outros
      // viram 'error' — antes era silent fail (zero telemetria).
      if (!(e instanceof TimeoutError)) {
        reportError(e, { severity: 'error', filePath: 'semana.load' }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [activeGroup, t, intl]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }, [load]);

  const todayStr = getBrazilToday();

  // ─── Filter helpers ───
  const showChild = useCallback((childId: string | null): boolean => {
    if (!childFilter) return true;
    return childId === childFilter;
  }, [childFilter]);

  // Days to render in the digest section
  const daysToRender = useMemo<WeekDay[]>(() => {
    if (!data) return [];
    if (selectedDay) return data.weekDays.filter(d => d.dateKey === selectedDay);
    return data.weekDays;
  }, [data, selectedDay]);

  // Has any rows for the rendered range, after applying filters?
  const hasAnyContent = useMemo<boolean>(() => {
    if (!data) return false;
    return daysToRender.some(d => {
      const acts = (data.activitiesByDay[d.dateKey] || []).filter(a => showChild(a.childId));
      const evs = (data.eventsByDay[d.dateKey] || []).filter(e => showChild(e.childId));
      const ap = (data.apptsByDay[d.dateKey] || []).filter(a => showChild(a.childId));
      return acts.length > 0 || evs.length > 0 || ap.length > 0 || !!data.custodyByDay[d.dateKey];
    });
  }, [data, daysToRender, showChild]);

  if (!activeGroup) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('schedule.headerTitle')} showBack={false} />
        <View style={{ padding: spacing.lg }}>
          <EmptyState icon="calendar-outline" title={t('empty.semanaNoGroup.title')} description={t('empty.semanaNoGroup.description')} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={t('schedule.headerTitle')}
        showBack={false}
        rightAction={{ icon: 'calendar-outline', onPress: () => router.push('/(tabs)/calendario') }}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && !data ? (
          <View style={{ padding: spacing.lg }}>
            <SkeletonList count={5} />
          </View>
        ) : !data ? null : (
          <>
            {/* Week range subtitle */}
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                {(() => {
                  // weekStartKey = Monday, weekEndKey = Sunday (Brazilian convention).
                  // Locale-aware weekday + day + short month for each endpoint.
                  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
                  return `${intl.formatDate(data.weekStartKey, opts)} — ${intl.formatDate(data.weekEndKey, opts)}`;
                })()}
              </Text>
            </View>

            {/* ─── Week strip ─── */}
            <View style={{
              marginHorizontal: spacing.lg, marginTop: spacing.md,
              backgroundColor: colors.bgElevated, borderRadius: radius.xl,
              padding: spacing.md, ...shadows.sm,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {data.weekDays.map(day => {
                  const custody = data.custodyByDay[day.dateKey];
                  const acts = (data.activitiesByDay[day.dateKey] || []).filter(a => showChild(a.childId));
                  const evs = (data.eventsByDay[day.dateKey] || []).filter(e => showChild(e.childId));
                  const ap = (data.apptsByDay[day.dateKey] || []).filter(a => showChild(a.childId));
                  const totalEvents = acts.length + evs.length + ap.length;
                  const isSelected = selectedDay === day.dateKey;

                  return (
                    <TouchableOpacity
                      key={day.dateKey}
                      testID={`semana-day-${day.dateKey}`}
                      activeOpacity={0.7}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDay(isSelected ? null : day.dateKey);
                      }}
                      style={{
                        flex: 1,
                        marginHorizontal: 1,
                        paddingVertical: spacing.sm,
                        borderRadius: radius.md,
                        alignItems: 'center',
                        backgroundColor: isSelected
                          ? colors.brand
                          : day.isToday
                            ? colors.brandGlow
                            : 'transparent',
                        opacity: !isSelected && day.isPast ? 0.45 : 1,
                      }}
                    >
                      <Text style={{
                        fontSize: 9,
                        fontWeight: font.weights.bold,
                        color: isSelected ? 'rgba(255,255,255,0.75)' : colors.textMuted,
                        letterSpacing: 0.5,
                      }}>
                        {day.fullLabel.toUpperCase()}
                      </Text>
                      <Text style={{
                        fontSize: font.sizes.lg,
                        fontWeight: font.weights.bold,
                        color: isSelected ? '#fff' : day.isToday ? colors.brand : colors.text,
                        marginTop: 2,
                      }}>
                        {day.dayNum}
                      </Text>

                      {/* indicator row */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, height: 8 }}>
                        {custody ? (
                          <View style={{
                            width: 14, height: 3, borderRadius: 2,
                            backgroundColor: isSelected ? '#fff' : custody.color,
                          }} />
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2, height: 6 }}>
                        {totalEvents > 0 ? (
                          <View style={{
                            width: 4, height: 4, borderRadius: 2,
                            backgroundColor: isSelected ? '#fff' : colors.accent,
                          }} />
                        ) : null}
                        {totalEvents > 1 ? (
                          <View style={{
                            width: 4, height: 4, borderRadius: 2,
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.6)' : colors.secondary,
                          }} />
                        ) : null}
                        {totalEvents > 3 ? (
                          <View style={{
                            width: 4, height: 4, borderRadius: 2,
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.4)' : colors.textMuted,
                          }} />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Members legend */}
              {data.members.length > 0 ? (
                <View style={{
                  flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
                  marginTop: spacing.sm, paddingTop: spacing.sm,
                  borderTopWidth: 0.5, borderTopColor: colors.borderLight,
                }}>
                  {data.members.map(m => (
                    <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                      <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                        {m.name}{m.userId === userId ? ` ${t('weeklyReview.youSuffix')}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* ─── Filters ─── */}
            {(data.children.length > 1 || selectedDay) ? (
              <View style={{
                paddingHorizontal: spacing.lg, marginTop: spacing.md,
              }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  {selectedDay ? (
                    <FilterChip
                      label={t('weeklyReview.allWeek')}
                      icon="calendar-outline"
                      selected={false}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDay(null);
                      }}
                    />
                  ) : null}
                  {data.children.length > 1 ? (
                    <>
                      <FilterChip
                        label={t('weeklyReview.allChildren')}
                        selected={childFilter === null}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setChildFilter(null);
                        }}
                      />
                      {data.children.map(c => (
                        <FilterChip
                          key={c.id}
                          label={getDisplayName(c.full_name)}
                          selected={childFilter === c.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setChildFilter(childFilter === c.id ? null : c.id);
                          }}
                        />
                      ))}
                    </>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}

            {/* ─── Health alerts (active illnesses + meds) ─── */}
            {(data.activeIllnesses.length > 0 || data.activeMeds.length > 0) ? (
              <View style={{
                marginHorizontal: spacing.lg, marginTop: spacing.md,
                backgroundColor: colors.bgElevated, borderRadius: radius.xl,
                padding: spacing.md, ...shadows.sm,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                  <Ionicons name="medkit-outline" size={16} color={colors.error} />
                  <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                    {t('weeklyReview.healthAttention')}
                  </Text>
                </View>
                {data.activeIllnesses.filter(i => showChild(i.childId)).map(i => (
                  <View key={i.id} style={{
                    paddingVertical: spacing.sm,
                    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error }} />
                    <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text }}>
                      {i.title}{i.childName ? ` — ${i.childName}` : ''}
                    </Text>
                  </View>
                ))}
                {data.activeMeds.filter(m => showChild(m.childId)).map(m => (
                  <View key={m.id} style={{
                    paddingVertical: spacing.sm,
                    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.info }} />
                    <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text }}>
                      {t('weeklyReview.activeMedication', { name: m.name })}{m.childName ? ` — ${m.childName}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* ─── Sections per day ─── */}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.md }}>
              {daysToRender.map(day => {
                const custody = data.custodyByDay[day.dateKey];
                const acts = (data.activitiesByDay[day.dateKey] || []).filter(a => showChild(a.childId));
                const evs = (data.eventsByDay[day.dateKey] || []).filter(e => showChild(e.childId));
                const ap = (data.apptsByDay[day.dateKey] || []).filter(a => showChild(a.childId));
                const empty = !custody && acts.length === 0 && evs.length === 0 && ap.length === 0;
                if (empty && selectedDay === null && day.isPast) {
                  // Skip empty past days in "all week" mode for compactness
                  return null;
                }

                return (
                  <View
                    key={day.dateKey}
                    style={{
                      backgroundColor: colors.bgElevated,
                      borderRadius: radius.xl,
                      padding: spacing.md,
                      ...shadows.sm,
                      opacity: !selectedDay && day.isPast ? 0.7 : 1,
                    }}
                  >
                    {/* Day header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                      <Text style={{
                        fontSize: font.sizes.md,
                        fontWeight: font.weights.bold,
                        color: day.isToday ? colors.brand : colors.text,
                      }}>
                        {day.isToday ? `${t('checkin.today')} · ` : ''}{formatLongDate(day.dateKey, intl)}
                      </Text>
                      {day.dateKey === todayStr ? (
                        <View style={{
                          paddingHorizontal: spacing.sm, paddingVertical: 2,
                          borderRadius: radius.full, backgroundColor: colors.brandGlow,
                        }}>
                          <Text style={{ fontSize: 9, fontWeight: font.weights.bold, color: colors.brand, letterSpacing: 0.5 }}>
                            {t('weeklyReview.todayBadge')}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Custódia */}
                    {custody ? (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                        paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
                        borderRadius: radius.md, backgroundColor: `${custody.color}10`,
                        marginBottom: spacing.sm,
                      }}>
                        <View style={{ width: 4, height: 24, borderRadius: 2, backgroundColor: custody.color }} />
                        <Ionicons name="people-outline" size={14} color={custody.color} />
                        <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
                          {t('weeklyReview.withPerson', { name: custody.responsibleId === userId ? t('weeklyReview.you') : custody.responsibleName })}
                          {custody.custodyType && custody.custodyType !== 'regular' ? ` · ${custody.custodyType}` : ''}
                        </Text>
                      </View>
                    ) : null}

                    {/* Atividades das crianças */}
                    {acts.length > 0 ? (
                      <SectionTitle icon="🎨" label={t('weeklyReview.sectionActivities')} />
                    ) : null}
                    {acts.map(a => (
                      <DigestRow
                        key={`act-${a.id}`}
                        testID={`semana-event-${a.id}`}
                        title={a.name}
                        subtitle={[a.childName, a.location].filter(Boolean).join(' · ')}
                        time={a.time}
                        accent={colors.accent}
                      />
                    ))}

                    {/* Eventos sociais */}
                    {evs.length > 0 ? (
                      <SectionTitle icon="🎯" label={t('weeklyReview.sectionEvents')} />
                    ) : null}
                    {evs.map(e => (
                      <DigestRow
                        key={`ev-${e.id}`}
                        testID={`semana-event-${e.id}`}
                        title={e.title}
                        subtitle={e.location || undefined}
                        time={e.time}
                        accent={colors.secondary}
                      />
                    ))}

                    {/* Consultas médicas */}
                    {ap.length > 0 ? (
                      <SectionTitle icon="🩺" label={t('weeklyReview.sectionAppointments')} />
                    ) : null}
                    {ap.map(a => (
                      <DigestRow
                        key={`ap-${a.id}`}
                        testID={`semana-event-${a.id}`}
                        title={a.title}
                        subtitle={a.childName || undefined}
                        time={null}
                        accent={colors.info}
                      />
                    ))}

                    {empty ? (
                      <Text style={{
                        fontSize: font.sizes.xs, color: colors.textMuted,
                        fontStyle: 'italic', paddingVertical: spacing.xs,
                      }}>
                        {t('weeklyReview.noRecords')}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* Empty week state (after filters too) */}
            {!hasAnyContent ? (
              <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <EmptyState
                  icon="🌿"
                  title={t('empty.semana.title')}
                  description={
                    childFilter
                      ? t('empty.semana.descriptionFiltered')
                      : t('empty.semana.description')
                  }
                  action={{ label: t('empty.semana.actionLabel'), onPress: () => router.push('/(tabs)/calendario') }}
                />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ─── Sub-components ─── */

function FilterChip({
  label, icon, selected, onPress,
}: {
  label: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
        borderRadius: radius.full,
        backgroundColor: selected ? colors.brand : colors.bgElevated,
        borderWidth: 1, borderColor: selected ? colors.brand : colors.borderLight,
      }}
    >
      {icon ? (
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={12} color={selected ? '#fff' : colors.textSecondary} />
      ) : null}
      <Text style={{
        fontSize: font.sizes.xs,
        fontWeight: font.weights.semibold,
        color: selected ? '#fff' : colors.textSecondary,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SectionTitle({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, marginBottom: 4 }}>
      <Text style={{ fontSize: 12 }}>{icon}</Text>
      <Text style={{
        fontSize: 10, fontWeight: font.weights.bold,
        color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase',
      }}>
        {label}
      </Text>
    </View>
  );
}

function DigestRow({
  title, subtitle, time, accent, testID,
}: {
  title: string;
  subtitle?: string;
  time: string | null;
  accent: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
        paddingVertical: spacing.xs + 2,
      }}
    >
      <View style={{ width: 3, height: 22, borderRadius: 2, backgroundColor: accent }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {time ? (
        <View style={{
          paddingHorizontal: spacing.sm, paddingVertical: 2,
          borderRadius: radius.sm, backgroundColor: colors.bg,
        }}>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, fontWeight: font.weights.semibold }}>
            {time}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
