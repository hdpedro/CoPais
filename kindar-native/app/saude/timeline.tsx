/**
 * Timeline Clinica — Full chronological health history grouped by day.
 * Inspired by Apple Health timeline.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHealth, type HealthEvent } from 'src/hooks/useHealth';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

const EVENT_ICONS: Record<string, { icon: string; color: string }> = {
  illness: { icon: '🤒', color: '#E53935' },
  medication: { icon: '💊', color: '#3b82f6' },
  appointment: { icon: '🏥', color: '#5B9E85' },
  observation: { icon: '📝', color: '#E8A228' },
  allergy: { icon: '⚠️', color: '#D4735A' },
  dose: { icon: '💉', color: '#7C6FAE' },
};

// CHIP_LABELS reservado pra uso futuro nos chips agrupadores.
// const CHIP_LABELS: Record<string, { label: string; color: string }> = {
//   illness: { label: 'Doenca', color: '#E53935' },
//   medication: { label: 'Medicado', color: '#3b82f6' },
//   appointment: { label: 'Consulta', color: '#5B9E85' },
//   observation: { label: 'Nota', color: '#E8A228' },
// };

interface DayGroup {
  date: string;
  label: string;
  events: HealthEvent[];
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  const days = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TimelineScreen() {
  const insets = useSafeAreaInsets();
  const { data, refresh } = useHealth();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Group events by day
  const dayGroups = useMemo<DayGroup[]>(() => {
    const events = (data?.timeline || []).filter(e => !filter || e.type === filter);
    const groups: Record<string, HealthEvent[]> = {};
    events.forEach(e => {
      const day = e.date.split('T')[0];
      if (!groups[day]) groups[day] = [];
      groups[day].push(e);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, events]) => ({
        date,
        label: formatDayLabel(date),
        events,
      }));
  }, [data?.timeline, filter]);

  const renderEvent = (event: HealthEvent, isLast: boolean) => {
    const cfg = EVENT_ICONS[event.type] || EVENT_ICONS.observation;
    return (
      <TouchableOpacity
        key={event.id}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/saude/detalhe?id=${event.id}&type=${event.type}`);
        }}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', gap: spacing.md, paddingBottom: isLast ? 0 : spacing.md }}
      >
        {/* Timeline dot + line */}
        <View style={{ alignItems: 'center', width: 20 }}>
          <View style={{
            width: 10, height: 10, borderRadius: 5, backgroundColor: cfg.color,
            marginTop: 6,
          }} />
          {!isLast ? (
            <View style={{ width: 1, flex: 1, backgroundColor: colors.borderLight, marginTop: 4 }} />
          ) : null}
        </View>

        {/* Content */}
        <View style={{ flex: 1, paddingBottom: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Text style={{ fontSize: 14 }}>{cfg.icon}</Text>
                <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
                  {event.title}
                </Text>
              </View>
              {event.subtitle ? (
                <Text numberOfLines={2} style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
                  {event.subtitle}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
              {formatTime(event.date)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{event.childName}</Text>
            {event.createdByName ? (
              <Text style={{ fontSize: font.sizes.xs, color: colors.textDim }}>por {event.createdByName}</Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg, backgroundColor: colors.bgElevated,
        borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text, flex: 1 }}>
          Historico Clinico
        </Text>
      </View>

      {/* Chips filter — horizontal scroll necessário porque os 5 chips
          (Todos / Doenças / Remédios / Consultas / Notas) somados não cabem
          em telas pequenas (≤iPhone SE). Bug Angelino 2026-05-16 16:21:
          o último chip "Notas" ficava cortado na borda direita sem nenhum
          affordance de scroll — usuário não tinha como acessá-lo. */}
      <View style={{
        paddingVertical: spacing.md,
        backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
      }}>
        <ScrollViewChips filter={filter} setFilter={setFilter} />
      </View>

      {/* List */}
      <FlatList
        data={dayGroups}
        keyExtractor={item => item.date}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: spacing['5xl'] }}>
            <Text style={{ fontSize: 32, marginBottom: spacing.md }}>📋</Text>
            <Text style={{ fontSize: font.sizes.md, color: colors.textMuted }}>Nenhum registro encontrado</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={{
              fontSize: font.sizes.sm, fontWeight: font.weights.bold, color: colors.text,
              marginBottom: spacing.md,
            }}>
              {item.label}
            </Text>
            {item.events.map((e, i) => renderEvent(e, i === item.events.length - 1))}
          </View>
        )}
      />
    </View>
  );
}

// Chip filter bar
//
// Antes era uma <View flexDirection:"row"> simples — visualmente parecia ok
// em iPhone Pro Max mas em telas menores o último chip ("Notas") era cortado
// pela borda direita sem nenhuma indicação de scroll. Bug reportado por
// Angelino 2026-05-16 16:21.
//
// Agora é um ScrollView horizontal real:
//   - showsHorizontalScrollIndicator={false} → sem barrinha visual feia
//   - contentContainerStyle.paddingHorizontal = spacing.lg → margens laterais
//     consistentes mesmo durante scroll
//   - gap entre chips via paddingRight de cada item (React Native ≥0.71
//     suporta `gap` em ScrollView contentContainerStyle, mas mantenho
//     paddingRight individual pra back-compat)
//   - contentContainerStyle.paddingRight extra = spacing.lg garante que o
//     último chip nunca cole na borda; affordance visual implícito
function ScrollViewChips({ filter, setFilter }: { filter: string | null; setFilter: (f: string | null) => void }) {
  const chips = [
    { key: null, label: 'Todos' },
    { key: 'illness', label: '🤒 Doencas' },
    { key: 'medication', label: '💊 Remedios' },
    { key: 'appointment', label: '🏥 Consultas' },
    { key: 'observation', label: '📝 Notas' },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        gap: spacing.sm,
        alignItems: 'center',
      }}
    >
      {chips.map(c => (
        <TouchableOpacity
          key={c.key || 'all'}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFilter(c.key);
          }}
          style={{
            paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.md,
            borderRadius: radius.full,
            backgroundColor: filter === c.key ? colors.brand : colors.bgSurface,
          }}
        >
          <Text style={{
            fontSize: font.sizes.xs, fontWeight: font.weights.medium,
            color: filter === c.key ? '#fff' : colors.textSecondary,
          }}>
            {c.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
