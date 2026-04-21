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
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { events, members, loading, refresh } = useCalendar();
  const { userId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
        </View>
      </Modal>

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
