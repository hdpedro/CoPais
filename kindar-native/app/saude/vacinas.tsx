/**
 * Vacinas (Native) — Motor de Saúde Preventiva.
 *
 * Hero calmo + pendências + Timeline + histórico + settings de calendário.
 * Espelha o PWA `/saude/vacinas`. Banco como fonte de verdade — chama
 * apiFetch via `getVaccineStatus`.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { useI18n } from 'src/i18n';
import { useAuth } from 'src/store/auth';
import { reportError } from 'src/lib/error-reporter';
import { withTimeout } from 'src/lib/with-timeout';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import {
  getVaccineStatus,
  markRecommendedDoseTaken,
  dismissPendingDose,
  setVaccinationCalendarPreference,
  type VaccineStatusResult,
  type VaccineDoseStatus,
  type CalendarPreference,
} from 'src/services/health';
import VaccineTimeline from 'src/components/saude/VaccineTimeline';
import PostVaccineChecklistModal from 'src/components/saude/PostVaccineChecklistModal';

interface Child {
  id: string;
  full_name: string;
  birth_date: string | null;
  vaccination_calendar_preference: CalendarPreference | null;
}

interface HistoryRecord {
  id: string;
  vaccine_name: string;
  dose_label: string | null;
  administered_date: string;
  location: string | null;
}

function formatBrDate(iso: string): string {
  return iso.split('-').reverse().join('/');
}

function daysUntil(iso: string): number {
  const d = new Date(iso + 'T12:00:00').getTime();
  return Math.ceil((d - Date.now()) / 86400000);
}

export default function VacinasScreen() {
  const t = useI18n((s) => s.t);
  const toast = useToast();
  const { activeGroup } = useAuth();
  const params = useLocalSearchParams<{ crianca?: string; postVaccine?: string }>();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [status, setStatus] = useState<VaccineStatusResult | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savingPref, setSavingPref] = useState(false);
  const [heroExpanded, setHeroExpanded] = useState(false);
  const [postVaccineRecordId, setPostVaccineRecordId] = useState<string | null>(null);

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId) || null,
    [children, selectedChildId],
  );

  const load = useCallback(async () => {
    if (!activeGroup) {
      setLoading(false);
      return;
    }
    try {
      // 1. Children
      const { data: kids } = await withTimeout(
        supabase
          .from('children')
          .select('id, full_name, birth_date, vaccination_calendar_preference')
          .eq('group_id', activeGroup.groupId)
          .order('birth_date'),
        7000,
        'vaccines.children',
      );
      const list = (kids || []) as Child[];
      setChildren(list);
      if (list.length === 0) {
        setStatus(null);
        setHistory([]);
        setLoading(false);
        return;
      }
      const childId = selectedChildId && list.find((c) => c.id === selectedChildId)
        ? selectedChildId
        : list[0].id;
      if (!selectedChildId) setSelectedChildId(childId);

      // 2. Engine + history in parallel
      const [st, hist] = await Promise.all([
        withTimeout(getVaccineStatus(childId), 8000, 'vaccines.engine'),
        withTimeout(
          supabase
            .from('vaccination_records')
            .select('id, vaccine_name, dose_label, administered_date, location')
            .eq('child_id', childId)
            .order('administered_date', { ascending: false })
            .limit(30),
          7000,
          'vaccines.history',
        ),
      ]);
      setStatus(st);
      setHistory((hist.data || []) as HistoryRecord[]);
    } catch (e) {
      reportError(e, { filePath: 'app/saude/vacinas.tsx', metadata: { childId: selectedChildId } });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeGroup, selectedChildId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Pickup ?crianca=<id> e ?postVaccine=<id> (deep links + redirect do form).
  // Sched as setStates async pra evitar cascading render do eslint-react.
  useEffect(() => {
    const wantedChild = params.crianca as string | undefined;
    const wantedPost = params.postVaccine as string | undefined;
    if (!wantedChild && !wantedPost) return;
    const handle = setTimeout(() => {
      if (wantedChild && wantedChild !== selectedChildId) setSelectedChildId(wantedChild);
      if (wantedPost && wantedPost !== postVaccineRecordId) setPostVaccineRecordId(wantedPost);
    }, 0);
    return () => clearTimeout(handle);
  }, [params.crianca, params.postVaccine, selectedChildId, postVaccineRecordId]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  async function handleMarkTaken(dose: VaccineDoseStatus) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const todayIso = new Date().toISOString().slice(0, 10);
    const r = await markRecommendedDoseTaken({
      doseRecommendationId: dose.id,
      administeredDate: todayIso,
    });
    if (r.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      load();
    } else {
      toast.show({ message: r.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  async function handleSnooze(dose: VaccineDoseStatus, reason: 'snoozed_7d' | 'snoozed_30d' | 'already_scheduled') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const r = await dismissPendingDose({
      childId: selectedChildId,
      vaccineId: dose.vaccineId,
      doseNumber: dose.doseNumber,
      reason,
    });
    if (r.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ message: t('health.vaccineEngine.snoozeSuccess'), variant: 'success' });
      load();
    } else {
      toast.show({ message: r.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  async function handlePreference(pref: CalendarPreference) {
    if (!selectedChild) return;
    setSavingPref(true);
    Haptics.selectionAsync();
    const r = await setVaccinationCalendarPreference({
      childId: selectedChild.id,
      preference: pref,
    });
    setSavingPref(false);
    if (r.success) {
      // Atualiza preference local pra evitar re-fetch
      setChildren((prev) =>
        prev.map((c) =>
          c.id === selectedChild.id ? { ...c, vaccination_calendar_preference: pref } : c,
        ),
      );
      load();
    } else {
      toast.show({ message: r.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  // ─── Render helpers ───

  function renderHero() {
    if (!status || !selectedChild) return null;
    const totalPending = status.totals.overdue + status.totals.dueSoon;
    const onTrack = totalPending === 0 && status.coveragePct > 0;
    const onlyHistGap =
      totalPending === 0 && status.totals.taken === 0 && status.totals.historicalGap > 0;
    const bg = onTrack
      ? '#ECFDF5'
      : totalPending > 0
      ? '#FFFBEB'
      : '#F9FAFB';
    const border = onTrack
      ? '#A7F3D0'
      : totalPending > 0
      ? '#FCD34D'
      : '#E5E7EB';
    const icon = onTrack ? '🛡️' : totalPending > 0 ? '💉' : '📋';

    let nextLine: string | null = null;
    if (status.nextDue) {
      const d = daysUntil(status.nextDue.dueDate);
      if (d <= 0) nextLine = t('health.vaccineEngine.nextDueToday', { name: status.nextDue.vaccineName });
      else if (d === 1) nextLine = t('health.vaccineEngine.nextDueTomorrow', { name: status.nextDue.vaccineName });
      else if (d < 60)
        nextLine = t('health.vaccineEngine.nextDueInDays', { name: status.nextDue.vaccineName, count: String(d) });
      else
        nextLine = t('health.vaccineEngine.nextDueLine', {
          name: status.nextDue.vaccineName,
          date: formatBrDate(status.nextDue.dueDate),
        });
    }

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${t('health.vaccineEngine.preventiveCareTitle')} de ${selectedChild.full_name.split(' ')[0]}: ${status.statusLabel}`}
        accessibilityHint={t('health.vaccineEngine.openDetails')}
        accessibilityState={{ expanded: heroExpanded }}
        onPress={() => {
          Haptics.selectionAsync();
          setHeroExpanded((v) => !v);
        }}
        style={{
          marginHorizontal: spacing.lg,
          marginBottom: spacing.md,
          padding: spacing.lg + 2,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: bg,
          flexDirection: 'row',
          gap: spacing.md,
          alignItems: 'flex-start',
          ...shadows.sm,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.7)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 30 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: font.sizes.xs,
              fontWeight: font.weights.semibold,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            {t('health.vaccineEngine.preventiveCareTitle')} · {selectedChild.full_name.split(' ')[0]}
          </Text>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, marginTop: 2 }}>
            {status.statusLabel}
          </Text>
          {nextLine ? (
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 4 }}>
              {t('health.vaccineEngine.nextDue')}: {nextLine}
            </Text>
          ) : null}
          {heroExpanded && !onlyHistGap && status.coveragePct > 0 ? (
            <View style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.borderLight }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                {t('health.vaccineEngine.coverageDetail', { pct: String(status.coveragePct) })}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                {t('health.vaccineEngine.coverageHint')}
              </Text>
            </View>
          ) : null}
        </View>
        <Ionicons
          name={heroExpanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textMuted}
          style={{ marginTop: 4 }}
        />
      </TouchableOpacity>
    );
  }

  function renderPending() {
    if (!status || !selectedChild) return null;
    const pending = [...status.overdue, ...status.dueSoon];
    if (pending.length === 0) {
      return (
        <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          <View
            style={{
              padding: spacing.lg,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: '#A7F3D0',
              backgroundColor: '#ECFDF5',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#065F46', fontSize: font.sizes.sm }}>
              {t('health.vaccineEngine.pendingSectionEmpty')} 🛡️
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm }}>
        <Text
          style={{
            fontSize: font.sizes.xs,
            fontWeight: font.weights.semibold,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1,
            paddingHorizontal: 2,
          }}
        >
          {t('health.vaccineEngine.pendingSectionTitle')}
        </Text>
        {pending.map((dose) => (
          <PendingCard
            key={dose.id}
            dose={dose}
            childFirstName={selectedChild.full_name.split(' ')[0]}
            childId={selectedChild.id}
            onMark={() => handleMarkTaken(dose)}
            onSnooze={(reason) => handleSnooze(dose, reason)}
          />
        ))}
      </View>
    );
  }

  function renderHistGap() {
    if (!status || status.totals.historicalGap === 0 || !selectedChild) return null;
    return (
      <View
        style={{
          marginHorizontal: spacing.lg,
          marginBottom: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.borderLight,
          backgroundColor: colors.bgSurface,
          flexDirection: 'row',
          gap: spacing.md,
        }}
      >
        <Text style={{ fontSize: 20, marginTop: 2 }}>📋</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>
            {t('health.vaccineEngine.historicalGapBanner')}
          </Text>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 }}>
            {t('health.vaccineEngine.historicalGapCount', { count: String(status.totals.historicalGap) })}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <TouchableOpacity
              onPress={() => router.push(`/saude/vacinas/carteirinha?crianca=${selectedChild.id}`)}
              accessibilityRole="button"
              accessibilityLabel={t('health.vaccineEngine.historyCta')}
              style={{
                paddingVertical: spacing.xs + 2,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.brand,
              }}
            >
              <Text style={{ color: '#fff', fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>
                📷 {t('health.vaccineEngine.historyCta')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  function renderHistory() {
    if (history.length === 0) return null;
    return (
      <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.lg }}>
        <Text
          style={{
            fontSize: font.sizes.xs,
            fontWeight: font.weights.semibold,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1,
            paddingHorizontal: 2,
            marginBottom: spacing.sm,
          }}
        >
          {t('health.vaccineEngine.historyTitle')}
        </Text>
        <View
          style={{
            borderRadius: radius.xl,
            backgroundColor: colors.bgElevated,
            borderWidth: 1,
            borderColor: colors.borderLight,
            overflow: 'hidden',
          }}
        >
          {history.map((r, i) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => router.push(`/saude/vacinas/${r.id}` as never)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${r.vaccine_name}, ${formatBrDate(r.administered_date)}${r.dose_label ? `, ${r.dose_label}` : ''}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.md,
                borderTopWidth: i > 0 ? 0.5 : 0,
                borderTopColor: colors.borderLight,
              }}
            >
              <Text>💉</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }}>
                  {r.vaccine_name}
                </Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 1 }}>
                  {formatBrDate(r.administered_date)}
                  {r.dose_label ? ` · ${r.dose_label}` : ''}
                  {r.location ? ` · ${r.location}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  function renderSettings() {
    if (!showSettings || !selectedChild) return null;
    const current: CalendarPreference = selectedChild.vaccination_calendar_preference || 'both';
    const opts: Array<{ key: CalendarPreference; label: string; hint: string }> = [
      {
        key: 'both',
        label: t('health.vaccineEngine.settingsBoth'),
        hint: t('health.vaccineEngine.settingsBothHint'),
      },
      {
        key: 'public',
        label: t('health.vaccineEngine.settingsPublic'),
        hint: t('health.vaccineEngine.settingsPublicHint'),
      },
      {
        key: 'private',
        label: t('health.vaccineEngine.settingsPrivate'),
        hint: t('health.vaccineEngine.settingsPrivateHint'),
      },
    ];
    return (
      <View
        style={{
          marginHorizontal: spacing.lg,
          marginBottom: spacing.lg,
          padding: spacing.lg,
          borderRadius: radius.xl,
          backgroundColor: colors.bgElevated,
          borderWidth: 1,
          borderColor: colors.borderLight,
        }}
      >
        <Text
          style={{
            fontSize: font.sizes.xs,
            fontWeight: font.weights.semibold,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: spacing.sm,
          }}
        >
          {t('health.vaccineEngine.settingsTitle')}
        </Text>
        {opts.map((o) => {
          const active = o.key === current;
          return (
            <TouchableOpacity
              key={o.key}
              disabled={savingPref}
              onPress={() => handlePreference(o.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: savingPref }}
              accessibilityLabel={o.label}
              accessibilityHint={o.hint}
              style={{
                paddingVertical: spacing.sm + 2,
                paddingHorizontal: spacing.md,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: active ? colors.brand : colors.borderLight,
                backgroundColor: active ? colors.brandLight : colors.bg,
                marginBottom: spacing.xs,
                flexDirection: 'row',
                gap: spacing.md,
                alignItems: 'flex-start',
              }}
            >
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: active ? colors.brand : colors.border,
                  backgroundColor: active ? colors.brand : 'transparent',
                  marginTop: 2,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: font.sizes.sm,
                    fontWeight: font.weights.semibold,
                    color: active ? colors.brand : colors.text,
                  }}
                >
                  {o.label}
                </Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 1 }}>{o.hint}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
          {t('health.vaccineEngine.settingsHpvNote')}
        </Text>
      </View>
    );
  }

  // ─── Render ───

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('health.vaccineEngine.preventiveCareTitle')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('health.vaccineEngine.preventiveCareTitle')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text style={{ fontSize: 40, marginBottom: spacing.md }}>👶</Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
            {t('health.addChildFirst')}
          </Text>
        </View>
      </View>
    );
  }

  if (selectedChild && !selectedChild.birth_date) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('health.vaccineEngine.preventiveCareTitle')} />
        <View style={{ padding: spacing.lg }}>
          {children.length > 1 ? <ChildSelector list={children} selectedId={selectedChildId} onSelect={setSelectedChildId} /> : null}
          <View
            style={{
              backgroundColor: colors.bgElevated,
              borderRadius: radius.xl,
              padding: spacing.xl,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.borderLight,
            }}
          >
            <Text style={{ fontSize: 40, marginBottom: spacing.md }}>📅</Text>
            <Text style={{ color: colors.text, fontWeight: font.weights.semibold }}>
              {t('health.vaccineEngine.statusEmpty')}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.sizes.xs, marginTop: spacing.xs, textAlign: 'center' }}>
              Adicione a data de nascimento de {selectedChild.full_name.split(' ')[0]} no perfil
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={t('health.vaccineEngine.preventiveCareTitle')}
        rightAction={{
          icon: showSettings ? 'close-outline' : 'settings-outline',
          onPress: () => setShowSettings((v) => !v),
        }}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100, paddingTop: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />}
      >
        {children.length > 1 ? (
          <ChildSelector list={children} selectedId={selectedChildId} onSelect={setSelectedChildId} />
        ) : null}

        {renderSettings()}
        {renderHero()}
        {renderHistGap()}
        {renderPending()}

        {/* Fallback gracioso quando o motor não respondeu (timeout / offline).
            Sem isso, a tela mostrava só CTAs+Histórico — confuso pro user. */}
        {selectedChild && !status ? (
          <View
            style={{
              marginHorizontal: spacing.lg,
              marginBottom: spacing.md,
              padding: spacing.lg,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.borderLight,
              backgroundColor: colors.bgSurface,
              flexDirection: 'row',
              gap: spacing.md,
              alignItems: 'flex-start',
            }}
          >
            <Text style={{ fontSize: 22 }}>📡</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                Não consegui carregar o calendário vacinal agora
              </Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 }}>
                Verifique sua conexão e tente novamente. Seu histórico continua disponível abaixo.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setLoading(true);
                  load();
                }}
                accessibilityRole="button"
                accessibilityLabel="Tentar novamente"
                style={{
                  marginTop: spacing.sm,
                  alignSelf: 'flex-start',
                  paddingVertical: spacing.xs + 2,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.brand,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: font.weights.semibold }}>
                  Tentar novamente
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* CTAs Registrar + Carteirinha — paridade premium com PWA */}
        {selectedChild ? (
          <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.lg, flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              onPress={() => router.push(`/saude/vacinas/nova?crianca=${selectedChild.id}` as never)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('health.vaccineEngine.registerCta')}
              accessibilityHint={t('health.vaccineEngine.registerTitle')}
              style={{
                flex: 1,
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: colors.brand,
                flexDirection: 'row',
                gap: spacing.sm,
                alignItems: 'center',
                ...shadows.sm,
              }}
            >
              <View
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: 'rgba(255,255,255,0.22)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.bold, color: '#fff' }}>
                  {t('health.vaccineEngine.registerCta')}
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 1 }}>
                  {t('health.vaccineEngine.registerTitle')}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`/saude/vacinas/carteirinha?crianca=${selectedChild.id}` as never)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('health.vaccineEngine.historyCta')}
              accessibilityHint={t('health.vaccineEngine.historyHint')}
              style={{
                flex: 1,
                padding: spacing.md,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.borderLight,
                backgroundColor: colors.bgElevated,
                flexDirection: 'row',
                gap: spacing.sm,
                alignItems: 'center',
                ...shadows.sm,
              }}
            >
              <View
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: colors.brandLight,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="camera-outline" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                  {t('health.vaccineEngine.historyCta')}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                  {t('health.vaccineEngine.historyHint')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Timeline */}
        {status && status.timelineByAge.length > 0 ? (
          <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.lg }}>
            <Text
              style={{
                fontSize: font.sizes.xs,
                fontWeight: font.weights.semibold,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 1,
                paddingHorizontal: 2,
                marginBottom: spacing.sm,
              }}
            >
              {t('health.vaccineEngine.timelineTitle')}
            </Text>
            <View
              style={{
                backgroundColor: colors.bgElevated,
                borderRadius: radius.xl,
                paddingVertical: spacing.md,
                borderWidth: 1,
                borderColor: colors.borderLight,
              }}
            >
              <VaccineTimeline timeline={status.timelineByAge} />
            </View>
          </View>
        ) : null}

        {renderHistory()}
      </ScrollView>

      {/* Modal pós-vacina (opt-in 48h reminder) — paridade premium com PWA */}
      <PostVaccineChecklistModal
        visible={!!postVaccineRecordId}
        vaccineRecordId={postVaccineRecordId || ''}
        childFirstName={selectedChild?.full_name.split(' ')[0] || ''}
        onDone={() => {
          setPostVaccineRecordId(null);
          router.replace(`/saude/vacinas?crianca=${selectedChildId}` as never);
        }}
        onSkip={() => {
          setPostVaccineRecordId(null);
          router.replace(`/saude/vacinas?crianca=${selectedChildId}` as never);
        }}
      />
    </View>
  );
}

// ─── Sub-components ───

function ChildSelector({
  list,
  selectedId,
  onSelect,
}: {
  list: Child[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md }}
    >
      {list.map((c) => {
        const isActive = c.id === selectedId;
        return (
          <TouchableOpacity
            key={c.id}
            onPress={() => onSelect(c.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={c.full_name.split(' ')[0]}
            style={{
              paddingVertical: spacing.xs + 2,
              paddingHorizontal: spacing.md,
              borderRadius: radius.full,
              backgroundColor: isActive ? colors.brand : colors.bgElevated,
              borderWidth: 1,
              borderColor: isActive ? colors.brand : colors.borderLight,
            }}
          >
            <Text style={{ color: isActive ? '#fff' : colors.text, fontSize: font.sizes.sm }}>
              {c.full_name.split(' ')[0]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function PendingCard({
  dose,
  childFirstName,
  childId,
  onMark,
  onSnooze,
}: {
  dose: VaccineDoseStatus;
  childFirstName: string;
  childId: string;
  onMark: () => void;
  onSnooze: (reason: 'snoozed_7d' | 'snoozed_30d' | 'already_scheduled') => void;
}) {
  const t = useI18n((s) => s.t);
  const [showSnooze, setShowSnooze] = useState(false);

  const timeLine = (() => {
    if (dose.status === 'overdue') {
      if (dose.overdueDays === 1) return t('health.vaccineEngine.pendingTimeOverdueOne');
      return t('health.vaccineEngine.pendingTimeOverdue', { count: String(dose.overdueDays ?? 0) });
    }
    if (dose.status === 'due_soon') {
      const da = Math.max(0, daysUntil(dose.dueDate));
      if (da === 0) return t('health.vaccineEngine.pendingTimeDueToday');
      return t('health.vaccineEngine.pendingTimeDueSoon', { count: String(da) });
    }
    return '';
  })();

  return (
    <View
      style={{
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: '#FFFBEB',
        borderWidth: 1,
        borderColor: '#FCD34D',
      }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text>💉</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
              {dose.vaccineName}
            </Text>
            {dose.ruleNetwork === 'public' ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: '#D1FAE5' }}>
                <Text style={{ fontSize: 10, fontWeight: font.weights.semibold, color: '#047857', letterSpacing: 0.3 }}>
                  {t('health.vaccineEngine.networkPublicChip')}
                </Text>
              </View>
            ) : dose.ruleNetwork === 'private' ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: '#E0F2FE' }}>
                <Text style={{ fontSize: 10, fontWeight: font.weights.semibold, color: '#0369A1', letterSpacing: 0.3 }}>
                  {t('health.vaccineEngine.networkPrivateChip')}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: font.sizes.xs, color: '#92400E', marginTop: 2 }}>
            {dose.doseLabel}
            {timeLine ? ` · ${timeLine}` : ''}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{childFirstName}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm }}>
        <TouchableOpacity
          onPress={onMark}
          accessibilityRole="button"
          accessibilityLabel={t('health.vaccineEngine.ctaMarkAsTaken')}
          style={{
            flex: 1,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: '#ECFDF5',
            borderWidth: 1,
            borderColor: '#A7F3D0',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: font.weights.semibold, color: '#065F46' }}>
            ✓ {t('health.vaccineEngine.ctaMarkAsTaken')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push(`/saude/consultas?crianca=${childId}&vaccineDoseId=${dose.id}`)}
          accessibilityRole="button"
          accessibilityLabel={t('health.vaccineEngine.ctaScheduleAppointment')}
          style={{
            flex: 1,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: colors.brandLight,
            borderWidth: 1,
            borderColor: colors.brand + '40',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: font.weights.semibold, color: colors.brand }}>
            📅 {t('health.vaccineEngine.ctaScheduleAppointment')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowSnooze((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={t('health.vaccineEngine.ctaSnooze')}
          accessibilityState={{ expanded: showSnooze }}
          style={{
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: colors.borderLight,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: font.weights.medium, color: colors.textMuted }}>
            {t('health.vaccineEngine.ctaSnooze')}
          </Text>
        </TouchableOpacity>
      </View>

      {showSnooze ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.xs }}>
          <TouchableOpacity
            onPress={() => { onSnooze('snoozed_7d'); setShowSnooze(false); }}
            accessibilityRole="button"
            accessibilityLabel={t('health.vaccineEngine.ctaSnooze7d')}
            style={{ flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.borderLight }}
          >
            <Text style={{ fontSize: 11, color: colors.textMuted }}>{t('health.vaccineEngine.ctaSnooze7d')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { onSnooze('snoozed_30d'); setShowSnooze(false); }}
            accessibilityRole="button"
            accessibilityLabel={t('health.vaccineEngine.ctaSnooze30d')}
            style={{ flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.borderLight }}
          >
            <Text style={{ fontSize: 11, color: colors.textMuted }}>{t('health.vaccineEngine.ctaSnooze30d')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { onSnooze('already_scheduled'); setShowSnooze(false); }}
            accessibilityRole="button"
            accessibilityLabel={t('health.vaccineEngine.ctaAlreadyScheduled')}
            style={{ flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.borderLight }}
          >
            <Text style={{ fontSize: 11, color: colors.textMuted }}>{t('health.vaccineEngine.ctaAlreadyScheduled')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
