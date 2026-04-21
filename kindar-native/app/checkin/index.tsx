import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/auth';
import { getDisplayName, CHECKIN_CATEGORIES } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface CheckinItem { id: string; category: string; title: string; description: string | null; checkin_date: string; childName: string; loggedByName: string; }

export default function CheckinScreen() {
  const { activeGroup } = useAuth();
  const [items, setItems] = useState<CheckinItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const { data } = await supabase.from('daily_checkins')
      .select('id, category, title, description, checkin_date, children(full_name), profiles!daily_checkins_logged_by_fkey(full_name)')
      .eq('group_id', activeGroup.groupId)
      .order('checkin_date', { ascending: false }).limit(50);
    setItems((data || []).map((d: any) => ({
      ...d, childName: getDisplayName(d.children?.full_name), loggedByName: getDisplayName(d.profiles?.full_name),
    })));
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Check-in" />
      <FlatList data={items} keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="✅" title="Nenhum check-in" subtitle="Registre o dia a dia das criancas" />}
        renderItem={({ item }) => {
          const cat = CHECKIN_CATEGORIES?.find((c: any) => c.value === item.category);
          return (
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Text style={{ fontSize: 22 }}>{(cat as any)?.icon || '✅'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.title}</Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{item.childName} · {item.loggedByName} · {item.checkin_date?.split('-').reverse().join('/')}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
