import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Linking, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from 'src/store/auth';
import { useDashboard } from 'src/hooks/useDashboard';
import { respondToSwap, cancelMySwap } from 'src/services/swaps';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { ACTIVITY_CATEGORIES, QUICK_ACTIONS_CATALOG_NATIVE, DEFAULT_QUICK_ACTIONS_NATIVE } from 'src/lib/constants';
import ActivityReportModal from 'src/components/activities/ActivityReportModal';
import ActivityDetailSheet from 'src/components/activities/ActivityDetailSheet';
import QuickActionsModal from 'src/components/QuickActionsModal';
import ChildAvatar from 'src/components/ui/ChildAvatar';
import { track, EVENTS } from 'src/lib/analytics';

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
  const { activeGroup, userId, profile } = useAuth();
  const { data, loading, refresh } = useDashboard();
  const t = useI18n(s => s.t);
  const [refreshing, setRefreshing] = useState(false);
  const [showQAModal, setShowQAModal] = useState(false);
  const [reportModal, setReportModal] = useState<{
    open: boolean; activityId: string; activityName: string; childId: string | null; occurrenceDate: string;
  } | null>(null);
  // Tap on a Hoje/Amanhã activity card opens a rich detail sheet for that
  // specific occurrence — paridade com PWA DayDetailSheet (horário, local,
  // responsável, criança, checklist, ações share/edit/delete/relatar).
  const [activityDetail, setActivityDetail] = useState<{
    activityId: string; activityName: string; childId: string | null; occurrenceDate: string;
  } | null>(null);

  // Reused for activity card → checklist modal (occurrenceDate).
  // IMPORTANTE: data LOCAL, nunca toISOString() (que retorna UTC).
  // Em horario noturno no Brasil (UTC-3), UTC vira o dia seguinte e o
  // report era salvo com occurrence_date errada, fazendo o card "Atualizar"
  // nunca sumir mesmo apos salvar. useDashboard.ts:formatDateKey usa a
  // mesma logica — paridade com o que foi fetched.
  const formatLocalDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = formatLocalDate(new Date());
  const tomorrowIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatLocalDate(d);
  })();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Snapshot the user's unread state on each dashboard load. Mirrors
  // the PWA DashboardClient — same event name, same shape, so PostHog
  // can chart both surfaces together.
  useEffect(() => {
    if (typeof data?.schoolUnreadCount === 'number') {
      track(EVENTS.UNREAD_COUNT, { record_type: 'school_log', count: data.schoolUnreadCount });
    }
  }, [data?.schoolUnreadCount]);

  // Estado pra desabilitar botoes durante respostas a swap requests.
  // Espelha o calendar.tsx — paridade na UX de aprovar/rejeitar.
  const [responding, setResponding] = useState<string | null>(null);

  const handleSwapDecision = useCallback(async (
    swapId: string,
    decision: 'approved' | 'rejected',
    requesterId: string,
    originalDate: string,
  ) => {
    if (!activeGroup) return;
    setResponding(swapId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const result = await respondToSwap(swapId, decision, activeGroup.groupId, requesterId, originalDate);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await refresh();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Erro', result.error || 'Falha ao responder.');
    }
    setResponding(null);
  }, [activeGroup, refresh]);

  const handleCancelMySwap = useCallback((swapId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(
      'Cancelar pedido?',
      'Voce vai retirar a solicitacao de troca. O outro responsavel sera avisado.',
      [
        { text: 'Manter pedido', style: 'cancel' },
        {
          text: 'Cancelar pedido',
          style: 'destructive',
          onPress: async () => {
            setResponding(swapId);
            const r = await cancelMySwap(swapId);
            setResponding(null);
            if (r.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              await refresh();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              Alert.alert('Erro', r.error || 'Falha ao cancelar.');
            }
          },
        },
      ],
    );
  }, [refresh]);

  function formatSwapDate(iso: string): string {
    const [, m, d] = iso.split('-').map(Number);
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${d}/${months[(m || 1) - 1]}`;
  }

  if (!data && loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: font.sizes.md }}>{t('common.loading')}</Text>
      </View>
    );
  }

  // Fetch terminou (loading=false) mas data ficou null — timeout, rede caiu,
  // RLS bloqueou, etc. NUNCA deixar tela vazia ou em "Carregando..." pra
  // sempre. Empty state + botao retry pra desbloquear o user (bug Aline
  // 2026-05-11: hook prendia em loading=true; agora a tela cai aqui).
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }}>
        <Text style={{ fontSize: 48, marginBottom: spacing.md }}>📡</Text>
        <Text style={{ color: colors.text, fontSize: font.sizes.lg, fontWeight: '700', textAlign: 'center', marginBottom: spacing.sm }}>
          Não consegui carregar
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: font.sizes.md, textAlign: 'center', marginBottom: spacing.lg }}>
          Verifique sua conexão e tente de novo.
        </Text>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); refresh(); }}
          style={{ backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md }}
        >
          <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: '700' }}>Tentar de novo</Text>
        </TouchableOpacity>
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
              {/* WhatsApp Kindar — paridade PWA (ResponsiveShell:104). Cor
                  oficial #25D366. Abre conversa com o numero do bot. */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL('https://wa.me/5521999605044?text=Oi%20Kindar!').catch(() => {});
                }}
                hitSlop={6}
                testID="home-whatsapp"
                accessibilityLabel="Abrir WhatsApp Kindar"
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
              </TouchableOpacity>

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

              {/* Main info — agrupa filhos pelo responsavel:
                  - Todos com mesma pessoa: "Martim e Otto estao com voce"
                  - Distribuidos: "Martim com voce · Otto com Fernanda"
                  - 1 filho: comportamento original */}
              {(() => {
                const groupKey = (c: typeof firstCustody) => c.isWithMe ? '__me__' : c.responsibleName;
                const grouped = new Map<string, typeof data.custodyChildren>();
                data.custodyChildren.forEach(c => {
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
                  const verb = kids.length === 1 ? 'está' : 'estão';
                  const namesText = formatNames(kids.map(c => c.childFirstName));
                  return (
                    <>
                      <Text style={{ fontSize: 22, fontWeight: font.weights.bold, color: '#fff', lineHeight: 28 }}>
                        <Text style={{ color: '#D4735A' }}>{namesText}</Text>{' '}
                        {verb} com {who}
                      </Text>
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                        {namesText}{data.endDateLabel ? ` · ${data.endDateLabel}` : ''}
                      </Text>
                    </>
                  );
                }

                // Distribuidos: linha por filho
                return (
                  <View>
                    {data.custodyChildren.map((c) => {
                      const who = c.isWithMe ? 'você' : c.responsibleName;
                      return (
                        <Text key={c.childFirstName} style={{ fontSize: 18, fontWeight: font.weights.bold, color: '#fff', lineHeight: 24 }}>
                          <Text style={{ color: c.color || '#D4735A' }}>{c.childFirstName}</Text>{' '}
                          com {who}
                        </Text>
                      );
                    })}
                    {data.endDateLabel ? (
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                        {data.endDateLabel}
                      </Text>
                    ) : null}
                  </View>
                );
              })()}

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
                    <ChildAvatar photoUrl={child.photoUrl} firstName={child.firstName} size={44} />
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
                    const isEndedUnreported = act.state === 'ended-unreported';
                    const isEndedReported = act.state === 'ended-reported';

                    // Tap em encerrada-sem-relato vai DIRETO ao modal de
                    // Relatar — economiza o detail sheet quando a unica
                    // acao restante e relatar. As outras (upcoming /
                    // reportada) abrem o detail sheet normalmente.
                    const onPress = () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (isEndedUnreported) {
                        setReportModal({
                          open: true,
                          activityId: act.id,
                          activityName: act.name,
                          childId: act.childId,
                          occurrenceDate: todayIso,
                        });
                      } else {
                        setActivityDetail({
                          activityId: act.id,
                          activityName: act.name,
                          childId: act.childId,
                          occurrenceDate: todayIso,
                        });
                      }
                    };

                    return (
                      <TouchableOpacity
                        key={`today-${act.id}`}
                        activeOpacity={0.75}
                        onPress={onPress}
                        style={{
                          backgroundColor: isEndedUnreported ? 'rgba(232,162,40,0.08)' : colors.bgElevated,
                          borderWidth: isEndedUnreported ? 1 : 0,
                          borderColor: isEndedUnreported ? 'rgba(232,162,40,0.35)' : 'transparent',
                          borderRadius: radius.md,
                          padding: spacing.md, marginBottom: 6,
                          flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                          opacity: isEndedReported ? 0.6 : 1,
                          ...(isEndedUnreported ? null : shadows.sm),
                        }}
                      >
                        <View style={{
                          width: 36, height: 36, borderRadius: 10,
                          backgroundColor: isEndedUnreported ? 'rgba(232,162,40,0.2)' : `${colors.brand}15`,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ fontSize: 16 }}>{catIcon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{
                            fontSize: 13,
                            fontWeight: font.weights.semibold,
                            color: isEndedReported ? colors.textSecondary : colors.text,
                            textDecorationLine: isEndedReported ? 'line-through' : 'none',
                          }}>
                            {act.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            {act.timeStr ? <Text style={{ color: isEndedReported ? colors.textSecondary : colors.text, fontWeight: font.weights.medium }}>{act.timeStr}</Text> : null}
                            {act.childName ? ` · ${act.childName}` : ''}
                            {act.location ? ` · ${act.location}` : ''}
                          </Text>
                        </View>
                        {isEndedUnreported ? (
                          <View style={{
                            backgroundColor: '#E8A228', paddingHorizontal: spacing.md, paddingVertical: 4,
                            borderRadius: radius.full,
                          }}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: font.weights.bold }}>
                              {t('activityReport.reportNow')}
                            </Text>
                          </View>
                        ) : isEndedReported ? (
                          <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                        ) : (
                          <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
                        )}
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
                          setActivityDetail({
                            activityId: act.id,
                            activityName: act.name,
                            childId: act.childId,
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

        {/* === SCHOOL UNREAD (Collab Foundation — Fase 1) ===
             Single-line CTA when the other responsável criou registros
             escolares que voce nao abriu ainda. Tap → /escola. */}
        {(data?.schoolUnreadCount || 0) > 0 ? (
          <Animated.View entering={FadeInDown.delay(215).duration(400)}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/escola'); }}
              style={{
                backgroundColor: 'rgba(192,112,85,0.08)',
                borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg,
                flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                borderWidth: 1, borderColor: 'rgba(192,112,85,0.3)',
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(192,112,85,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>🎒</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: font.weights.semibold, color: colors.text }}>
                  {data!.schoolUnreadCount === 1 ? '1 registro escolar novo' : `${data!.schoolUnreadCount} registros escolares novos`}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                  Toque pra ver o que o outro responsável registrou.
                </Text>
              </View>
              <View style={{
                backgroundColor: colors.brand, paddingHorizontal: 8, paddingVertical: 2,
                borderRadius: radius.full, minWidth: 22, alignItems: 'center',
              }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: font.weights.bold }}>
                  {data!.schoolUnreadCount}
                </Text>
              </View>
            </TouchableOpacity>
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

        {/* === AMANHA: TROCA DE GUARDA (banner laranja) ===
            Pais com comunicacao dificil precisam saber se a custodia
            de amanha mudou — esse banner cobre exatamente esse caso. */}
        {data?.tomorrowSwapInfo ? (
          <Animated.View entering={FadeInDown.delay(230).duration(400)}>
            <View style={{
              backgroundColor: 'rgba(232,162,40,0.1)', borderRadius: radius.xl,
              borderWidth: 1, borderColor: 'rgba(232,162,40,0.3)',
              padding: spacing.md, flexDirection: 'row', alignItems: 'center',
              gap: spacing.sm, marginBottom: spacing.lg,
            }}>
              <Ionicons name="sync-outline" size={20} color="#b45309" />
              <Text style={{ flex: 1, fontSize: font.sizes.sm, color: '#b45309', fontWeight: font.weights.medium }}>
                Amanhã: troca de guarda — {data.tomorrowSwapInfo.childName} estará com {data.tomorrowSwapInfo.isWithMeTomorrow ? 'você' : data.tomorrowSwapInfo.nextPerson}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {/* === PENDING SWAPS — eu sou o target, com APROVAR/REJEITAR inline.
             Antes era so listagem passiva (tap pra ir pro calendar). Agora
             pais respondem direto do Inicio — acesso facil mesmo pra quem
             nao mexe muito no app. Espelha calendar.tsx l. 247-311. */}
        {(data?.pendingSwapsList.length || 0) > 0 ? (
          <Animated.View entering={FadeInDown.delay(235).duration(400)}>
            <View style={{
              marginBottom: spacing.lg,
              backgroundColor: `${colors.secondary}10`, borderRadius: radius.xl,
              borderWidth: 1, borderColor: `${colors.secondary}30`,
              padding: spacing.lg,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 18 }}>🔄</Text>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                  {data!.pendingSwapsList.length === 1 ? '1 troca pendente' : `${data!.pendingSwapsList.length} trocas pendentes`}
                </Text>
              </View>
              {data!.pendingSwapsList.map((s, i) => {
                const orig = formatSwapDate(s.originalDate);
                const prop = s.proposedDate ? formatSwapDate(s.proposedDate) : null;
                return (
                  <View
                    key={s.id}
                    style={{
                      paddingVertical: spacing.sm,
                      borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
                      {s.requesterName} quer trocar {orig}{prop ? ` por ${prop}` : ''}
                    </Text>
                    {s.reason ? (
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' }}>
                        {`“${s.reason}”`}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                      <TouchableOpacity
                        disabled={responding === s.id}
                        onPress={() => handleSwapDecision(s.id, 'rejected', s.requesterId, s.originalDate)}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: radius.md,
                          borderWidth: 1, borderColor: colors.borderLight,
                          alignItems: 'center', opacity: responding === s.id ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                          Rejeitar
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={responding === s.id}
                        onPress={() => handleSwapDecision(s.id, 'approved', s.requesterId, s.originalDate)}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: radius.md,
                          backgroundColor: colors.brand,
                          alignItems: 'center', opacity: responding === s.id ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                          Aprovar
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* === MEUS PEDIDOS ENVIADOS (aguardando o coparente responder) ===
             Botao "Cancelar pedido" inline — user nao precisa abrir
             calendario pra desistir. Espelha calendar.tsx l. 313-377. */}
        {(data?.mySentSwapsList.length || 0) > 0 ? (
          <Animated.View entering={FadeInDown.delay(240).duration(400)}>
            <View style={{
              marginBottom: spacing.lg,
              backgroundColor: `${colors.brand}08`, borderRadius: radius.xl,
              borderWidth: 1, borderColor: `${colors.brand}25`,
              padding: spacing.lg,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 18 }}>📤</Text>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                  {data!.mySentSwapsList.length === 1 ? '1 pedido aguardando resposta' : `${data!.mySentSwapsList.length} pedidos aguardando resposta`}
                </Text>
              </View>
              {data!.mySentSwapsList.map((s, i) => {
                const isVisit = s.type === 'visit' || (!s.proposedDate && s.reason?.toLowerCase().includes('visit'));
                const isDebt = !s.proposedDate && !isVisit;
                const summary = isVisit
                  ? `Pediu visita em ${formatSwapDate(s.originalDate)}`
                  : isDebt
                    ? `Pediu o dia ${formatSwapDate(s.originalDate)} (ficará devendo)`
                    : `Quer trocar ${formatSwapDate(s.originalDate)}${s.proposedDate ? ` por ${formatSwapDate(s.proposedDate)}` : ''}`;
                return (
                  <View
                    key={s.id}
                    style={{
                      paddingVertical: spacing.sm,
                      borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
                      {summary}
                    </Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                      Aguardando {s.targetName}
                    </Text>
                    {s.reason ? (
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' }}>
                        {`“${s.reason}”`}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      disabled={responding === s.id}
                      onPress={() => handleCancelMySwap(s.id)}
                      style={{
                        marginTop: spacing.sm,
                        paddingVertical: 8, borderRadius: radius.md,
                        borderWidth: 1, borderColor: colors.borderLight,
                        alignItems: 'center',
                        opacity: responding === s.id ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: colors.error, fontSize: font.sizes.xs, fontWeight: font.weights.medium }}>
                        Cancelar pedido
                      </Text>
                    </TouchableOpacity>
                  </View>
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
                    <ChildAvatar photoUrl={h.childPhotoUrl} firstName={h.childName} size={34} />
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
        {(() => {
          const catalogMap = Object.fromEntries(QUICK_ACTIONS_CATALOG_NATIVE.map(a => [a.id, a]));
          const qaConfig = profile?.quick_actions ?? null;
          const primaryId = qaConfig?.primary ?? DEFAULT_QUICK_ACTIONS_NATIVE.primary;
          const secondaryIds = qaConfig?.secondary ?? [...DEFAULT_QUICK_ACTIONS_NATIVE.secondary];
          const primaryAction = catalogMap[primaryId] ?? QUICK_ACTIONS_CATALOG_NATIVE[0];
          const secondaryActions = secondaryIds
            .map(id => catalogMap[id])
            .filter(Boolean)
            .slice(0, 6);

          return (
            <Animated.View entering={FadeInDown.delay(320).duration(400)}>
              {/* Section header with edit button */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 10, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                  {t('dashboard.quickActions')}
                </Text>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowQAModal(true); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: spacing.sm, paddingVertical: 4,
                    borderRadius: radius.full, backgroundColor: colors.bgSurface,
                  }}
                  accessibilityLabel={t('dashboard.editActionsHint')}
                >
                  <Ionicons name="pencil-outline" size={11} color={colors.textMuted} />
                  <Text style={{ fontSize: 10, fontWeight: font.weights.medium, color: colors.textMuted }}>
                    {t('dashboard.editActionsHint')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Primary CTA */}
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(primaryAction.href as Parameters<typeof router.push>[0]); }}
                activeOpacity={0.85}
                testID="home-cta-primary"
                accessibilityLabel={primaryAction.defaultLabel}
                style={{
                  backgroundColor: primaryAction.color, borderRadius: radius.xl,
                  padding: spacing.lg, marginBottom: spacing.sm,
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.sm,
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={primaryAction.icon as keyof typeof Ionicons.glyphMap} size={24} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: font.weights.bold, color: '#fff' }}>
                    {primaryAction.defaultLabel}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>

              {/* Secondary grid 3x2 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {secondaryActions.map(action => (
                  <TouchableOpacity
                    key={action.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(action.href as Parameters<typeof router.push>[0]);
                    }}
                    activeOpacity={0.75}
                    testID={`home-card-${action.id}`}
                    accessibilityLabel={action.defaultLabel}
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
                      <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={18} color={action.color} />
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: font.weights.medium, color: colors.text, textAlign: 'center' }} numberOfLines={2}>
                      {action.defaultLabel}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          );
        })()}
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

      {/* Activity Detail Sheet — rich bottom-sheet for the tapped Hoje/
          Amanhã card. Substitui o ChecklistModal simples (paridade PWA
          DayDetailSheet: horário, local, responsável, criança, checklist
          + ações share/edit/delete/relatar). */}
      {activityDetail && userId ? (
        <ActivityDetailSheet
          visible={!!activityDetail}
          onClose={() => setActivityDetail(null)}
          activityId={activityDetail.activityId}
          occurrenceDate={activityDetail.occurrenceDate}
          completedBy={userId}
          // Refresh do dashboard apos delete/edit — sem isso, o card
          // permanece visivel mesmo apos o user excluir.
          onChanged={refresh}
          onReport={() => {
            setReportModal({
              open: true,
              activityId: activityDetail.activityId,
              activityName: activityDetail.activityName,
              childId: activityDetail.childId,
              occurrenceDate: activityDetail.occurrenceDate,
            });
          }}
        />
      ) : null}

      <QuickActionsModal
        visible={showQAModal}
        onClose={() => setShowQAModal(false)}
      />
    </>
  );
}
