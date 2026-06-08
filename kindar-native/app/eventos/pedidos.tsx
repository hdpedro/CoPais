/**
 * Pedidos de alteracao de evento — inbox de event_requests que me afetam.
 * Mirrors PWA EventRequestList.
 */
import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import {
  fetchMyPendingEventRequests, respondToEventRequest, cancelEventRequest,
  type EventRequest,
} from 'src/services/event-requests';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import EmptyState from 'src/components/ui/EmptyState';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

type TFn = (key: string, params?: Record<string, string | number>) => string;

const ACTION_META: Record<string, { labelKey: string; verbKey: string; icon: string; color: string }> = {
  edit: { labelKey: 'common.edit', verbKey: 'eventRequests.edit', icon: '✏️', color: '#3B82F6' },
  reschedule: { labelKey: 'eventRequests.actionReschedule', verbKey: 'eventRequests.reschedule', icon: '📅', color: '#E8A228' },
  cancel: { labelKey: 'common.cancel', verbKey: 'eventRequests.cancel', icon: '🚫', color: '#E53935' },
  delete: { labelKey: 'common.delete', verbKey: 'eventRequests.delete', icon: '🗑️', color: '#E53935' },
};

function formatRelative(iso: string, t: TFn): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return t('eventRequests.relativeNow');
  if (hrs < 24) return t('relTime.hShort', { count: hrs });
  return t('eventRequests.relativeDays', { count: Math.floor(hrs / 24) });
}

const CHANGE_FIELD_KEYS: Record<string, string> = {
  event_date: 'eventRequests.fieldEventDate',
  end_date: 'eventRequests.fieldEndDate',
  event_time: 'eventRequests.fieldEventTime',
  location: 'eventRequests.fieldLocation',
  title: 'eventRequests.fieldTitle',
  description: 'eventRequests.fieldDescription',
  notes: 'eventRequests.fieldNotes',
};

function describeChange(key: string, value: unknown, t: TFn): string {
  const labelKey = CHANGE_FIELD_KEYS[key];
  const label = labelKey ? t(labelKey) : key;
  const raw = String(value ?? '');
  const text = key === 'description' || key === 'notes' ? raw.slice(0, 80) : raw;
  return `${label}: ${text}`;
}

export default function PedidosEventosScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);

  const { data: requests, loading, refresh: load } = useCachedFetch<EventRequest[]>({
    cacheKey: activeGroup && userId ? `eventos_pedidos_${activeGroup.groupId}_${userId}` : null,
    tag: 'eventos:pedidos:load',
    empty: [],
    fetcher: () => fetchMyPendingEventRequests(activeGroup!.groupId, userId!),
  });

  async function onRefresh() {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }

  async function handleDecision(req: EventRequest, decision: 'approved' | 'rejected') {
    if (!userId || !activeGroup) return;
    setResponding(req.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await respondToEventRequest(req.id, decision, userId, activeGroup.groupId);
    setResponding(null);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  async function handleCancel(req: EventRequest) {
    if (!activeGroup) return;
    Alert.alert(
      t('eventRequests.cancelRequest'),
      t('eventRequests.cancelDiscardMessage'),
      [
        { text: t('eventRequests.back'), style: 'cancel' },
        {
          text: t('eventRequests.cancelRequest'),
          onPress: async () => {
            setResponding(req.id);
            await cancelEventRequest(req.id, activeGroup.groupId);
            setResponding(null);
            await load();
          },
        },
      ]
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          {t('eventRequests.screenTitle')}
        </Text>
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {requests.length === 0 ? (
            <EmptyState icon="📭" title={t('empty.eventosPedidos.title')} description={t('empty.eventosPedidos.description')} />
          ) : (
            requests.map(r => {
              const action = ACTION_META[r.action_type] || ACTION_META.edit;
              const actionLabel = t(action.labelKey);
              const iAmRequester = r.requester_id === userId;
              return (
                <View
                  key={r.id}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.xl,
                    padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                    borderLeftWidth: 3, borderLeftColor: action.color,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${action.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18 }}>{action.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: font.sizes.xs, color: action.color, fontWeight: font.weights.semibold, textTransform: 'uppercase' }}>
                          {actionLabel}
                        </Text>
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                          · {formatRelative(r.created_at, t)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, marginBottom: 4 }}>
                        {r.eventTitle}
                      </Text>
                      <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                        {t('eventRequests.proposedThisEvent', { name: r.requesterName ?? '', action: t(action.verbKey) })}
                      </Text>
                      {r.reason ? (
                        <View style={{ marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.md }}>
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium, marginBottom: 2 }}>{t('eventRequests.reasonLabel')}</Text>
                          <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{r.reason}</Text>
                        </View>
                      ) : null}
                      {r.proposed_changes && Object.keys(r.proposed_changes).length > 0 ? (
                        <View style={{ marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.md }}>
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium, marginBottom: 2 }}>{t('eventRequests.proposedChangesLabel')}</Text>
                          {Object.entries(r.proposed_changes).map(([k, v]) => (
                            <Text key={k} style={{ fontSize: font.sizes.sm, color: colors.text }}>
                              {describeChange(k, v, t)}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {iAmRequester ? (
                    <TouchableOpacity
                      disabled={responding === r.id}
                      onPress={() => handleCancel(r)}
                      style={{ alignSelf: 'flex-end', marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight }}
                    >
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{t('eventRequests.cancelRequest')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                      <TouchableOpacity
                        disabled={responding === r.id}
                        onPress={() => handleDecision(r, 'rejected')}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', opacity: responding === r.id ? 0.5 : 1 }}
                      >
                        {responding === r.id ? <ActivityIndicator size="small" color={colors.textSecondary} /> : (
                          <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>{t('calendarTab.reject')}</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={responding === r.id}
                        onPress={() => handleDecision(r, 'approved')}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', opacity: responding === r.id ? 0.5 : 1 }}
                      >
                        {responding === r.id ? <ActivityIndicator size="small" color="#fff" /> : (
                          <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>{t('calendarTab.approve')}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
