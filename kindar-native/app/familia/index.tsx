import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/auth';
import { getDisplayName } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface Member { userId: string; fullName: string; role: string; email: string | null; }

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', member: 'Membro', readonly: 'Somente leitura' };

export default function FamiliaScreen() {
  const { activeGroup } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const { data } = await supabase.from('group_members')
      .select('user_id, role, profiles(full_name, email)')
      .eq('group_id', activeGroup.groupId);
    setMembers((data || []).map((m: any) => ({
      userId: m.user_id, fullName: m.profiles?.full_name || '', role: m.role, email: m.profiles?.email || null,
    })));
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Familia" />
      <FlatList data={members} keyExtractor={item => item.userId}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.brand }}>
                {item.fullName[0]?.toUpperCase() || '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.fullName}</Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{ROLE_LABELS[item.role] || item.role}{item.email ? ` · ${item.email}` : ''}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
