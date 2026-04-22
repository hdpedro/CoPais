import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/store/auth';
import { fetchActivities, type Activity } from '../../src/services/activities';
import { ACTIVITY_CATEGORIES } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import FAB from '../../src/components/ui/FAB';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

export default function AtividadesScreen() {
  const { activeGroup } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const data = await fetchActivities(activeGroup.groupId);
    setActivities(data);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: Activity }) => {
    const cat = ACTIVITY_CATEGORIES.find(c => c.value === item.category);
    return (
      <TouchableOpacity activeOpacity={0.7}
        style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Text style={{ fontSize: 22 }}>{cat?.icon || '📌'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
            {[item.childName, item.time_start?.slice(0, 5), item.location].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {item.recurrence_type !== 'never' ? (
          <View style={{ backgroundColor: `${colors.brand}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
            <Text style={{ fontSize: font.sizes.xs, color: colors.brand }}>{item.recurrence_type}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Atividades" />
      <FlatList data={activities} keyExtractor={item => item.id} renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="📋" title="Nenhuma atividade" subtitle="Crie atividades recorrentes para as criancas" />}
      />
      <FAB onPress={() => router.push('/atividades/nova')} />
    </View>
  );
}
