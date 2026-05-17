import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Modal, Pressable, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useCalendar, type CalendarEvent } from 'src/hooks/useCalendar';
import { useAuth } from 'src/store/auth';
import { DAY_NAMES, MONTH_NAMES } from 'src/lib/constants';
import { getHolidayMap } from 'src/lib/brazilian-holidays';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { respondToSwap, cancelMySwap } from 'src/services/swaps';
import { respondToEventRequest, type EventRequest } from 'src/services/event-requests';
import WeekendPlanner from 'src/components/calendar/WeekendPlanner';
import SwapRequestModal from 'src/components/calendar/SwapRequestModal';
import SwapBalanceCard from 'src/components/calendar/SwapBalanceCard';
import { syncEventsToDeviceCalendar } from 'src/services/calendar-sync';
import { useToast } from 'src/components/ui/ToastProvider';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import { useI18n } from 'src/i18n';

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatSwapDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${MONTHS_SHORT[(m || 1) - 1]}`;
}

function getDaysInMonth(y: number, m: number): number { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfWeek(y: number, m: number): number { return new Date(y, m, 1).getDay(); }

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { events, custodyEvents, members, pendingSwaps, mySentSwaps, balanceOps, pendingEventRequests, refresh } = useCalendar();
  const { activeGroup, userId } = useAuth();
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  // FIX 2026-05-17: Push de aniversário (birthdays cron) envia `?day=<YYYY-MM-DD>`
  // mas a tela ignorava — abria mês corrente sem destacar o dia. Agora lê e
  // sincroniza via "derived state" pattern (sem useEffect — evita
  // react-hooks/set-state-in-effect lint rule).
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const [selectedDay, setSelectedDay] = useState<string | null>(dayParam ?? null);
  const [lastDayParam, setLastDayParam] = useState<string | undefined>(dayParam);
  // Padrão React "derive state during render": compara prop com snapshot
  // anterior. Se mudou, atualiza ambos. Não dispara cascading render
  // (atualização inline durante render é estável).
  if (dayParam !== lastDayParam) {
    setLastDayParam(dayParam);
    if (dayParam) setSelectedDay(dayParam);
  }
  const [responding, setResponding] = useState<string | null>(null);
  // SwapContext: snapshot dos dados necessarios quando o user toca em
  // "Pedir troca" / "Oferecer troca" / "Pedir visita" no Day Sheet. Antes
  // de abrir o SwapRequestModal, fechamos o Day Sheet (RN nao stacka 2
  // <Modal> em iOS — segundo modal nao aparecia, parecia que "nada
  // acontecia"). O snapshot garante que o SwapRequestModal continue tendo
  // todos os dados necessarios mesmo apos selectedDay virar null.
  const [swapContext, setSwapContext] = useState<{
    date: string;
    targetUserId: string;
    targetUserName: string;
    targetColor: string;
    isVisit: boolean;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleEventRequestDecision = useCallback(async (
    request: EventRequest,
    decision: 'approved' | 'rejected'
  ) => {
    if (!activeGroup || !userId) return;
    setResponding(request.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await respondToEventRequest(request.id, decision, userId, activeGroup.groupId);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
    setResponding(null);
  }, [activeGroup, userId, refresh, t, toast]);

  const handleSwapDecision = useCallback(async (
    swapId: string,
    decision: 'approved' | 'rejected',
    requesterId: string,
    originalDate: string
  ) => {
    if (!activeGroup) return;
    setResponding(swapId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await respondToSwap(swapId, decision, activeGroup.groupId, requesterId, originalDate);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setResponding(null);
  }, [activeGroup, refresh]);

  const handleCancelMySwap = useCallback((swapId: string, originalDate: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Cancelar pedido?',
      `Você vai retirar a solicitação de troca para ${formatSwapDate(originalDate)}. O outro responsável será avisado.`,
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
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await refresh();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast.show({ message: r.error || t('toasts.common.fallbackError'), variant: 'error' });
            }
          },
        },
      ],
    );
  }, [refresh, t, toast]);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const todayKey = formatDateKey(today);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrow);

  const holidays = useMemo(() => getHolidayMap(viewYear), [viewYear]);

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };
  const goPrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const goToday = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMonth(new Date().getMonth());
    setViewYear(new Date().getFullYear());
  };

  // Event map per day
  const eventMap = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of events) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [events]);

  // Detect tomorrow's custody change for the alert banner
  const tomorrowSwapInfo = useMemo(() => {
    if (!activeGroup?.custodyEnabled || !userId) return null;
    const todayCustody = (eventMap[todayKey] || []).find(e => e.type === 'custody');
    const tmwCustody = (eventMap[tomorrowKey] || []).find(e => e.type === 'custody');
    if (!todayCustody || !tmwCustody) return null;
    if (todayCustody.responsibleId === tmwCustody.responsibleId) return null;
    const tmwPerson = members.find(m => m.userId === tmwCustody.responsibleId);
    return {
      childName: tmwCustody.title,
      nextPerson: tmwPerson?.name || 'o outro responsável',
      isWithMeTomorrow: tmwCustody.responsibleId === userId,
    };
  }, [eventMap, todayKey, tomorrowKey, members, userId, activeGroup?.custodyEnabled]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Defense-in-depth: dedup custody pra mesma crianca no day sheet.
  // useCalendar ja deduplica desde commit ede2ece, mas se algum payload
  // legado (cache, race condition) trouxer 2 entries custody pra mesma
  // crianca+dia, mantemos so o primeiro (swap ganha — ordem garantida
  // pelo useCalendar). Sem isso, dia 16/05 do Bernardo aparecia 2x
  // "Bernardo Guarda" (regular+swap) bug 2026-05-11.
  const selectedEvents = useMemo(() => {
    if (!selectedDay) return [] as CalendarEvent[];
    const raw = eventMap[selectedDay] || [];
    const seenCustody = new Set<string>();
    const out: CalendarEvent[] = [];
    for (const ev of raw) {
      if (ev.type === 'custody') {
        // Usa title (nome da crianca) como discriminador. responsibleId
        // muda entre regular vs swap — nao serve como chave.
        const key = ev.title || '__group__';
        if (seenCustody.has(key)) continue;
        seenCustody.add(key);
      }
      out.push(ev);
    }
    return out;
  }, [selectedDay, eventMap]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: title + schedule + add-event buttons */}
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: spacing.lg, marginBottom: spacing.lg,
        }}>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text }}>
            Calendário
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {!activeGroup?.isReadonly ? (
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/calendario/escala'); }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Configurar escala de guarda"
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: colors.bgElevated, ...shadows.sm,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="calendar" size={20} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            {!activeGroup?.isReadonly ? (
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/calendario/ferias'); }}
                hitSlop={6}
                testID="calendar-fab-ferias"
                accessibilityRole="button"
                accessibilityLabel="Adicionar período de férias"
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: colors.bgElevated, ...shadows.sm,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="airplane-outline" size={20} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/calendario/novo'); }}
              hitSlop={6}
              testID="calendar-fab-novo"
              accessibilityRole="button"
              accessibilityLabel="Novo evento"
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: colors.brand, ...shadows.sm,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tomorrow swap alert */}
        {tomorrowSwapInfo ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <View style={{
              marginHorizontal: spacing.lg, marginBottom: spacing.lg,
              backgroundColor: 'rgba(232,162,40,0.1)', borderRadius: radius.xl,
              borderWidth: 1, borderColor: 'rgba(232,162,40,0.3)',
              padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            }}>
              <Ionicons name="sync-outline" size={20} color="#b45309" />
              <Text style={{ flex: 1, fontSize: font.sizes.sm, color: '#b45309', fontWeight: font.weights.medium }}>
                Amanhã: troca de guarda — {tomorrowSwapInfo.childName} estará com {tomorrowSwapInfo.isWithMeTomorrow ? 'você' : tomorrowSwapInfo.nextPerson}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Pending Swap Banner */}
        {pendingSwaps.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <View style={{
              marginHorizontal: spacing.lg, marginBottom: spacing.lg,
              backgroundColor: `${colors.secondary}10`, borderRadius: radius.xl,
              borderWidth: 1, borderColor: `${colors.secondary}30`,
              padding: spacing.lg,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 18 }}>🔄</Text>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                  {pendingSwaps.length === 1 ? '1 troca pendente' : `${pendingSwaps.length} trocas pendentes`}
                </Text>
              </View>
              {pendingSwaps.map((s, i) => (
                <View
                  key={s.id}
                  style={{
                    paddingVertical: spacing.sm,
                    borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                  }}
                >
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
                    {s.requesterName} quer trocar {formatSwapDate(s.originalDate)}
                    {s.proposedDate ? ` por ${formatSwapDate(s.proposedDate)}` : ''}
                  </Text>
                  {s.reason ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' }}>
                      {`\u201C${s.reason}\u201D`}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <TouchableOpacity
                      disabled={responding === s.id}
                      onPress={() => handleSwapDecision(s.id, 'rejected', s.requesterId, s.originalDate)}
                      accessibilityRole="button"
                      accessibilityLabel={`Rejeitar troca de ${s.requesterName}`}
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
                      accessibilityRole="button"
                      accessibilityLabel={`Aprovar troca de ${s.requesterName}`}
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
              ))}
            </View>
          </Animated.View>
        ) : null}

        {/* Meus pedidos de troca enviados — pode cancelar enquanto pending */}
        {mySentSwaps.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <View style={{
              marginHorizontal: spacing.lg, marginBottom: spacing.lg,
              backgroundColor: `${colors.brand}08`, borderRadius: radius.xl,
              borderWidth: 1, borderColor: `${colors.brand}25`,
              padding: spacing.lg,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 18 }}>📤</Text>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                  {mySentSwaps.length === 1 ? '1 pedido aguardando resposta' : `${mySentSwaps.length} pedidos aguardando resposta`}
                </Text>
              </View>
              {mySentSwaps.map((s, i) => {
                const targetMember = members.find(m => m.userId === s.targetUserId);
                const targetName = targetMember?.name || 'Co-responsável';
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
                      Aguardando {targetName}
                    </Text>
                    {s.reason ? (
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' }}>
                        {`“${s.reason}”`}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      disabled={responding === s.id}
                      onPress={() => handleCancelMySwap(s.id, s.originalDate)}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancelar pedido de troca em ${formatSwapDate(s.originalDate)}`}
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

        {/* Pending Event-Action Requests (edit/cancel/reschedule/delete) */}
        {pendingEventRequests.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <View style={{
              marginHorizontal: spacing.lg, marginBottom: spacing.lg,
              backgroundColor: `${colors.brand}10`, borderRadius: radius.xl,
              borderWidth: 1, borderColor: `${colors.brand}30`,
              padding: spacing.lg,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 18 }}>📝</Text>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                  {pendingEventRequests.length === 1
                    ? '1 solicitação aguardando você'
                    : `${pendingEventRequests.length} solicitações aguardando você`}
                </Text>
              </View>
              {pendingEventRequests.map((r, i) => {
                const actionLabel: Record<string, string> = {
                  edit: 'editar',
                  cancel: 'cancelar',
                  reschedule: 'reagendar',
                  delete: 'excluir',
                };
                const actionIcon: Record<string, string> = {
                  edit: '✏️', cancel: '❌', reschedule: '📅', delete: '🗑️',
                };
                return (
                  <View
                    key={r.id}
                    style={{
                      paddingVertical: spacing.sm,
                      borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                      <Text style={{ fontSize: 14 }}>{actionIcon[r.action_type] || '•'}</Text>
                      <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
                        {r.requesterName || 'Coparente'} quer {actionLabel[r.action_type] || 'alterar'}{' '}
                        <Text style={{ fontWeight: font.weights.semibold }}>
                          &ldquo;{r.eventTitle || 'evento'}&rdquo;
                        </Text>
                      </Text>
                    </View>
                    {r.reason ? (
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2, marginLeft: 22, fontStyle: 'italic' }}>
                        {`“${r.reason}”`}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                      <TouchableOpacity
                        disabled={responding === r.id}
                        onPress={() => handleEventRequestDecision(r, 'rejected')}
                        testID={`event-req-reject-${r.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Rejeitar solicitação de ${r.requesterName || 'coparente'}`}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: radius.md,
                          borderWidth: 1, borderColor: colors.borderLight,
                          alignItems: 'center', opacity: responding === r.id ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                          Rejeitar
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={responding === r.id}
                        onPress={() => handleEventRequestDecision(r, 'approved')}
                        testID={`event-req-approve-${r.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Aprovar solicitação de ${r.requesterName || 'coparente'}`}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: radius.md,
                          backgroundColor: colors.brand,
                          alignItems: 'center', opacity: responding === r.id ? 0.5 : 1,
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

        {/* Calendar card: month header + grid + legend */}
        <View style={{
          marginHorizontal: spacing.lg, marginBottom: spacing.lg,
          backgroundColor: colors.bgElevated, borderRadius: radius.xl,
          padding: spacing.lg, ...shadows.sm,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <TouchableOpacity
              onPress={goPrev}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Mês anterior"
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goToday}
              accessibilityRole="button"
              accessibilityLabel={`${MONTH_NAMES[viewMonth]} de ${viewYear}. Tocar para voltar ao mês atual.`}
            >
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goNext}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Próximo mês"
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {DAY_NAMES.map(d => (
              <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: font.weights.semibold, color: colors.textMuted, letterSpacing: 0.5 }}>
                  {d}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar grid — Apple style with event pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <View key={`empty-${i}`} style={{ width: '14.2857%', height: 72 }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateKey === todayKey;
              const dayEvents = eventMap[dateKey] || [];
              const custody = dayEvents.find(e => e.type === 'custody');
              const activities = dayEvents.filter(e => e.type === 'activity');
              const socials = dayEvents.filter(e => e.type === 'event');
              const appointments = dayEvents.filter(e => e.type === 'appointment');
              const holiday = holidays[dateKey];
              // Up to 2 visible pills; rest → +N
              const pills = [...appointments, ...activities, ...socials];
              const visible = pills.slice(0, 2);
              const extra = pills.length - visible.length;

              const custodyResponsible = custody && members.find(m => m.userId === custody.responsibleId);
              const custodyHint = custody
                ? `, guarda com ${custody.responsibleId === userId ? 'você' : (custodyResponsible?.name || 'coparente')}`
                : '';
              const eventsHint = pills.length > 0
                ? `, ${pills.length} ${pills.length === 1 ? 'evento' : 'eventos'}`
                : '';
              const holidayHint = holiday ? `, feriado: ${holiday}` : '';
              const todayHint = isToday ? ', hoje' : '';
              return (
                <TouchableOpacity
                  key={day}
                  activeOpacity={0.75}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDay(dateKey);
                  }}
                  testID={`calendar-day-${dateKey}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Dia ${day} de ${MONTH_NAMES[viewMonth]}${todayHint}${custodyHint}${eventsHint}${holidayHint}`}
                  style={{
                    width: '14.2857%', height: 72, padding: 2,
                  }}
                >
                  <View style={{
                    flex: 1, borderRadius: 8, overflow: 'hidden',
                    backgroundColor: custody ? `${custody.color}12`
                      : holiday ? 'rgba(168,85,247,0.05)' : 'transparent',
                    padding: 3,
                  }}>
                    {/* Top: day number + dots */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{
                        width: 18, height: 18, borderRadius: 9,
                        backgroundColor: isToday ? colors.brand : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: font.weights.semibold,
                          color: isToday ? '#fff' : holiday ? '#a855f7' : colors.text,
                        }}>
                          {day}
                        </Text>
                      </View>
                      {holiday ? (
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#a855f7' }} />
                      ) : null}
                    </View>

                    {/* Holiday name */}
                    {holiday ? (
                      <Text numberOfLines={1} style={{ fontSize: 7, color: '#a855f7', fontWeight: font.weights.medium, marginTop: 1 }}>
                        {holiday}
                      </Text>
                    ) : null}

                    {/* Event pills */}
                    <View style={{ flex: 1, gap: 1, marginTop: 2 }}>
                      {visible.map(act => (
                        <View
                          key={act.id}
                          style={{
                            backgroundColor: `${act.color}25`,
                            borderRadius: 2,
                            paddingHorizontal: 3, paddingVertical: 1,
                          }}
                        >
                          <Text numberOfLines={1} style={{ fontSize: 8, color: act.color, fontWeight: font.weights.semibold }}>
                            {act.time ? `${act.time} ` : ''}{act.title}
                          </Text>
                        </View>
                      ))}
                      {extra > 0 ? (
                        <Text style={{ fontSize: 8, color: colors.textMuted, marginLeft: 2 }}>
                          +{extra}
                        </Text>
                      ) : null}
                    </View>

                    {/* Bottom custody bar */}
                    {custody ? (
                      <View style={{
                        position: 'absolute', left: 0, right: 0, bottom: 0, height: 3,
                        backgroundColor: custody.color,
                      }} />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={{
            flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
            marginTop: spacing.md, paddingTop: spacing.sm,
            borderTopWidth: 0.5, borderTopColor: colors.borderLight,
          }}>
            {members.map(m => (
              <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  {m.name}{m.userId === userId ? ' (você)' : ''}
                </Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#a855f7' }} />
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Feriado</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Atividade</Text>
            </View>
          </View>
        </View>

        {/* Schedule generator CTA — entry point for guarda config.
            Shown to any non-readonly member regardless of custody_enabled, so
            new groups (custody_enabled defaults to false) still have a way in.
            services/schedule.ts flips the flag to true once a schedule is saved. */}
        {!activeGroup?.isReadonly ? (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/calendario/escala'); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={activeGroup?.custodyEnabled ? 'Editar escala de guarda' : 'Configurar escala de guarda'}
            style={{
              marginHorizontal: spacing.lg, marginBottom: spacing.lg,
              backgroundColor: colors.brand, borderRadius: radius.xl,
              padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.sm,
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="git-network-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: font.weights.bold, color: '#fff' }}>
                {activeGroup?.custodyEnabled ? 'Editar escala de guarda' : 'Configurar escala de guarda'}
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
                {activeGroup?.custodyEnabled
                  ? 'Ajustar padrão 14 dias e regerar eventos'
                  : 'Definir quem fica com as crianças em cada dia'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        ) : null}

        {/* Weekend planner strip */}
        {activeGroup?.custodyEnabled && userId ? (
          <WeekendPlanner events={events} currentUserId={userId} />
        ) : null}

        {/* Balance card */}
        {activeGroup?.custodyEnabled && userId ? (
          <SwapBalanceCard
            operations={balanceOps}
            custodyEvents={custodyEvents}
            members={members}
            currentUserId={userId}
            groupId={activeGroup.groupId}
            onChanged={refresh}
          />
        ) : null}

        {/* Sync with native calendar */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Sincronizar com calendário do celular"
          accessibilityState={{ disabled: syncing }}
          onPress={async () => {
            if (syncing) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert(
              'Sincronizar com Celular',
              `Vamos exportar os próximos eventos (guarda, atividades, eventos) para o calendário "Kindar" no seu celular. Eventos anteriormente sincronizados serão substituídos.`,
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Sincronizar',
                  onPress: async () => {
                    setSyncing(true);
                    const memberNames: Record<string, string> = {};
                    members.forEach(m => { memberNames[m.userId] = m.name; });
                    const res = await syncEventsToDeviceCalendar(events, memberNames);
                    setSyncing(false);
                    if (res.success) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      toast.show({ message: t('toasts.common.sent'), variant: 'success' });
                    } else {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
                    }
                  },
                },
              ]
            );
          }}
          activeOpacity={0.8}
          style={{
            marginHorizontal: spacing.lg, marginBottom: spacing.lg,
            backgroundColor: colors.bgElevated, borderRadius: radius.xl,
            padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, ...shadows.sm,
            opacity: syncing ? 0.5 : 1,
          }}
          disabled={syncing}
        >
          {syncing ? (
            <Ionicons name="sync" size={18} color={colors.brand} />
          ) : (
            <Ionicons name="calendar-outline" size={18} color={colors.brand} />
          )}
          <Text style={{ fontSize: font.sizes.sm, color: colors.brand, fontWeight: font.weights.semibold }}>
            {syncing ? 'Sincronizando...' : 'Sincronizar com Celular'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Day Detail Sheet */}
      <Modal visible={!!selectedDay} transparent animationType="slide" onRequestClose={() => setSelectedDay(null)}>
        <ModalBackdrop onClose={() => setSelectedDay(null)} align="bottom" dim={0.3} padding={0}>
        <View style={{
          backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
          paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 36,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.md }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              {selectedDay ? (() => {
                const [y, m, d] = selectedDay.split('-').map(Number);
                const date = new Date(y, m - 1, d);
                // Estilo Apple Calendar: "Qua, 6 de mai" (compacto, escaneavel).
                const dayName = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][date.getDay()];
                return `${dayName}, ${d} de ${MONTH_NAMES[m - 1]?.toLowerCase().slice(0, 3) || ''}`;
              })() : ''}
            </Text>
            {selectedEvents.length > 0 ? (
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium }}>
                {selectedEvents.length} {selectedEvents.length === 1 ? 'item' : 'itens'}
              </Text>
            ) : null}
          </View>

          {selectedDay && holidays[selectedDay] ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#a855f7' }} />
              <Text style={{ fontSize: font.sizes.xs, color: '#a855f7', fontWeight: font.weights.medium }}>
                Feriado: {holidays[selectedDay]}
              </Text>
            </View>
          ) : null}

          {selectedEvents.length === 0 ? (
            // Dia vazio compacto: 1 linha de copy + 3 chips de acao em row.
            // Antes ocupava meia tela com hierarquia exagerada — agora cabe
            // em ~140px e nao parece "tela morta com botao gigante".
            <>
              <Text style={{
                color: colors.textMuted, fontSize: font.sizes.sm,
                marginBottom: spacing.md,
              }}>
                Nada agendado por aqui. O que você quer registrar?
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const day = selectedDay;
                    setSelectedDay(null);
                    router.push({ pathname: '/calendario/novo', params: { date: day || '' } } as never);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Novo evento"
                  style={{
                    flex: 1.4, backgroundColor: colors.brand, borderRadius: radius.md,
                    paddingVertical: spacing.md, flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.bold }}>
                    Evento
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDay(null);
                    router.push('/saude/registrar' as never);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Registrar consulta"
                  style={{
                    flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md,
                    paddingVertical: spacing.md, flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Ionicons name="medkit-outline" size={14} color={colors.text} />
                  <Text style={{ color: colors.text, fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>
                    Consulta
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDay(null);
                    router.push('/atividades/nova' as never);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Nova atividade recorrente"
                  style={{
                    flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md,
                    paddingVertical: spacing.md, flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Ionicons name="repeat" size={14} color={colors.text} />
                  <Text style={{ color: colors.text, fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>
                    Atividade
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <ScrollView style={{ maxHeight: 320 }}>
              {selectedEvents.map((e, i) => {
                const isSchool = !!e.schoolLogId;
                const isCustody = e.type === 'custody';
                const isClickable = !isCustody; // custody usa as quick actions abaixo
                const renderBody = (pressed: boolean) => (
                  <View testID={`calendar-event-${e.id}`} style={{
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
                    borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                    backgroundColor: pressed ? colors.bgSurface : 'transparent',
                    borderRadius: pressed ? radius.sm : 0,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
                  }}>
                    <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: e.color }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                        {e.title}
                      </Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                        {e.type === 'custody'
                          ? (e.custodyType === 'vacation' ? '✈️ Férias'
                              : e.custodyType === 'swap' ? '🔄 Troca'
                              : e.custodyType === 'holiday' ? '🎉 Feriado'
                              : 'Guarda')
                          : e.type === 'activity' ? 'Atividade'
                          : e.type === 'appointment' ? 'Consulta'
                          : isSchool ? 'Escola'
                          : 'Evento'}
                        {e.time ? ` · ${e.time}` : ''}
                      </Text>
                    </View>
                    {isClickable ? (
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    ) : null}
                  </View>
                );
                if (!isClickable) {
                  return <View key={e.id + '-' + i}>{renderBody(false)}</View>;
                }
                return (
                  <Pressable
                    key={e.id + '-' + i}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir ${e.title}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const day = selectedDay;
                      // Fechar Day Sheet ANTES de abrir qualquer outro Modal
                      // ou rota — RN nao stacka <Modal> sobrepostos limpa.
                      // Bug reportado: atividades pareciam nao responder.
                      if (isSchool && e.schoolLogId) {
                        // Tap em evento Escola → detalhe específico (igual /atividades/[id]
                        // e /eventos/[id]). Bug Barata 2026-05-14: antes ia pra /escola com
                        // ?highlight=<id>, mas UX esperada é abrir o card cheio com todos
                        // os campos. /escola/[id] espelha o pattern de saude/detalhe.
                        setSelectedDay(null);
                        router.push({ pathname: '/escola/[id]', params: { id: e.schoolLogId } } as never);
                        return;
                      }
                      if (e.type === 'activity' && day) {
                        // Navega pra rota dedicada em vez de abrir Modal
                        // aninhado — evita o "clique fantasma" (Modal+Modal
                        // + tap propagando pro CalendarGrid durante a
                        // transicao).
                        setSelectedDay(null);
                        router.push({ pathname: '/atividades/[id]', params: { id: e.id, date: day } } as never);
                        return;
                      }
                      if (e.type === 'appointment') {
                        setSelectedDay(null);
                        router.push('/saude/consultas' as never);
                        return;
                      }
                      if (e.type === 'event') {
                        // Navega pra rota dedicada de detalhe (paridade
                        // com /atividades/[id]). Antes ia pra lista
                        // generica perdendo contexto.
                        setSelectedDay(null);
                        router.push({ pathname: '/eventos/[id]', params: { id: e.id } } as never);
                        return;
                      }
                    }}
                  >
                    {({ pressed }) => renderBody(pressed)}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* CTA fixo: SEMPRE permite adicionar evento ao dia, mesmo
              quando ja existem outros. "Hub operacional" — eventos nunca
              bloqueiam novas acoes. Esconde quando o dia e vazio (que ja
              tem CTAs grandes la em cima). */}
          {selectedEvents.length > 0 ? (
            <View style={{
              flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg,
              paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.borderLight,
            }}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const day = selectedDay;
                  setSelectedDay(null);
                  router.push({ pathname: '/calendario/novo', params: { date: day || '' } } as never);
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Adicionar evento"
                style={{
                  flex: 1, backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md, flexDirection: 'row',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.bold }}>
                  Adicionar evento
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedDay(null);
                  router.push('/atividades/nova' as never);
                }}
                activeOpacity={0.8}
                style={{
                  width: 50, backgroundColor: colors.bgSurface, borderRadius: radius.md,
                  paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center',
                }}
                accessibilityRole="button"
                accessibilityLabel="Nova atividade recorrente"
              >
                <Ionicons name="repeat" size={18} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedDay(null);
                  router.push('/saude/registrar' as never);
                }}
                activeOpacity={0.8}
                style={{
                  width: 50, backgroundColor: colors.bgSurface, borderRadius: radius.md,
                  paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center',
                }}
                accessibilityRole="button"
                accessibilityLabel="Registrar evento de saúde"
              >
                <Ionicons name="medkit-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Quick actions for custody days — both own and other-parent days.
              Mirrors PWA PR #1 (allow swap request on own custody days). */}
          {(() => {
            if (!selectedDay || !activeGroup?.custodyEnabled || !userId) return null;
            const custodyEvent = selectedEvents.find(e => e.type === 'custody');
            if (!custodyEvent || !custodyEvent.responsibleId) return null;
            const isOwnDay = custodyEvent.responsibleId === userId;

            // openSwap: snapshot dos dados + fecha Day Sheet ANTES de abrir
            // SwapRequestModal. Sem isso, 2 <Modal> RN concorrentes em iOS
            // -> SwapRequestModal nao aparecia (bug "tem botoes mas nada
            // acontece" reportado pelo Henrique).
            const openSwap = (isVisit: boolean) => {
              const day = selectedDay;
              if (!day || !custodyEvent.responsibleId) return;
              const otherMember = members.find(m => m.userId !== userId);
              const targetUserId = isOwnDay
                ? (otherMember?.userId || '')
                : custodyEvent.responsibleId;
              if (!targetUserId) return;
              const targetMember = members.find(m => m.userId === targetUserId);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedDay(null); // fecha Day Sheet
              // pequeno delay deixa o Modal anterior fechar antes do novo abrir
              setTimeout(() => {
                setSwapContext({
                  date: day,
                  targetUserId,
                  targetUserName: targetMember?.name || 'Co-responsável',
                  targetColor: targetMember?.color || custodyEvent.color,
                  isVisit,
                });
              }, 220);
            };

            return (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <TouchableOpacity
                  onPress={() => openSwap(false)}
                  accessibilityRole="button"
                  accessibilityLabel={isOwnDay ? 'Oferecer troca' : 'Pedir troca'}
                  style={{
                    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                    backgroundColor: colors.brand, alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                    🔄 {isOwnDay ? 'Oferecer troca' : 'Pedir troca'}
                  </Text>
                </TouchableOpacity>
                {!isOwnDay ? (
                  <TouchableOpacity
                    onPress={() => openSwap(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Pedir visita"
                    style={{
                      flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                      borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                      👋 Pedir visita
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })()}
        </View>
        </ModalBackdrop>
      </Modal>

      {/* Swap request modal — abre apos snapshot. Independente do
          selectedDay (Day Sheet ja fechou). */}
      {swapContext && activeGroup?.custodyEnabled && userId ? (
        <SwapRequestModal
          visible
          onClose={() => setSwapContext(null)}
          onSubmitted={refresh}
          selectedDate={swapContext.date}
          targetUserId={swapContext.targetUserId}
          targetUserName={swapContext.targetUserName}
          targetColor={swapContext.targetColor}
          groupId={activeGroup.groupId}
          currentUserId={userId}
          isVisitRequest={swapContext.isVisit}
        />
      ) : null}

    </View>
  );
}
