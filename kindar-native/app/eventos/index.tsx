import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { fetchEvents, type SocialEvent } from '../../src/services/events';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import FAB from '../../src/components/ui/FAB';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export default function EventosScreen() {
  const { activeGroup } = useAuth();
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const data = await fetchEvents(activeGroup.groupId);
    setEvents(data);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: SocialEvent }) => (
    <TouchableOpacity activeOpacity={0.7}
      style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${colors.secondary}15`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="flag-outline" size={18} color={colors.secondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.title}</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
          {formatDate(item.event_date)}{item.location ? ` · ${item.location}` : ''}{item.assignedName ? ` · ${item.assignedName}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Eventos" rightAction={{ icon: 'mail-outline', onPress: () => router.push('/eventos/pedidos') }} />
      <FlatList data={events} keyExtractor={item => item.id} renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="🎯" title="Nenhum evento" subtitle="Crie eventos do grupo" />}
      />
      <FAB onPress={() => router.push('/calendario/novo')} />
    </View>
  );
}
