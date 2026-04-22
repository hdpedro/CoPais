import { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/store/auth';
import { fetchNotifications, markAsRead, markAllAsRead, type AppNotification } from '../../src/services/notifications';
import { clearBadge } from '../../src/services/push-setup';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

const TYPE_ROUTES: Record<string, string> = {
  expense_new: '/despesas',
  expense_approved: '/financeiro',
  expense_rejected: '/financeiro',
  swap_request: '/(tabs)/calendario',
  swap_response: '/(tabs)/calendario',
  chat_message: '/(tabs)/chat',
  document_uploaded: '/documentos',
  custody_change: '/(tabs)/calendario',
  invitation: '/familia',
  activity_reminder: '/atividades',
  activity: '/atividades',
};

const TYPE_ICONS: Record<string, string> = {
  expense_new: '🧾', expense_approved: '✅', expense_rejected: '❌',
  swap_request: '🔄', swap_response: '🔄', chat_message: '💬',
  document_uploaded: '📄', custody_change: '📅', invitation: '✉️',
  system: '🔔', activity: '📋', activity_reminder: '⏰',
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function NotificacoesScreen() {
  const { userId } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setNotifications(await fetchNotifications(userId));
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Clear push badge when user opens inbox
  useEffect(() => { clearBadge().catch(() => {}); }, []);

  async function handleMarkAllRead() {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markAllAsRead(userId);
    load();
  }

  async function handleTap(n: AppNotification) {
    if (!n.is_read) {
      await markAsRead(n.id);
    }
    const route = TYPE_ROUTES[n.type];
    if (route) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(route as Parameters<typeof router.push>[0]);
    } else {
      load();
    }
  }

  const renderItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      onPress={() => handleTap(item)}
      activeOpacity={0.7}
      style={{
        backgroundColor: item.is_read ? colors.bgElevated : `${colors.brand}08`,
        borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm,
        ...(item.is_read ? shadows.sm : {}),
        flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
      }}
    >
      <Text style={{ fontSize: 18 }}>{TYPE_ICONS[item.type] || '🔔'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: item.is_read ? font.weights.normal : font.weights.semibold, color: colors.text }}>
          {item.title}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
          {item.message}
        </Text>
      </View>
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{timeAgo(item.created_at)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Notificacoes" rightAction={{ icon: 'checkmark-done', onPress: handleMarkAllRead }} />
      <FlatList data={notifications} keyExtractor={item => item.id} renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="🔔" title="Nenhuma notificacao" />}
      />
    </View>
  );
}
