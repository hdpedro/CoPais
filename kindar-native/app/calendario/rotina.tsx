/**
 * Editor de Rotina de Leva & Busca — porte native do RoutineBuilder do PWA
 * (`src/app/(app)/calendario/rotina/RoutineBuilder.tsx`).
 *
 * Grade semanal por (criança, dia, perna leva/busca). 3 modos: weekly /
 * custody_based ("segue a guarda") / alternating_week (Semana A·B). Salva via
 * POST /api/care-routine (op save_grid) — service compartilhado faz upsert +
 * delete-missing (sem clobber). Paridade total com o PWA: mesma lógica de
 * células (`care-routine-cells.ts`, espelho do PWA) e mesmas chaves i18n.
 *
 * Navegado a partir do DashboardHero (editHref '/calendario/rotina').
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { fetchChildren, type Child } from 'src/services/children';
import { apiFetch } from 'src/lib/api-fetch';
import { PARENT_COLORS, getDisplayName } from 'src/lib/constants';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { useIntl } from 'src/lib/intl';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { withTimeout, TimeoutError } from 'src/lib/with-timeout';
import { reportError } from 'src/lib/error-reporter';
import {
  buildRoutineCells,
  mapCells,
  isCellMapEmpty,
  CUSTODY,
  type RoutineGridState,
  type CellMap,
  type LegState,
  type PatternMode,
  type CareRoutineLeg,
} from 'src/lib/care-routine-cells';

interface Member {
  userId: string;
  name: string;
  color: string;
}

/** Linha bruta de care_routine_slots (subset lido pela query). */
interface SlotRow {
  child_id: string;
  weekday: number;
  leg: CareRoutineLeg;
  pattern_type: 'weekly' | 'alternating_week' | 'custody_based';
  week_parity: number | null;
  responsible_id: string | null;
  time_of_day: string | null;
  label: string | null;
}

const WEEKDAYS_CORE = [1, 2, 3, 4, 5]; // Seg–Sex
const WEEKEND = [6, 0]; // Sáb, Dom
// 2024-01-07 é um domingo → index 0 = Dom, alinhado a weekday (getDay/EXTRACT DOW).
const WEEKDAY_REF_DATES = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i));

function emptyGrid(): RoutineGridState {
  return { mode: 'weekly', cells: {}, cellsB: {}, dropoffTime: '', pickupTime: '', dropoffLabel: '', pickupLabel: '' };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Formata digitação em HH:MM (sem validar faixa — só máscara). */
function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

function gridFromSlots(slots: SlotRow[], childId: string): RoutineGridState {
  const g = emptyGrid();
  const cs = slots.filter((s) => s.child_id === childId);
  if (cs.some((s) => s.pattern_type === 'custody_based')) g.mode = 'custody';
  else if (cs.some((s) => s.pattern_type === 'alternating_week')) g.mode = 'alternating';
  for (const s of cs) {
    const target = g.mode === 'alternating' && s.week_parity === 1 ? g.cellsB : g.cells;
    const cell = target[s.weekday] || { dropoff: null, pickup: null };
    cell[s.leg] = g.mode === 'custody' ? CUSTODY : s.responsible_id;
    target[s.weekday] = cell;
    if (s.leg === 'dropoff') {
      if (s.time_of_day && !g.dropoffTime) g.dropoffTime = s.time_of_day.slice(0, 5);
      if (s.label && !g.dropoffLabel) g.dropoffLabel = s.label;
    } else {
      if (s.time_of_day && !g.pickupTime) g.pickupTime = s.time_of_day.slice(0, 5);
      if (s.label && !g.pickupLabel) g.pickupLabel = s.label;
    }
  }
  return g;
}

const MODES: { key: PatternMode; labelKey: string }[] = [
  { key: 'weekly', labelKey: 'careRoutine.patternWeekly' },
  { key: 'custody', labelKey: 'careRoutine.patternCustody' },
  { key: 'alternating', labelKey: 'careRoutine.patternAlternating' },
];

export default function RotinaScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const t = useI18n((s) => s.t);
  const intl = useIntl();
  const toast = useToast();

  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [grids, setGrids] = useState<Record<string, RoutineGridState>>({});
  const [activeWeek, setActiveWeek] = useState<'A' | 'B'>('A');
  const [includeWeekend, setIncludeWeekend] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup || !userId) {
      setLoading(false);
      return;
    }
    try {
      const [childList, memberResp, slotResp] = await withTimeout(
        Promise.all([
          fetchChildren(activeGroup.groupId),
          supabase.from('group_members').select('user_id, role, profiles(full_name, display_name, email)').eq('group_id', activeGroup.groupId),
          supabase
            .from('care_routine_slots')
            .select('child_id, weekday, leg, pattern_type, week_parity, responsible_id, time_of_day, label')
            .eq('group_id', activeGroup.groupId)
            .eq('is_active', true),
        ]),
        15_000,
        'calendario:rotina:mainQueries',
      );

      setChildren(childList);
      const targetChildId = childId || childList[0]?.id || '';
      if (!childId && targetChildId) setChildId(targetChildId);

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const memList: Member[] = ((memberResp.data || []) as any[])
        .filter((m: any) => m.role === 'admin' || m.role === 'member')
        .slice(0, 2)
        .map((m: any, i: number) => {
          const p = m.profiles || {};
          const raw = p.display_name
            || p.full_name?.split(' ')[0]
            || (p.email ? p.email.split('@')[0].split('.')[0] : '')
            || t('nav.member');
          return {
            userId: m.user_id,
            name: raw.charAt(0).toUpperCase() + raw.slice(1),
            color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
          };
        });
      setMembers(memList);

      const slots = (slotResp.data || []) as SlotRow[];
      /* eslint-enable @typescript-eslint/no-explicit-any */
      const nextGrids: Record<string, RoutineGridState> = {};
      for (const c of childList) nextGrids[c.id] = gridFromSlots(slots, c.id);
      setGrids(nextGrids);
      setIncludeWeekend(slots.some((s) => s.weekday === 0 || s.weekday === 6));
    } catch (e) {
      if (!(e instanceof TimeoutError)) {
        reportError(e, { severity: 'error', filePath: 'calendario.rotina.load' }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [activeGroup, userId, childId, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grid = grids[childId] || emptyGrid();
  const days = includeWeekend ? [...WEEKDAYS_CORE, ...WEEKEND] : WEEKDAYS_CORE;
  const activeCells = grid.mode === 'alternating' && activeWeek === 'B' ? grid.cellsB : grid.cells;
  const me = members.find((m) => m.userId === userId) || members[0];
  const other = members.find((m) => m.userId !== userId) || me;

  function nextResp(cur: LegState): LegState {
    if (grid.mode === 'custody') return cur === CUSTODY ? null : CUSTODY;
    if (cur === null) return members[0]?.userId ?? null;
    if (cur === members[0]?.userId && members.length > 1) return members[1].userId;
    return null;
  }

  function patch(updater: (g: RoutineGridState) => RoutineGridState) {
    setGrids((prev) => ({ ...prev, [childId]: updater(prev[childId] || emptyGrid()) }));
    setSaved(false);
  }

  function patchCells(updater: (cells: CellMap) => CellMap) {
    patch((g) => {
      const useB = g.mode === 'alternating' && activeWeek === 'B';
      return useB ? { ...g, cellsB: updater(g.cellsB) } : { ...g, cells: updater(g.cells) };
    });
  }

  function changeMode(m: PatternMode) {
    if (m === grid.mode) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    patch((g) => {
      let cells = g.cells;
      let cellsB = g.cellsB;
      if (m === 'custody') {
        cells = mapCells(cells, (v) => (v ? CUSTODY : null));
        cellsB = {};
      } else if (g.mode === 'custody') {
        cells = mapCells(cells, (v) => (v ? members[0]?.userId ?? null : null));
      }
      if (m !== 'alternating') cellsB = {};
      return { ...g, mode: m, cells, cellsB };
    });
    setActiveWeek('A');
  }

  function cycleCell(weekday: number, leg: CareRoutineLeg) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    patchCells((cells) => {
      const cell = cells[weekday] || { dropoff: null, pickup: null };
      return { ...cells, [weekday]: { ...cell, [leg]: nextResp(cell[leg]) } };
    });
  }

  function cycleFullDay(weekday: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    patchCells((cells) => {
      const cell = cells[weekday] || { dropoff: null, pickup: null };
      const next = nextResp(cell.dropoff);
      return { ...cells, [weekday]: { dropoff: next, pickup: next } };
    });
  }

  function applyPreset(preset: 'iDropYouPick' | 'youDropIPick' | 'alternateFullDay') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    patchCells(() => {
      const cells: CellMap = {};
      WEEKDAYS_CORE.forEach((wd, idx) => {
        if (preset === 'iDropYouPick') cells[wd] = { dropoff: me?.userId ?? null, pickup: other?.userId ?? null };
        else if (preset === 'youDropIPick') cells[wd] = { dropoff: other?.userId ?? null, pickup: me?.userId ?? null };
        else {
          const who = idx % 2 === 0 ? me?.userId ?? null : other?.userId ?? null;
          cells[wd] = { dropoff: who, pickup: who };
        }
      });
      return cells;
    });
  }

  function applyToAllChildren() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGrids((prev) => {
      const out = { ...prev };
      for (const c of children) out[c.id] = JSON.parse(JSON.stringify(grid)) as RoutineGridState;
      return out;
    });
    setSaved(false);
    toast.show({ message: t('careRoutine.applyAllChildren'), variant: 'success' });
  }

  function colorOf(resp: LegState): Member | null {
    return resp && resp !== CUSTODY ? members.find((m) => m.userId === resp) || null : null;
  }

  async function handleSave() {
    if (!activeGroup || !childId) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Sanitiza horários parciais/inválidos → null (coluna `time` rejeitaria,
    // virando erro PG). Campos opcionais; melhor não enviar do que quebrar.
    const safeGrid: RoutineGridState = {
      ...grid,
      dropoffTime: TIME_RE.test(grid.dropoffTime) ? grid.dropoffTime : '',
      pickupTime: TIME_RE.test(grid.pickupTime) ? grid.pickupTime : '',
    };
    const res = await apiFetch('/api/care-routine', {
      method: 'POST',
      body: {
        op: 'save_grid',
        groupId: activeGroup.groupId,
        childId,
        cells: buildRoutineCells(safeGrid, days),
      },
    });
    setSubmitting(false);
    if (res.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      toast.show({ message: t('careRoutine.saved'), variant: 'success' });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('error.careRoutine.saveFailed'), variant: 'error' });
    }
  }

  function dayName(wd: number): string {
    return intl.formatWeekdayShort(WEEKDAY_REF_DATES[wd]);
  }

  function CellButton({ weekday, leg }: { weekday: number; leg: CareRoutineLeg }) {
    const v = activeCells[weekday]?.[leg] ?? null;
    const legLabel = leg === 'dropoff' ? t('careRoutine.dropoff') : t('careRoutine.pickup');

    if (grid.mode === 'custody') {
      const on = v === CUSTODY;
      const who = on ? t('careRoutine.followsGuard') : t('careRoutine.free');
      return (
        <TouchableOpacity
          onPress={() => cycleCell(weekday, leg)}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.careRoutine.cell', { day: dayName(weekday), leg: legLabel, who })}
          style={{
            flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
            borderWidth: 2,
            borderStyle: on ? 'solid' : 'dashed',
            borderColor: on ? 'transparent' : colors.borderLight,
            backgroundColor: on ? colors.brand : colors.bgElevated,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: font.weights.semibold, color: on ? '#fff' : colors.textMuted }}>
            {on ? '🔄' : '+'}
          </Text>
        </TouchableOpacity>
      );
    }

    const m = colorOf(v);
    const who = m ? m.name : t('careRoutine.free');
    return (
      <TouchableOpacity
        onPress={() => cycleCell(weekday, leg)}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.careRoutine.cell', { day: dayName(weekday), leg: legLabel, who })}
        style={{
          flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
          borderWidth: 2,
          borderStyle: m ? 'solid' : 'dashed',
          borderColor: m ? 'transparent' : colors.borderLight,
          backgroundColor: m ? m.color : colors.bgElevated,
          paddingHorizontal: 4,
        }}
      >
        <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: font.weights.semibold, color: m ? '#fff' : colors.textMuted }}>
          {m ? m.name : '+'}
        </Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const Header = (
    <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
      <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </TouchableOpacity>
      <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
        {t('careRoutine.title')}
      </Text>
    </View>
  );

  // Sem co-responsáveis carregados → ainda dá pra montar rotina solo, mas
  // precisamos de pelo menos 1 membro pra colorir células. Estado raro.
  if (members.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {Header}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      {Header}
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 140 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>
          {t('careRoutine.subtitle')}
        </Text>

        {/* Child selector */}
        {children.length > 1 ? (
          <>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>{t('careRoutine.child')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              {children.map((c) => {
                const active = childId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => { setChildId(c.id); setActiveWeek('A'); }}
                    style={{
                      paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                      backgroundColor: active ? colors.brand : colors.bgElevated,
                      borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text }}>
                      {getDisplayName(c.full_name, true)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Recorrência (segmented) */}
        <Card>
          <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.sm }}>{t('careRoutine.recurrence')}</Text>
          <View style={{ flexDirection: 'row', gap: 6, backgroundColor: colors.bg, borderRadius: radius.md, padding: 4 }}>
            {MODES.map((o) => {
              const active = grid.mode === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  onPress={() => changeMode(o.key)}
                  style={{
                    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center',
                    backgroundColor: active ? colors.bgElevated : 'transparent',
                    ...(active ? shadows.sm : {}),
                  }}
                >
                  <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: active ? colors.text : colors.textMuted }}>
                    {t(o.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {grid.mode === 'custody' && <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: spacing.sm }}>{t('careRoutine.custodyHint')}</Text>}
          {grid.mode === 'alternating' && <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: spacing.sm }}>{t('careRoutine.alternatingHint')}</Text>}
        </Card>

        {/* Presets — não fazem sentido em "segue a guarda" */}
        {grid.mode !== 'custody' && (
          <Card>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.sm }}>{t('careRoutine.presetsTitle')}</Text>
            <View style={{ gap: spacing.sm }}>
              {([
                ['iDropYouPick', 'careRoutine.presetIDropYouPick'],
                ['youDropIPick', 'careRoutine.presetYouDropIPick'],
                ['alternateFullDay', 'careRoutine.presetAlternateFullDay'],
              ] as const).map(([key, labelKey]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => applyPreset(key)}
                  style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.md }}
                >
                  <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: colors.text }}>{t(labelKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        {/* Grade */}
        <Card>
          {/* Toggle Semana A/B (só alternating) */}
          {grid.mode === 'alternating' && (
            <View style={{ flexDirection: 'row', gap: 6, backgroundColor: colors.bg, borderRadius: radius.md, padding: 4, marginBottom: spacing.md }}>
              {(['A', 'B'] as const).map((w) => {
                const active = activeWeek === w;
                const empty = isCellMapEmpty(w === 'A' ? grid.cells : grid.cellsB);
                return (
                  <TouchableOpacity
                    key={w}
                    onPress={() => setActiveWeek(w)}
                    style={{
                      flex: 1, paddingVertical: 6, borderRadius: radius.sm, alignItems: 'center',
                      backgroundColor: active ? colors.bgElevated : 'transparent',
                      ...(active ? shadows.sm : {}),
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: active ? colors.text : colors.textMuted }}>
                      {w === 'A' ? t('careRoutine.weekA') : t('careRoutine.weekB')}
                      {empty ? <Text style={{ color: colors.warning, fontWeight: font.weights.normal }}>{`  ${t('careRoutine.weekEmptyTag')}`}</Text> : null}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Legenda */}
          {grid.mode === 'custody' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.brandGlow, borderRadius: radius.md }}>
              <Text style={{ fontSize: 16 }}>🔄</Text>
              <Text style={{ flex: 1, fontSize: font.sizes.xs, color: colors.text }}>{t('careRoutine.custodyHint')}</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, rowGap: spacing.sm, marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.bg, borderRadius: radius.md }}>
              {members.map((m) => (
                <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: m.color }} />
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>
                    {m.name}{m.userId === userId ? ` ${t('careRoutine.you')}` : ''}
                  </Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 14, height: 14, borderRadius: 4, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.borderLight }} />
                <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>{t('careRoutine.free')}</Text>
              </View>
            </View>
          )}

          {/* Cabeçalhos */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4, paddingHorizontal: 2 }}>
            <View style={{ width: 36 }} />
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: font.weights.semibold, color: colors.textMuted }}>🚗 {t('careRoutine.dropoff')}</Text>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: font.weights.semibold, color: colors.textMuted }}>🏠 {t('careRoutine.pickup')}</Text>
            <Text style={{ width: 44, textAlign: 'center', fontSize: 10, color: colors.textMuted }}>{t('careRoutine.fullDayShort')}</Text>
          </View>

          {/* Linhas */}
          <View style={{ gap: 6 }}>
            {days.map((wd) => {
              const cell = activeCells[wd] || { dropoff: null, pickup: null };
              const isFullDay = cell.dropoff != null && cell.dropoff === cell.pickup;
              const isWeekend = wd === 0 || wd === 6;
              return (
                <View key={wd} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={{ width: 36, fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: isWeekend ? colors.warning : colors.text }}>
                    {dayName(wd)}
                  </Text>
                  <CellButton weekday={wd} leg="dropoff" />
                  <CellButton weekday={wd} leg="pickup" />
                  <TouchableOpacity
                    onPress={() => cycleFullDay(wd)}
                    accessibilityRole="button"
                    accessibilityLabel={t('careRoutine.fullDay')}
                    style={{
                      width: 44, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: isFullDay ? colors.brand : colors.borderLight,
                      backgroundColor: isFullDay ? colors.brandGlow : colors.bgElevated,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: font.weights.semibold, color: isFullDay ? colors.brand : colors.textMuted }}>
                      {isFullDay ? '✓' : '↔'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <TouchableOpacity onPress={() => setIncludeWeekend((v) => !v)} style={{ marginTop: spacing.md }}>
            <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: colors.brand }}>
              {includeWeekend ? t('careRoutine.hideWeekend') : t('careRoutine.showWeekend')}
            </Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 11, textAlign: 'center', color: colors.textMuted, paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.borderLight }}>
            {grid.mode === 'custody' ? t('careRoutine.tapToToggle') : t('careRoutine.tapToCycle')}
          </Text>
        </Card>

        {/* Mais opções: horários + destino */}
        <Card>
          <TouchableOpacity onPress={() => setShowOptions((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }}>
              {showOptions ? '▾' : '▸'} {t('careRoutine.moreOptions')}
            </Text>
          </TouchableOpacity>
          {showOptions && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md }}>
              <OptionField label={t('careRoutine.timeDropoff')} value={grid.dropoffTime} onChange={(v) => patch((g) => ({ ...g, dropoffTime: formatTimeInput(v) }))} placeholder="00:00" keyboardType="number-pad" maxLength={5} />
              <OptionField label={t('careRoutine.timePickup')} value={grid.pickupTime} onChange={(v) => patch((g) => ({ ...g, pickupTime: formatTimeInput(v) }))} placeholder="00:00" keyboardType="number-pad" maxLength={5} />
              <OptionField label={t('careRoutine.labelDropoff')} value={grid.dropoffLabel} onChange={(v) => patch((g) => ({ ...g, dropoffLabel: v }))} placeholder={t('careRoutine.labelPlaceholder')} />
              <OptionField label={t('careRoutine.labelPickup')} value={grid.pickupLabel} onChange={(v) => patch((g) => ({ ...g, pickupLabel: v }))} placeholder={t('careRoutine.labelPlaceholder')} />
            </View>
          )}
        </Card>

        {children.length > 1 && (
          <TouchableOpacity
            onPress={applyToAllChildren}
            style={{ paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, alignItems: 'center', marginBottom: spacing.md }}
          >
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.brand }}>{t('careRoutine.applyAllChildren')}</Text>
          </TouchableOpacity>
        )}

        {saved && (
          <View style={{ backgroundColor: colors.brandGlow, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
            <Text style={{ fontSize: font.sizes.sm, color: colors.brand }}>{t('careRoutine.saved')}</Text>
          </View>
        )}

        <TouchableOpacity
          disabled={submitting}
          onPress={handleSave}
          activeOpacity={0.85}
          style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center', opacity: submitting ? 0.5 : 1 }}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>{t('careRoutine.save')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm, marginBottom: spacing.lg }}>
      {children}
    </View>
  );
}

function OptionField({
  label, value, onChange, placeholder, keyboardType, maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  maxLength?: number;
}) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', minWidth: 120 }}>
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={{
          backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
          paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
        }}
      />
    </View>
  );
}
