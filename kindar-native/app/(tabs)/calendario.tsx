import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Modal, Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useCalendar, type CalendarEvent } from '../../src/hooks/useCalendar';
import { useAuth } from '../../src/store/auth';
import { DAY_NAMES, MONTH_NAMES } from '../../src/lib/constants';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';
import { respondToSwap } from '../../src/services/swaps';
import WeekendPlanner from '../../src/components/calendar/WeekendPlanner';
import SwapRequestModal from '../../src/components/calendar/SwapRequestModal';
import SwapBalanceCard from '../../src/components/calendar/SwapBalanceCard';

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatSwapDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${MONTHS_SHORT[(m || 1) - 1]}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { events, members, pendingSwaps, balanceOps, refresh } = useCalendar();
  const { activeGroup, userId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapIsVisit, setSwapIsVisit] = useState(false);

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

  // Navigate months
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

  // Build event map for current month
  const eventMap = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  // Grid data
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Selected day events
  const selectedEvents = selectedDay ? (eventMap[selectedDay] || []) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Month Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
          <TouchableOpacity onPress={goPrev} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <TouchableOpacity onPress={goNext} hitSlop={12}>
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Pending Swap Banner — actionable */}
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
                        alignItems: 'center',
                        opacity: responding === s.id ? 0.5 : 1,
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
                        alignItems: 'center',
                        opacity: responding === s.id ? 0.5 : 1,
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

        {/* Weekend planner strip */}
        {activeGroup?.custodyEnabled && userId ? (
          <WeekendPlanner events={events} currentUserId={userId} />
        ) : null}

        {/* Balance card (only renders if there's activity) */}
        {activeGroup?.custodyEnabled && userId ? (
          <SwapBalanceCard
            operations={balanceOps}
            members={members}
            currentUserId={userId}
            groupId={activeGroup.groupId}
            onChanged={refresh}
          />
        ) : null}

        {/* Member Legend */}
        {members.length > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginBottom: spacing.lg }}>
            {members.map(m => (
              <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.color }} />
                <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{m.name}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Day Headers */}
        <View style={{ flexDirection: 'row', paddingHorizontal: spacing.sm }}>
          {DAY_NAMES.map(d => (
            <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.xs }}>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted }}>
                {d}
              </Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.sm }}>
          {/* Empty cells for offset */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <View key={`empty-${i}`} style={{ width: '14.28%', height: 56 }} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateKey === todayKey;
            const dayEvents = eventMap[dateKey] || [];
            const custodyEvent = dayEvents.find(e => e.type === 'custody');
            const hasActivity = dayEvents.some(e => e.type === 'activity');
            const hasEvent = dayEvents.some(e => e.type === 'event');

            return (
              <TouchableOpacity
                key={day}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedDay(dateKey);
                }}
                activeOpacity={0.6}
                style={{
                  width: '14.28%', height: 56, alignItems: 'center', justifyContent: 'center',
                }}
              >
                {/* Custody background */}
                {custodyEvent ? (
                  <View style={{
                    position: 'absolute', top: 4, bottom: 4, left: 2, right: 2,
                    borderRadius: radius.sm, backgroundColor: `${custodyEvent.color}20`,
                  }} />
                ) : null}

                {/* Today ring */}
                <View style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: isToday ? colors.brand : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{
                    fontSize: font.sizes.sm,
                    fontWeight: isToday ? font.weights.bold : font.weights.normal,
                    color: isToday ? '#fff' : colors.text,
                  }}>
                    {day}
                  </Text>
                </View>

                {/* Dots */}
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
                  {hasActivity ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} /> : null}
                  {hasEvent ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.secondary }} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Day Detail Modal */}
      <Modal visible={!!selectedDay} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setSelectedDay(null)} />
        <View style={{
          backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
          padding: spacing.xl, paddingBottom: 40, minHeight: 200,
        }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />

          <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.lg }}>
            {selectedDay ? (() => {
              const [y, m, d] = selectedDay.split('-').map(Number);
              const date = new Date(y, m - 1, d);
              const dayName = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'][date.getDay()];
              return `${dayName}, ${d} de ${MONTH_NAMES[m - 1]}`;
            })() : ''}
          </Text>

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

          {/* Quick actions — propose swap / visit on custody days that belong to the other parent */}
          {(() => {
            if (!selectedDay || !activeGroup?.custodyEnabled || !userId) return null;
            const custodyEvent = selectedEvents.find(e => e.type === 'custody');
            if (!custodyEvent || !custodyEvent.responsibleId) return null;
            if (custodyEvent.responsibleId === userId) return null; // my own day
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

      {/* FAB — Create Event */}
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/calendario/novo'); }}
        activeOpacity={0.8}
        style={{
          position: 'absolute', bottom: 100, right: 20,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: colors.brand,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
        }}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
