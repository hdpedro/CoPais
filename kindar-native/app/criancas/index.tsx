import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { fetchChildren, type Child } from '../../src/services/children';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import FAB from '../../src/components/ui/FAB';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

function calcAge(birthDate: string): number {
  const bd = new Date(birthDate + 'T12:00:00');
  return Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export default function CriancasScreen() {
  const { activeGroup } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    setChildren(await fetchChildren(activeGroup.groupId));
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: Child }) => {
    const age = calcAge(item.birth_date);
    const initial = item.full_name[0]?.toUpperCase() || '?';
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push({ pathname: '/criancas/[id]', params: { id: item.id } } as never)}
        style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}
      >
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.brand }}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>{item.full_name}</Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>{age} anos · {item.birth_date.split('-').reverse().join('/')}</Text>
          {item.blood_type ? <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Tipo sanguineo: {item.blood_type}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Criancas" />
      <FlatList data={children} keyExtractor={item => item.id} renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="👶" title="Nenhuma crianca" subtitle="Adicione as criancas do grupo" />}
      />
      <FAB onPress={() => router.push('/criancas/nova')} />
    </View>
  );
}
