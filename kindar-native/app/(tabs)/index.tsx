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

const GREETING_MAP = { morning: 'Bom dia', afternoon: 'Boa tarde', evening: 'Boa noite' };

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
  // input: YYYY-MM-DD
  const [, m, d] = isoDate.split('-').map(Number);
  return `${d} de ${MONTHS_PT_SHORT[(m || 1) - 1]}`;
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
  const { activeGroup } = useAuth();
  const { data, loading, refresh } = useDashboard();
  useI18n(); // still initialize i18n context; t() used in future iterations
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (!data && loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: font.sizes.md }}>Carregando...</Text>
      </View>
    );
  }

  const greeting = data ? GREETING_MAP[data.greeting] : 'Ola';
  const firstName = data?.firstName || '';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 120, paddingHorizontal: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(0).duration(400)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing['2xl'] }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text }}>
              {greeting}, {firstName}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.xs }}>
              {data?.formattedDate}
            </Text>
            {activeGroup ? (
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                {activeGroup.groupName}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => router.push('/notificacoes')}
            style={{ position: 'relative', padding: spacing.sm }}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {(data?.unreadNotifications || 0) > 0 ? (
              <View style={{
                position: 'absolute', top: 4, right: 4, width: 16, height: 16,
                borderRadius: 8, backgroundColor: colors.error,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                  {data!.unreadNotifications > 9 ? '9+' : data!.unreadNotifications}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Custody Card */}
      {data?.hasCustody ? (
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
            marginBottom: spacing.lg, ...shadows.md,
          }}>
            <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md }}>
              Guarda Hoje
            </Text>
            {data.custodyChildren.map((child, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: i < data.custodyChildren.length - 1 ? spacing.md : 0 }}>
                <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: child.color }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                    {child.childFirstName}
                  </Text>
                  <Text style={{ fontSize: font.sizes.sm, color: child.isWithMe ? colors.brand : colors.textSecondary }}>
                    {child.isWithMe ? 'Com voce' : `Com ${child.responsibleName}`}
                  </Text>
                </View>
                <Ionicons
                  name={child.isWithMe ? 'home' : 'swap-horizontal'}
                  size={18}
                  color={child.isWithMe ? colors.brand : colors.textMuted}
                />
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

      {/* Critical child alert — shown above pending when any child in treatment */}
      {data?.hasAnyCriticalChild ? (
        <Animated.View entering={FadeInDown.delay(120).duration(400)}>
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

      {/* Pending Swaps — detailed cards */}
      {(data?.pendingSwapsList.length || 0) > 0 ? (
        <Animated.View entering={FadeInDown.delay(140).duration(400)}>
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
            marginBottom: spacing.lg, ...shadows.sm,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                🔄 Trocas de guarda
              </Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/calendario')}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>Ver todas</Text>
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
                    <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }} numberOfLines={1}>
                      {s.requesterName} quer trocar {orig}
                      {prop ? ` por ${prop}` : ''}
                    </Text>
                    {s.reason ? (
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
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

      {/* Pending Decisions — with category + deadline urgency */}
      {(data?.pendingDecisionsList.length || 0) > 0 ? (
        <Animated.View entering={FadeInDown.delay(160).duration(400)}>
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
            marginBottom: spacing.lg, ...shadows.sm,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                🗳️ Decisoes pra votar
              </Text>
              <TouchableOpacity onPress={() => router.push('/decisoes')}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>Ver todas</Text>
              </TouchableOpacity>
            </View>
            {data!.pendingDecisionsList.slice(0, 3).map((d, i) => {
              const icon = DECISION_CAT_ICONS[d.category] || '📋';
              const color = DECISION_CAT_COLORS[d.category] || colors.brand;
              const deadlineInfo = formatDeadline(d.deadline);
              return (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/decisoes'); }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    paddingVertical: spacing.sm,
                    borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${color}20`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14 }}>{icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }} numberOfLines={1}>
                      {d.title}
                    </Text>
                    {deadlineInfo ? (
                      <Text style={{ fontSize: font.sizes.xs, color: deadlineInfo.urgent ? colors.error : colors.textSecondary, marginTop: 2 }}>
                        {deadlineInfo.label}
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

      {/* Pending Expenses — with amount and who paid */}
      {(data?.pendingExpensesList.length || 0) > 0 ? (
        <Animated.View entering={FadeInDown.delay(180).duration(400)}>
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
            marginBottom: spacing.lg, ...shadows.sm,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                🧾 Despesas pra aprovar
              </Text>
              <TouchableOpacity onPress={() => router.push('/despesas')}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>Ver todas</Text>
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
                  <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }} numberOfLines={1}>
                    {e.description}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                    {e.paidByName} · {formatBRL(e.amount)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      ) : null}

      {/* Financial Balance */}
      {data?.balance !== undefined && data.balance !== 0 ? (
        <Animated.View entering={FadeInDown.delay(180).duration(400)}>
          <TouchableOpacity onPress={() => router.push('/financeiro')} activeOpacity={0.7} style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
            marginBottom: spacing.lg, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
          }}>
            <Text style={{ fontSize: 20 }}>💰</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Saldo financeiro</Text>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: data.balance >= 0 ? colors.success : colors.error }}>
                R$ {Math.abs(data.balance).toFixed(2)}
              </Text>
            </View>
            <Text style={{ fontSize: font.sizes.xs, color: data.balance >= 0 ? colors.success : colors.error, fontWeight: font.weights.medium }}>
              {data.balance >= 0 ? 'A receber' : 'A pagar'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* Today Activities */}
      {(data?.todayActivities?.length || 0) > 0 ? (
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
            marginBottom: spacing.lg, ...shadows.sm,
          }}>
            <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md }}>
              Atividades Hoje
            </Text>
            {data!.todayActivities.map((act, i) => {
              const catIcon = ACTIVITY_CATEGORIES.find(c => c.value === act.category)?.icon || '📌';
              return (
                <View key={act.id + i} style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  paddingVertical: spacing.sm,
                  borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                }}>
                  <Text style={{ fontSize: 18 }}>{catIcon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
                      {act.name}
                    </Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                      {[act.timeStr, act.childName, act.location].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>
      ) : null}

      {/* Tomorrow Activities */}
      {(data?.tomorrowActivities?.length || 0) > 0 ? (
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
            marginBottom: spacing.lg, ...shadows.sm,
          }}>
            <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md }}>
              Amanha
            </Text>
            {data!.tomorrowActivities.map((act, i) => {
              const catIcon = ACTIVITY_CATEGORIES.find(c => c.value === act.category)?.icon || '📌';
              return (
                <View key={act.id + i} style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  paddingVertical: spacing.sm,
                  borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                }}>
                  <Text style={{ fontSize: 18 }}>{catIcon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
                      {act.name}
                    </Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                      {[act.timeStr, act.childName, act.location].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>
      ) : null}

      {/* Health Summary — matches PWA childHealthSummaries block */}
      {(data?.childHealthSummaries?.length || 0) > 0 ? (
        <Animated.View entering={FadeInDown.delay(350).duration(400)}>
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
            marginBottom: spacing.lg, ...shadows.sm,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                Saude
              </Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/saude')}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>Ver tudo</Text>
              </TouchableOpacity>
            </View>
            {data!.childHealthSummaries.map((h, i) => {
              const statusConfig = {
                healthy: { icon: '🟢', color: colors.success, label: 'Saudavel' },
                monitoring: { icon: '🟡', color: colors.warning, label: 'Em observacao' },
                treatment: { icon: '🔴', color: colors.error, label: 'Em tratamento' },
              }[h.status];
              return (
                <View key={h.childId} style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  paddingVertical: spacing.sm,
                  borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                }}>
                  <Text style={{ fontSize: 16 }}>{statusConfig.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
                      {h.childName}
                    </Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{h.detail}</Text>
                  </View>
                  <Text style={{ fontSize: font.sizes.xs, color: statusConfig.color, fontWeight: font.weights.medium }}>
                    {statusConfig.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </Animated.View>
      ) : null}

      {/* Quick Actions */}
      <Animated.View entering={FadeInDown.delay(400).duration(400)}>
        <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md }}>
          Acesso Rapido
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {[
            { icon: 'wallet-outline' as const, label: 'Despesas', route: '/despesas', color: colors.accent },
            { icon: 'document-text-outline' as const, label: 'Documentos', route: '/documentos', color: colors.info },
            { icon: 'heart-outline' as const, label: 'Saude', route: '/(tabs)/saude', color: colors.error },
            { icon: 'people-outline' as const, label: 'Familia', route: '/familia', color: colors.violet },
            { icon: 'school-outline' as const, label: 'Escola', route: '/escola', color: colors.brand },
            { icon: 'flag-outline' as const, label: 'Eventos', route: '/eventos', color: colors.secondary },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(action.route as Parameters<typeof router.push>[0]);
              }}
              activeOpacity={0.7}
              style={{
                width: '30%', backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                padding: spacing.lg, alignItems: 'center', gap: spacing.sm, ...shadows.sm,
              }}
            >
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: `${action.color}15`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name={action.icon} size={20} color={action.color} />
              </View>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: colors.text, textAlign: 'center' }}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}
