/**
 * Timeline Clinica — Full chronological health history grouped by day.
 * Inspired by Apple Health timeline.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
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
  // Regra Canônica 1: acentos corretos — "Terça", "Sábado", "Sexta".
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
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

  // Pre-computed counts per filter — usado nos chips pra mostrar
  // "Doenças · 3" e indicar quais filtros têm conteúdo. Sem isso, o user
  // tinha que tatear cada chip pra descobrir se o filtro estava vazio.
  const counts = useMemo(() => {
    const all = data?.timeline || [];
    return {
      total: all.length,
      illness: all.filter(e => e.type === 'illness').length,
      medication: all.filter(e => e.type === 'medication').length,
      appointment: all.filter(e => e.type === 'appointment').length,
      observation: all.filter(e => e.type === 'observation').length,
    };
  }, [data?.timeline]);

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
          Histórico Clínico
        </Text>
      </View>

      {/* Chips filter — flex-wrap em 2 linhas quando não cabem na largura.
          Trocou de ScrollView horizontal pra wrap (Angelino reportou que o
          scroll não era óbvio: o user passou batido pelo "Notas" cortado).
          Wrap garante que TODOS os filtros são visíveis sem interação. */}
      <View style={{
        paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
        backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
      }}>
        <FilterChips filter={filter} setFilter={setFilter} counts={counts} />
      </View>

      {/* List */}
      <FlatList
        data={dayGroups}
        keyExtractor={item => item.date}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        ListEmptyComponent={<EmptyState filter={filter} clearFilter={() => setFilter(null)} />}
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

/**
 * Filter chips — flex-wrap layout em 2 linhas.
 *
 * Iteração 1 (bug Angelino 2026-05-16 16:21): View → ScrollView horizontal.
 *   Não resolveu a UX — o user não percebia o scroll, passou batido pelo
 *   chip "Notas" parcialmente cortado.
 *
 * Iteração 2 (Angelino reportou de novo): ScrollView → flexWrap.
 *   Agora TODOS os 5 chips são visíveis em 2 linhas sem nenhuma interação
 *   necessária. Affordance zero: você vê o filtro, você toca.
 *
 * Plus:
 *   - Cada chip mostra contagem entre parênteses ("Doenças · 3"), assim o
 *     user sabe quais filtros vão render algo antes de tocar.
 *   - Chip "Todos" agora também tem ícone (📋) pra consistência visual com
 *     os demais.
 *   - Estados disabled (count=0) ficam com opacidade reduzida — ainda
 *     tocáveis (pode haver dados futuros) mas visualmente distintos.
 *   - Acentos corretos: "Doenças", "Remédios" (Regra Canônica 1).
 */
function FilterChips({
  filter,
  setFilter,
  counts,
}: {
  filter: string | null;
  setFilter: (f: string | null) => void;
  counts: { total: number; illness: number; medication: number; appointment: number; observation: number };
}) {
  const chips: Array<{ key: string | null; label: string; count: number }> = [
    { key: null, label: '📋 Todos', count: counts.total },
    { key: 'illness', label: '🤒 Doenças', count: counts.illness },
    { key: 'medication', label: '💊 Remédios', count: counts.medication },
    { key: 'appointment', label: '🏥 Consultas', count: counts.appointment },
    { key: 'observation', label: '📝 Notas', count: counts.observation },
  ];

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {chips.map(c => {
        const active = filter === c.key;
        const empty = c.count === 0;
        return (
          <TouchableOpacity
            key={c.key || 'all'}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFilter(c.key);
            }}
            activeOpacity={0.7}
            style={{
              paddingVertical: spacing.xs + 2,
              paddingHorizontal: spacing.md,
              borderRadius: radius.full,
              backgroundColor: active ? colors.brand : colors.bgSurface,
              borderWidth: active ? 0 : 1,
              borderColor: colors.borderLight,
              opacity: empty && !active ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontSize: font.sizes.xs,
                fontWeight: font.weights.medium,
                color: active ? '#fff' : colors.textSecondary,
              }}
            >
              {c.label}
              {c.count > 0 ? (
                <Text
                  style={{
                    fontWeight: font.weights.bold,
                    color: active ? '#fff' : colors.textMuted,
                  }}
                >
                  {' · '}{c.count}
                </Text>
              ) : null}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Empty state — agora context-aware:
 *   - Filtro ativo: explica que NESSE filtro não tem nada, oferece "Ver
 *     todos" pra remover o filtro.
 *   - Sem filtro (timeline 100% vazia): oferece CTA pra registrar o
 *     primeiro evento. Antes era só "Nenhum registro encontrado" sem ação.
 */
function EmptyState({ filter, clearFilter }: { filter: string | null; clearFilter: () => void }) {
  if (filter) {
    const labelByKey: Record<string, string> = {
      illness: 'doenças',
      medication: 'remédios',
      appointment: 'consultas',
      observation: 'notas',
    };
    return (
      <View style={{ alignItems: 'center', paddingVertical: spacing['4xl'], paddingHorizontal: spacing.xl }}>
        <Text style={{ fontSize: 40, marginBottom: spacing.md }}>🔍</Text>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, textAlign: 'center', marginBottom: spacing.xs }}>
          Nenhum registro em {labelByKey[filter] || 'este filtro'}
        </Text>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg }}>
          Toque em &quot;Todos&quot; para ver o histórico completo da família.
        </Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            clearFilter();
          }}
          style={{
            paddingVertical: spacing.sm + 2,
            paddingHorizontal: spacing.xl,
            backgroundColor: colors.brand,
            borderRadius: radius.full,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: font.weights.semibold, fontSize: font.sizes.sm }}>
            Ver todos
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing['4xl'], paddingHorizontal: spacing.xl }}>
      <Text style={{ fontSize: 40, marginBottom: spacing.md }}>📋</Text>
      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, textAlign: 'center', marginBottom: spacing.xs }}>
        Histórico vazio
      </Text>
      <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg }}>
        Quando você registrar uma consulta, remédio ou sintoma, ele aparece aqui em ordem cronológica.
      </Text>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/saude/registrar');
        }}
        style={{
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.xl,
          backgroundColor: colors.brand,
          borderRadius: radius.full,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
        }}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: font.weights.semibold, fontSize: font.sizes.sm }}>
          Registrar primeiro evento
        </Text>
      </TouchableOpacity>
    </View>
  );
}
