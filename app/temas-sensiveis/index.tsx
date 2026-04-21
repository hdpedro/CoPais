import { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/auth';
import { getDisplayName } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface SensitiveTopic { id: string; title: string; content: string | null; category: string; authorName: string; created_at: string; }

export default function TemasScreen() {
  const { activeGroup } = useAuth();
  const [topics, setTopics] = useState<SensitiveTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const { data } = await supabase.from('sensitive_notes')
      .select('id, title, content, category, created_at, profiles!sensitive_notes_created_by_fkey(full_name)')
      .eq('group_id', activeGroup.groupId)
      .order('created_at', { ascending: false }).limit(50);
    setTopics((data || []).map((d: any) => ({ ...d, authorName: getDisplayName(d.profiles?.full_name) })));
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Temas Sensiveis" />
      <FlatList data={topics} keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="🔒" title="Nenhum tema" subtitle="Registre temas delicados com privacidade" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm }}>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.title}</Text>
            {item.content ? <Text numberOfLines={2} style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>{item.content}</Text> : null}
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>{item.authorName}</Text>
          </View>
        )}
      />
    </View>
  );
}
