import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCalendar, type CalendarEvent } from '../../src/hooks/useCalendar';
import { DAY_NAMES } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SemanaScreen() {
  const { events, refresh } = useCalendar();
  const [refreshing, setRefreshing] = useState(false);

  // Build 7-day view
  const weekDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const key = formatDateKey(d);
      const dayEvents = events.filter(e => e.date === key);
      return { date: d, key, dayName: DAY_NAMES[d.getDay()], dayNum: d.getDate(), isToday: i === 0, events: dayEvents };
    });
  }, [events]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Proximos 7 Dias" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} tintColor={colors.brand} />}>
        {weekDays.map(day => (
          <View key={day.key} style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: day.isToday ? colors.brand : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: day.isToday ? '#fff' : colors.text }}>
                  {day.dayNum}
                </Text>
              </View>
              <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: day.isToday ? colors.brand : colors.textSecondary }}>
                {day.isToday ? 'Hoje' : day.dayName}
              </Text>
            </View>
            {day.events.length === 0 ? (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textDim, paddingLeft: spacing['4xl'] }}>Sem eventos</Text>
            ) : (
              day.events.map((e, i) => (
                <View key={e.id + '-' + i} style={{
                  marginLeft: spacing['4xl'], backgroundColor: colors.bgElevated, borderRadius: radius.md,
                  padding: spacing.md, marginBottom: spacing.xs, borderLeftWidth: 3, borderLeftColor: e.color, ...shadows.sm,
                }}>
                  <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }}>{e.title}</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                    {e.type === 'custody' ? 'Guarda' : e.type === 'activity' ? 'Atividade' : 'Evento'}{e.time ? ` · ${e.time}` : ''}
                  </Text>
                </View>
              ))
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
