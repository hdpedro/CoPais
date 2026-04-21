import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { fetchDocuments, type Document } from '../../src/services/documents';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

const CAT_ICONS: Record<string, string> = { personal: '👤', health: '❤️', education: '🎓', legal: '⚖️', other: '📄' };

export default function DocumentosScreen() {
  const { activeGroup } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    setDocs(await fetchDocuments(activeGroup.groupId));
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: Document }) => (
    <TouchableOpacity onPress={() => item.file_url && Linking.openURL(item.file_url)} activeOpacity={0.7}
      style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Text style={{ fontSize: 22 }}>{CAT_ICONS[item.category] || '📄'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
          {item.uploaderName}{item.childName ? ` · ${item.childName}` : ''}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.textDim} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Documentos" />
      <FlatList data={docs} keyExtractor={item => item.id} renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="📄" title="Nenhum documento" subtitle="Compartilhe documentos importantes" />}
      />
    </View>
  );
}
