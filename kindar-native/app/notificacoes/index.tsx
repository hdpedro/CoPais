import { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/auth';
import { fetchNotifications, markAsRead, markAllAsRead, type AppNotification } from '../../src/services/notifications';
import { clearBadge } from '../../src/services/push-setup';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

// Fallback routes por type quando notification.link é null. Ordem de precedencia:
// 1. notification.link (preferido — definido pela action que criou a notification)
// 2. TYPE_ROUTES[n.type] (fallback generico)
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
  event_request: '/eventos/pedidos',
  decision_new: '/decisoes',
  agreement_new: '/acordos',
};

const TYPE_ICONS: Record<string, string> = {
  expense_new: '💰', expense_approved: '✅', expense_rejected: '❌',
  swap_request: '🔄', swap_response: '🔄', chat_message: '💬',
  document_uploaded: '📄', custody_change: '📅', invitation: '✉️',
  system: '⚙️', activity: '📋', activity_reminder: '⏰',
  event_request: '📅', decision_new: '🗳️', agreement_new: '🤝',
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

export default function NotificacoesScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setNotifications(await fetchNotifications(userId));
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => { clearBadge().catch(() => {}); }, []);

  async function handleMarkAllRead() {
    if (!userId || markingAll) return;
    setMarkingAll(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markAllAsRead(userId);
    await load();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMarkingAll(false);
  }

  async function handleTap(n: AppNotification) {
    if (!n.is_read) {
      await markAsRead(n.id);
      // Optimistic: mark local state read immediately
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Prefer the explicit link attached to the notification, fallback to type route
    const target = n.link || TYPE_ROUTES[n.type];
    if (target) {
      router.push(target as Parameters<typeof router.push>[0]);
    }
  }

  const hasUnread = notifications.some(n => !n.is_read);

  const renderItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      onPress={() => handleTap(item)}
      activeOpacity={0.75}
      style={{
        backgroundColor: item.is_read ? colors.bgElevated : 'rgba(59,130,246,0.06)',
        borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm,
        ...(item.is_read ? shadows.sm : { borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)' }),
        flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
      }}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: item.is_read ? colors.bgSurface : 'rgba(59,130,246,0.12)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 18 }}>{TYPE_ICONS[item.type] || '🔔'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: font.sizes.md,
              fontWeight: item.is_read ? font.weights.medium : font.weights.bold,
              color: colors.text,
            }}
          >
            {item.title}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, flexShrink: 0 }}>
            {timeAgo(item.created_at)}
          </Text>
        </View>
        {item.message ? (
          <Text
            numberOfLines={2}
            style={{
              fontSize: 13,
              color: item.is_read ? colors.textSecondary : colors.text,
              marginTop: 2,
              lineHeight: 18,
            }}
          >
            {item.message}
          </Text>
        ) : null}
      </View>
      {!item.is_read ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6', marginTop: 14 }} />
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Custom header with back + title + "Marcar todas como lidas" text action */}
      <View style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text }}>
            Notificações
          </Text>
        </View>
        {hasUnread ? (
          <TouchableOpacity onPress={handleMarkAllRead} disabled={markingAll} hitSlop={8}>
            <Text style={{
              fontSize: 13, color: colors.brand,
              fontWeight: font.weights.semibold,
              opacity: markingAll ? 0.5 : 1,
            }}>
              Marcar todas como lidas
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="🔔" title="Nenhuma notificação" subtitle="Você está em dia" />}
      />
    </View>
  );
}
