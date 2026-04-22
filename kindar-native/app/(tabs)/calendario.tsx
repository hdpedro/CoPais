import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Modal, Pressable, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useCalendar, type CalendarEvent } from '../../src/hooks/useCalendar';
import { useAuth } from '../../src/store/auth';
import { DAY_NAMES, MONTH_NAMES } from '../../src/lib/constants';
import { getHolidayMap } from '../../src/lib/brazilian-holidays';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';
import { respondToSwap } from '../../src/services/swaps';
import WeekendPlanner from '../../src/components/calendar/WeekendPlanner';
import SwapRequestModal from '../../src/components/calendar/SwapRequestModal';
import SwapBalanceCard from '../../src/components/calendar/SwapBalanceCard';
import { syncEventsToDeviceCalendar } from '../../src/services/calendar-sync';

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
  const { events, members, pendingSwaps, balanceOps, refresh } = useCalendar();
  const { activeGroup, userId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapIsVisit, setSwapIsVisit] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
      nextPerson: tmwPerson?.name || 'o outro responsavel',
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

  const selectedEvents = selectedDay ? (eventMap[selectedDay] || []) : [];

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
            {activeGroup?.custodyEnabled ? (
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/calendario/escala'); }}
                hitSlop={6}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: colors.bgElevated, ...shadows.sm,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="calendar" size={20} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/calendario/novo'); }}
              hitSlop={6}
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
              ))}
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
            <TouchableOpacity onPress={goPrev} hitSlop={12} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={goToday}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goNext} hitSlop={12} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
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
              const holiday = holidays[dateKey];
              // Up to 2 visible pills; rest → +N
              const pills = [...activities, ...socials];
              const visible = pills.slice(0, 2);
              const extra = pills.length - visible.length;

              return (
                <TouchableOpacity
                  key={day}
                  activeOpacity={0.75}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDay(dateKey);
                  }}
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

        {/* Schedule generator CTA — this is the "gerar escala" entry point */}
        {activeGroup?.custodyEnabled ? (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/calendario/escala'); }}
            activeOpacity={0.85}
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
                Gerar escala de guarda
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
                Configurar padrão 14 dias e gerar eventos recorrentes
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
            members={members}
            currentUserId={userId}
            groupId={activeGroup.groupId}
            onChanged={refresh}
          />
        ) : null}

        {/* Sync with native calendar */}
        <TouchableOpacity
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
                      Alert.alert('Pronto', `${res.created || 0} evento(s) sincronizado(s). Veja no app Calendário do seu celular.`);
                    } else {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      Alert.alert('Erro', res.error || 'Falha ao sincronizar');
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
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setSelectedDay(null)} />
        <View style={{
          backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
          padding: spacing.xl, paddingBottom: 40, minHeight: 200,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />

          <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm }}>
            {selectedDay ? (() => {
              const [y, m, d] = selectedDay.split('-').map(Number);
              const date = new Date(y, m - 1, d);
              const dayName = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'][date.getDay()];
              return `${dayName}, ${d} de ${MONTH_NAMES[m - 1]}`;
            })() : ''}
          </Text>

          {selectedDay && holidays[selectedDay] ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#a855f7' }} />
              <Text style={{ fontSize: font.sizes.sm, color: '#a855f7', fontWeight: font.weights.medium }}>
                Feriado: {holidays[selectedDay]}
              </Text>
            </View>
          ) : null}

          {selectedEvents.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: font.sizes.md, textAlign: 'center', paddingVertical: spacing['2xl'] }}>
              Nenhum evento neste dia
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {selectedEvents.map((e, i) => (
                <View key={e.id + '-' + i} style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  paddingVertical: spacing.md,
                  borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                }}>
                  <View style={{ width: 4, height: 28, borderRadius: 2, backgroundColor: e.color }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
                      {e.title}
                    </Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                      {e.type === 'custody' ? 'Guarda' : e.type === 'activity' ? 'Atividade' : 'Evento'}
                      {e.time ? ` · ${e.time}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Quick actions for custody days that belong to the other parent */}
          {(() => {
            if (!selectedDay || !activeGroup?.custodyEnabled || !userId) return null;
            const custodyEvent = selectedEvents.find(e => e.type === 'custody');
            if (!custodyEvent || !custodyEvent.responsibleId) return null;
            if (custodyEvent.responsibleId === userId) return null;
            return (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <TouchableOpacity
                  onPress={() => { setSwapIsVisit(false); setSwapModalOpen(true); }}
                  style={{
                    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                    backgroundColor: colors.brand, alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                    🔄 Pedir troca
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setSwapIsVisit(true); setSwapModalOpen(true); }}
                  style={{
                    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                    👋 Pedir visita
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* Swap request modal */}
      {(() => {
        if (!selectedDay || !activeGroup?.custodyEnabled || !userId) return null;
        const custodyEvent = selectedEvents.find(e => e.type === 'custody');
        if (!custodyEvent || !custodyEvent.responsibleId) return null;
        const targetMember = members.find(m => m.userId === custodyEvent.responsibleId);
        return (
          <SwapRequestModal
            visible={swapModalOpen}
            onClose={() => setSwapModalOpen(false)}
            onSubmitted={refresh}
            selectedDate={selectedDay}
            targetUserId={custodyEvent.responsibleId}
            targetUserName={targetMember?.name || 'Co-responsavel'}
            targetColor={custodyEvent.color}
            groupId={activeGroup.groupId}
            currentUserId={userId}
            isVisitRequest={swapIsVisit}
          />
        );
      })()}
    </View>
  );
}
