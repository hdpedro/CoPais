import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/store/auth';
import { fetchDecisions, type Decision } from '../../src/services/decisions';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import FAB from '../../src/components/ui/FAB';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: 'Aberta', color: '#E8A228' },
  closed: { label: 'Fechada', color: '#4CAF50' },
  archived: { label: 'Arquivada', color: '#8A8A8A' },
};

export default function DecisoesScreen() {
  const { activeGroup } = useAuth();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    setDecisions(await fetchDecisions(activeGroup.groupId));
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Decisoes" />
      <FlatList data={decisions} keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="🗳️" title="Nenhuma decisao" subtitle="Crie decisoes para votar em grupo" />}
        renderItem={({ item }) => {
          const st = STATUS_MAP[item.status] || STATUS_MAP.open;
          return (
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text, flex: 1 }}>{item.title}</Text>
                <View style={{ backgroundColor: `${st.color}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                  <Text style={{ fontSize: font.sizes.xs, color: st.color, fontWeight: font.weights.medium }}>{st.label}</Text>
                </View>
              </View>
              {item.description ? <Text numberOfLines={2} style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>{item.description}</Text> : null}
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>{item.authorName}</Text>
            </View>
          );
        }}
      />
      <FAB onPress={() => {}} />
    </View>
  );
}
