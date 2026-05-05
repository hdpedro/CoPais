import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '../../src/store/auth';
import { useDashboard } from '../../src/hooks/useDashboard';
import { useI18n } from '../../src/i18n';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';
import { ACTIVITY_CATEGORIES } from '../../src/lib/constants';
import ActivityReportModal from '../../src/components/activities/ActivityReportModal';
import ActivityChecklistModal from '../../src/components/activities/ActivityChecklistModal';

// i18n keys for greetings — same keys the PWA uses
// (`dashboard.goodMorning` / `goodAfternoon` / `goodEvening`).
const GREETING_I18N_KEYS = {
  morning: 'dashboard.goodMorning',
  afternoon: 'dashboard.goodAfternoon',
  evening: 'dashboard.goodEvening',
} as const;

// Mirror of PWA decisionCatIcons / decisionCatColors — keep in sync.
const DECISION_CAT_ICONS: Record<string, string> = {
  escola: '🎒', saude: '🏥', atividade: '⚽',
  viagem: '✈️', financeiro: '💰', moradia: '🏠', outro: '📋',
};
const DECISION_CAT_COLORS: Record<string, string> = {
  escola: '#3B82F6', saude: '#EF4444', atividade: '#22C55E',
  viagem: '#8B5CF6', financeiro: '#F59E0B', moradia: '#5B9E85', outro: '#6B7280',
};

const MONTHS_PT_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatDatePt(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${d} de ${MONTHS_PT_SHORT[(m || 1) - 1]}`;
}
function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${d}/${m}`;
}
function formatBRL(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}
function formatDeadline(deadline: string | null): { label: string; urgent: boolean } | null {
  if (!deadline) return null;
  const now = Date.now();
  const d = new Date(deadline + 'T23:59:59').getTime();
  const daysUntil = Math.ceil((d - now) / 86400000);
  if (daysUntil < 0) return { label: 'Prazo expirado', urgent: true };
  if (daysUntil === 0) return { label: 'Hoje', urgent: true };
  if (daysUntil <= 3) return { label: `Em ${daysUntil} dia${daysUntil > 1 ? 's' : ''}`, urgent: true };
  return { label: formatDatePt(deadline), urgent: false };
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const { data, loading, refresh } = useDashboard();
  const t = useI18n(s => s.t);
  const [refreshing, setRefreshing] = useState(false);
  const [reportModal, setReportModal] = useState<{
    open: boolean; activityId: string; activityName: string; childId: string | null; occurrenceDate: string;
  } | null>(null);
  // Tap on a Hoje/Amanhã activity card opens the checklist for that
  // specific occurrence (what to bring/prepare). User asked for context
  // over the all-activities list — paridade com PWA dashboard.
  const [checklistModal, setChecklistModal] = useState<{
    activityId: string; activityName: string; occurrenceDate: string;
  } | null>(null);

  // Reused for activity card → checklist modal (occurrenceDate).
  const todayIso = new Date().toISOString().split('T')[0];
  const tomorrowIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (!data && loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: font.sizes.md }}>{t('common.loading')}</Text>
      </View>
    );
  }

  const greeting = data ? t(GREETING_I18N_KEYS[data.greeting]) : t('common.hello');
  const firstName = data?.firstName || '';
  const firstCustody = data?.custodyChildren?.[0];

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 120, paddingHorizontal: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* === HEADER === */}
        <Animated.View entering={FadeInDown.delay(0).duration(400)}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text }}>
                {greeting}, {firstName}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
                {data?.formattedDate}
                {data?.custodySummary ? ` · ${data.custodySummary}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              {/* Kindar AI button — matches PWA mic button next to bell */}
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/ai'); }}
                hitSlop={6}
                testID="home-ai"
                accessibilityLabel="Abrir Kindar AI"
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: colors.brand,
                  alignItems: 'center', justifyContent: 'center',
                  ...shadows.sm,
                }}
              >
                <Ionicons name="sparkles" size={18} color="#fff" />
              </TouchableOpacity>

              {/* Notifications bell */}
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/notificacoes'); }}
                style={{ position: 'relative', padding: spacing.sm }}
                hitSlop={6}
                testID="home-bell"
                accessibilityLabel="Abrir notificações"
              >
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {(data?.unreadNotifications || 0) > 0 ? (
                  <View style={{
                    position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16,
                    borderRadius: 8, backgroundColor: colors.error, paddingHorizontal: 3,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                      {data!.unreadNotifications > 9 ? '9+' : data!.unreadNotifications}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* === HERO CARD (custody) === */}
        {data?.hasCustody && firstCustody ? (
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <View style={{
              backgroundColor: '#2C2C2C', borderRadius: radius.xl,
              padding: spacing.xl, marginBottom: spacing.lg,
              ...shadows.md,
            }}>
              {/* Top row: Guarda ativa + próxima troca */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.full,
                  paddingHorizontal: 10, paddingVertical: 3,
                }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
                  <Text style={{ fontSize: 11, fontWeight: font.weights.semibold, color: '#fff' }}>
                    {t('dashboard.activeCustody')}
                  </Text>
                </View>
                {data.nextSwapLabel && data.nextSwapPerson ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: font.weights.medium, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                      {t('dashboard.nextSwap')}
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: font.weights.semibold }}>
                      {data.nextSwapLabel} · {data.nextSwapPerson}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Main info */}
              <Text style={{ fontSize: 22, fontWeight: font.weights.bold, color: '#fff', lineHeight: 28 }}>
                <Text style={{ color: '#D4735A' }}>{firstCustody.childFirstName}</Text>{' '}
                está com {firstCustody.isWithMe ? 'você' : firstCustody.responsibleName}
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                {firstCustody.childFirstName}{data.endDateLabel ? ` · ${data.endDateLabel}` : ''}
              </Text>

              {/* Progress bar */}
              {data.streakTotal > 1 ? (
                <View style={{ marginTop: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: font.weights.medium }}>
                      {t('dashboard.day')}
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: font.weights.medium }}>
                      {data.streakDays} de {data.streakTotal} consecutivos
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {Array.from({ length: data.streakTotal }).map((_, i) => (
                      <View
                        key={i}
                        style={{
                          flex: 1, height: 6, borderRadius: 3,
                          backgroundColor: i < data.streakDays ? '#D4735A' : 'rgba(255,255,255,0.12)',
                        }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </Animated.View>
        ) : null}

        {/* === CHILD CARDS === */}
        {(data?.childCards?.length || 0) > 0 ? (
          <Animated.View entering={FadeInDown.delay(130).duration(400)}>
            {data!.childCards.map(child => {
              const custody = data!.custodyChildren.find(c => c.childFirstName === child.firstName);
              const birthYear = data!.children.find(c => c.id === child.id)?.birth_date?.split('-')[0] || '';
              const birthMonthIdx = Number(data!.children.find(c => c.id === child.id)?.birth_date?.split('-')[1] || 1) - 1;
              const birthLabel = `${MONTHS_PT_SHORT[birthMonthIdx]?.charAt(0).toUpperCase()}${MONTHS_PT_SHORT[birthMonthIdx]?.slice(1)}/${birthYear}`;
              return (
                <TouchableOpacity
                  key={child.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/criancas/${child.id}`); }}
                  activeOpacity={0.85}
                  testID={`home-card-kid-${child.id}`}
                  accessibilityLabel={`Abrir perfil de ${child.firstName}`}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.xl,
                    padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: custody ? spacing.sm : 0 }}>
                    <View style={{
                      width: 44, height: 44, borderRadius: 22,
                      backgroundColor: colors.brandLight,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 20, fontWeight: font.weights.bold, color: colors.brand }}>
                        {child.firstName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
                        {child.firstName}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted }}>
                        {child.age} {child.age === 1 ? 'ano' : 'anos'}{birthYear ? ` · nasceu em ${birthLabel}` : ''}
                      </Text>
                    </View>
                  </View>
                  {custody ? (
                    <View style={{
                      backgroundColor: colors.bg, borderRadius: radius.md,
                      paddingHorizontal: spacing.md, paddingVertical: 10,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="home-outline" size={14} color={custody.color} />
                        <Text style={{ fontSize: 13, color: colors.text }}>
                          Hoje com {custody.isWithMe ? 'você' : custody.responsibleName}
                        </Text>
                      </View>
                      <View style={{
                        backgroundColor: 'rgba(91,158,133,0.12)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full,
                      }}>
                        <Text style={{ fontSize: 10, color: '#5B9E85', fontWeight: font.weights.semibold }}>
                          {t('dashboard.active')}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        ) : null}

        {/* === HEALTH ALERT (if any critical) === */}
        {data?.hasAnyCriticalChild ? (
          <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(tabs)/saude'); }}
              activeOpacity={0.8}
              style={{
                backgroundColor: `${colors.error}12`, borderRadius: radius.xl,
                borderWidth: 1, borderColor: `${colors.error}30`,
                padding: spacing.lg, marginBottom: spacing.lg,
                flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              }}
            >
              <Text style={{ fontSize: 22 }}>🚨</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.error }}>
                  Atencao em saude
                </Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.text, marginTop: 2 }}>
                  {data.childHealthSummaries.filter(s => s.status === 'treatment').length} crianca(s) em tratamento
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.error} />
            </TouchableOpacity>
          </Animated.View>
        ) : null}

        {/* === ACTIVITIES TODAY / TOMORROW === */}
        {((data?.todayActivities?.length || 0) > 0 || (data?.tomorrowActivities?.length || 0) > 0) ? (
          <Animated.View entering={FadeInDown.delay(180).duration(400)}>
            <View style={{ marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="time-outline" size={12} color={colors.brand} />
                  <Text style={{ fontSize: 10, fontWeight: font.weights.bold, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    {t('dashboard.activities')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/atividades')}>
                  <Text style={{ fontSize: 10, color: colors.brand, fontWeight: font.weights.semibold }}>{t('dashboard.viewAllFeminine')}</Text>
                </TouchableOpacity>
              </View>

              {(data?.todayActivities?.length || 0) > 0 ? (
                <>
                  <Text style={{ fontSize: 10, fontWeight: font.weights.semibold, color: '#5B9E85', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                    {t('dashboard.today')}
                  </Text>
                  {data!.todayActivities.map(act => {
                    const catIcon = ACTIVITY_CATEGORIES.find(c => c.value === act.category)?.icon || '📌';
                    return (
                      <TouchableOpacity
                        key={`today-${act.id}`}
                        activeOpacity={0.75}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setChecklistModal({
                            activityId: act.id,
                            activityName: act.name,
                            occurrenceDate: todayIso,
                          });
                        }}
                        style={{
                          backgroundColor: colors.bgElevated, borderRadius: radius.md,
                          padding: spacing.md, marginBottom: 6,
                          flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.sm,
                        }}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${colors.brand}15`, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 16 }}>{catIcon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: font.weights.semibold, color: colors.text }}>
                            {act.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            {act.timeStr ? <Text style={{ color: colors.text, fontWeight: font.weights.medium }}>{act.timeStr}</Text> : null}
                            {act.childName ? ` · ${act.childName}` : ''}
                            {act.location ? ` · ${act.location}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}

              {(data?.tomorrowActivities?.length || 0) > 0 ? (
                <>
                  <Text style={{ fontSize: 10, fontWeight: font.weights.semibold, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 8, marginBottom: 6 }}>
                    {t('dashboard.tomorrowLabel')}
                  </Text>
                  {data!.tomorrowActivities.map(act => {
                    const catIcon = ACTIVITY_CATEGORIES.find(c => c.value === act.category)?.icon || '📌';
                    return (
                      <TouchableOpacity
                        key={`tmw-${act.id}`}
                        activeOpacity={0.75}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setChecklistModal({
                            activityId: act.id,
                            activityName: act.name,
                            occurrenceDate: tomorrowIso,
                          });
                        }}
                        style={{
                          backgroundColor: colors.bgElevated, borderRadius: radius.md,
                          padding: spacing.md, marginBottom: 6,
                          flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.sm,
                        }}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${colors.brand}15`, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 16 }}>{catIcon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: font.weights.semibold, color: colors.text }}>
                            {act.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            {act.timeStr ? <Text style={{ color: colors.text, fontWeight: font.weights.medium }}>{act.timeStr}</Text> : null}
                            {act.childName ? ` · ${act.childName}` : ''}
                            {act.location ? ` · ${act.location}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}
            </View>
          </Animated.View>
        ) : null}

        {/* === PENDING DECISIONS (Votar buttons) === */}
        {(data?.pendingDecisionsList.length || 0) > 0 ? (
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <View style={{ marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-done-outline" size={12} color={colors.brand} />
                  <Text style={{ fontSize: 10, fontWeight: font.weights.bold, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    {t('dashboard.pendingDecisions')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/decisoes')}>
                  <Text style={{ fontSize: 10, color: colors.brand, fontWeight: font.weights.semibold }}>{t('common.viewAll')}</Text>
                </TouchableOpacity>
              </View>
              {data!.pendingDecisionsList.slice(0, 3).map(d => {
                const icon = DECISION_CAT_ICONS[d.category] || '📋';
                const color = DECISION_CAT_COLORS[d.category] || colors.brand;
                const deadlineInfo = formatDeadline(d.deadline);
                return (
                  <TouchableOpacity
                    key={d.id}
                    activeOpacity={0.75}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/decisoes/${d.id}`); }}
                    style={{
                      backgroundColor: 'rgba(232,162,40,0.08)',
                      borderRadius: radius.md, padding: spacing.md, marginBottom: 6,
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${color}20`, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14 }}>{icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: font.weights.semibold, color: colors.text }} numberOfLines={1}>
                        {d.title}
                      </Text>
                      {deadlineInfo ? (
                        <Text style={{ fontSize: 11, color: deadlineInfo.urgent ? colors.error : colors.textSecondary, marginTop: 2 }}>
                          {deadlineInfo.label}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={{
                        backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 6,
                        borderRadius: radius.full,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: font.weights.semibold }}>{t('dashboard.voteNow')}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* === PENDING ACTIVITY REPORTS === */}
        {(data?.pendingReports?.length || 0) > 0 ? (
          <Animated.View entering={FadeInDown.delay(220).duration(400)}>
            <View style={{ marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="clipboard-outline" size={12} color={colors.brand} />
                  <Text style={{ fontSize: 10, fontWeight: font.weights.bold, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    {t('activityReport.pendingReports')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/atividades')}>
                  <Text style={{ fontSize: 10, color: colors.brand, fontWeight: font.weights.semibold }}>{t('common.viewAll')}</Text>
                </TouchableOpacity>
              </View>
              {data!.pendingReports.slice(0, 3).map(r => {
                const openReport = () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setReportModal({
                    open: true, activityId: r.activityId, activityName: r.activityName,
                    childId: r.childId, occurrenceDate: r.occurrenceDate,
                  });
                };
                return (
                  <TouchableOpacity
                    key={`${r.activityId}-${r.occurrenceDate}`}
                    activeOpacity={0.75}
                    onPress={openReport}
                    style={{
                      backgroundColor: 'rgba(232,162,40,0.08)',
                      borderRadius: radius.md, padding: spacing.md, marginBottom: 6,
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(232,162,40,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="clipboard-outline" size={16} color="#E8A228" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: font.weights.semibold, color: colors.text }}>
                        {r.activityName}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        {r.childName} · {formatShortDate(r.occurrenceDate)}
                        {r.daysAgo > 0 ? ` (há ${r.daysAgo}d)` : ''}
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: '#E8A228', paddingHorizontal: spacing.md, paddingVertical: 6,
                        borderRadius: radius.full,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: font.weights.semibold }}>{t('activityReport.reportNow')}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* === PENDING SWAPS (detailed cards) === */}
        {(data?.pendingSwapsList.length || 0) > 0 ? (
          <Animated.View entering={FadeInDown.delay(240).duration(400)}>
            <View style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg,
              marginBottom: spacing.lg, ...shadows.sm,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 10, fontWeight: font.weights.bold, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                  🔄 Trocas de guarda
                </Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/calendario')}>
                  <Text style={{ fontSize: 10, color: colors.brand, fontWeight: font.weights.semibold }}>{t('dashboard.viewAllFeminine')}</Text>
                </TouchableOpacity>
              </View>
              {data!.pendingSwapsList.map((s, i) => {
                const orig = formatDatePt(s.originalDate);
                const prop = s.proposedDate ? formatDatePt(s.proposedDate) : null;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/calendario'); }}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      paddingVertical: spacing.sm,
                      borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                    }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${colors.secondary}20`, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14 }}>🔄</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: font.weights.medium, color: colors.text }} numberOfLines={1}>
                        {s.requesterName} quer trocar {orig}{prop ? ` por ${prop}` : ''}
                      </Text>
                      {s.reason ? (
                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                          {s.reason}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* === PENDING EXPENSES (cards) === */}
        {(data?.pendingExpensesList.length || 0) > 0 ? (
          <Animated.View entering={FadeInDown.delay(260).duration(400)}>
            <View style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg,
              marginBottom: spacing.lg, ...shadows.sm,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 10, fontWeight: font.weights.bold, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                  🧾 Despesas pra aprovar
                </Text>
                <TouchableOpacity onPress={() => router.push('/despesas')}>
                  <Text style={{ fontSize: 10, color: colors.brand, fontWeight: font.weights.semibold }}>{t('dashboard.viewAllFeminine')}</Text>
                </TouchableOpacity>
              </View>
              {data!.pendingExpensesList.slice(0, 3).map((e, i) => (
                <TouchableOpacity
                  key={e.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/despesas'); }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    paddingVertical: spacing.sm,
                    borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${colors.accent}20`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14 }}>💳</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: font.weights.medium, color: colors.text }} numberOfLines={1}>
                      {e.description}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                      {e.paidByName} · {formatBRL(e.amount)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        ) : null}

        {/* Saldo financeiro foi removido do dashboard — PWA nao exibe saldo
            na home. Usuario acha em Financeiro via grid "Ações rápidas" ou
            em Despesas. Manter saldo aqui violava hierarquia de prioridade
            (ponto #8 da auditoria UX). */}

        {/* === HEALTH BLOCK — matches PWA childHealthSummaries === */}
        {(data?.childHealthSummaries?.length || 0) > 0 ? (
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <View style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg,
              marginBottom: spacing.lg, ...shadows.sm,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="pulse-outline" size={12} color={data?.hasAnyCriticalChild ? '#EF4444' : '#5B9E85'} />
                  <Text style={{ fontSize: 10, fontWeight: font.weights.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    Saude
                  </Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(tabs)/saude')}>
                  <Text style={{ fontSize: 10, color: colors.brand, fontWeight: font.weights.semibold }}>{t('common.viewAll')}</Text>
                </TouchableOpacity>
              </View>
              {data!.childHealthSummaries.map((h, i) => {
                const statusConfig = {
                  healthy:    { dot: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)',  text: '#15803d' },
                  monitoring: { dot: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', text: '#b45309' },
                  treatment:  { dot: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)', text: '#b91c1c' },
                }[h.status];
                return (
                  <TouchableOpacity
                    key={h.childId}
                    activeOpacity={0.8}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/(tabs)/saude?child=${h.childId}` as Parameters<typeof router.push>[0]); }}
                    style={{
                      backgroundColor: statusConfig.bg,
                      borderWidth: 1, borderColor: statusConfig.border, borderRadius: radius.md,
                      padding: spacing.md, marginTop: i > 0 ? 6 : 0,
                      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                    }}
                  >
                    <View style={{
                      width: 34, height: 34, borderRadius: 17,
                      backgroundColor: 'rgba(255,255,255,0.85)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 14, fontWeight: font.weights.bold, color: colors.brand }}>
                        {h.childName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusConfig.dot }} />
                        <Text style={{ fontSize: 13, fontWeight: font.weights.semibold, color: colors.text, flex: 1 }} numberOfLines={1}>
                          {h.childName}
                        </Text>
                        <Text style={{ fontSize: 10, color: statusConfig.text, fontWeight: font.weights.semibold }}>
                          {h.statusLabel}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                        {h.detail}
                      </Text>
                    </View>
                    {h.nextAction ? (
                      <View style={{
                        backgroundColor: '#fff', ...shadows.sm, borderRadius: 8,
                        paddingHorizontal: 8, paddingVertical: 5,
                      }}>
                        <Text style={{ fontSize: 9, color: colors.brand, fontWeight: font.weights.bold }}>
                          {h.nextAction}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* === QUICK ACTIONS === */}
        <Animated.View entering={FadeInDown.delay(320).duration(400)}>
          <Text style={{ fontSize: 10, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: spacing.sm }}>
            {t('dashboard.quickActions')}
          </Text>

          {/* Primary CTA — Nova despesa */}
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/despesas/nova'); }}
            activeOpacity={0.85}
            testID="home-cta-nova-despesa"
            accessibilityLabel={t('dashboard.newExpense')}
            style={{
              backgroundColor: colors.brand, borderRadius: radius.xl,
              padding: spacing.lg, marginBottom: spacing.sm,
              flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.sm,
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: font.weights.bold, color: '#fff' }}>
                {t('dashboard.newExpense')}
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
                {t('dashboard.registerSharedExpense')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          {/* Secondary grid 3x2 — match PWA order */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {[
              { icon: 'calendar-outline' as const, label: 'Agenda', route: '/(tabs)/calendario', color: '#5B9E85', testID: 'home-card-calendar' },
              { icon: 'stats-chart-outline' as const, label: 'Análise da última semana', route: '/semana', color: '#3B82F6', testID: 'home-card-semana' },
              { icon: 'document-outline' as const, label: 'Documentos', route: '/documentos', color: '#F59E0B', testID: 'home-card-documentos' },
              { icon: 'cash-outline' as const, label: 'Financeiro', route: '/financeiro', color: '#5B9E85', testID: 'home-card-finance' },
              { icon: 'reader-outline' as const, label: 'Acordos', route: '/acordos', color: '#F59E0B', testID: 'home-card-acordos' },
              { icon: 'heart-outline' as const, label: 'Saúde', route: '/(tabs)/saude', color: '#EF4444', testID: 'home-card-health' },
            ].map(action => (
              <TouchableOpacity
                key={action.label}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(action.route as Parameters<typeof router.push>[0]);
                }}
                activeOpacity={0.75}
                testID={action.testID}
                accessibilityLabel={action.label}
                style={{
                  width: '31.5%', backgroundColor: colors.bgElevated, borderRadius: radius.xl,
                  padding: spacing.md, alignItems: 'center', gap: spacing.xs, minHeight: 92, ...shadows.sm,
                }}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 12,
                  backgroundColor: `${action.color}15`,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={action.icon} size={18} color={action.color} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: font.weights.medium, color: colors.text, textAlign: 'center' }} numberOfLines={2}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Activity Report Modal */}
      {reportModal?.open && activeGroup && userId ? (
        <ActivityReportModal
          visible={reportModal.open}
          onClose={() => setReportModal(null)}
          groupId={activeGroup.groupId}
          activityId={reportModal.activityId}
          activityName={reportModal.activityName}
          childId={reportModal.childId}
          reporterId={userId}
          occurrenceDate={reportModal.occurrenceDate}
          onSubmitted={refresh}
        />
      ) : null}

      {/* Activity Checklist Modal — opens when user taps a Hoje/Amanhã
          card. Mostra o que precisa preparar/levar pra essa atividade
          específica em vez de mandar pra lista de todas as atividades. */}
      {checklistModal && userId ? (
        <ActivityChecklistModal
          visible={!!checklistModal}
          onClose={() => setChecklistModal(null)}
          activityId={checklistModal.activityId}
          activityName={checklistModal.activityName}
          occurrenceDate={checklistModal.occurrenceDate}
          completedBy={userId}
        />
      ) : null}
    </>
  );
}
