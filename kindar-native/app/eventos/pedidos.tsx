/**
 * Pedidos de alteracao de evento — inbox de event_requests que me afetam.
 * Mirrors PWA EventRequestList.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import {
  fetchMyPendingEventRequests, respondToEventRequest, cancelEventRequest,
  type EventRequest,
} from 'src/services/event-requests';
import EmptyState from 'src/components/ui/EmptyState';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const ACTION_META: Record<string, { label: string; icon: string; color: string }> = {
  edit: { label: 'Editar', icon: '✏️', color: '#3B82F6' },
  reschedule: { label: 'Reagendar', icon: '📅', color: '#E8A228' },
  cancel: { label: 'Cancelar', icon: '🚫', color: '#E53935' },
  delete: { label: 'Excluir', icon: '🗑️', color: '#E53935' },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'agora';
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function describeChange(key: string, value: unknown): string {
  if (key === 'event_date' || key === 'end_date') return `${key.replace('_', ' ')}: ${String(value)}`;
  if (key === 'event_time') return `horario: ${String(value)}`;
  if (key === 'location') return `local: ${String(value)}`;
  if (key === 'title') return `titulo: ${String(value)}`;
  if (key === 'description' || key === 'notes') return `${key}: ${String(value).slice(0, 80)}`;
  return `${key}: ${String(value)}`;
}

export default function PedidosEventosScreen() {
  const t = useI18n(s => s.t);
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const [requests, setRequests] = useState<EventRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeGroup || !userId) return;
    const data = await fetchMyPendingEventRequests(activeGroup.groupId, userId);
    setRequests(data);
    setLoading(false);
  }, [activeGroup, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
      Alert.alert('Erro', res.error || 'Falha');
    }
  }

  async function handleCancel(req: EventRequest) {
    if (!activeGroup) return;
    Alert.alert(
      'Cancelar pedido',
      'O pedido sera descartado e o evento nao sera alterado.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar pedido',
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
          Pedidos de alteracao
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
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
                          {action.label}
                        </Text>
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                          · {formatRelative(r.created_at)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, marginBottom: 4 }}>
                        {r.eventTitle}
                      </Text>
                      <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                        {r.requesterName} propos {action.label.toLowerCase()} este evento.
                      </Text>
                      {r.reason ? (
                        <View style={{ marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.md }}>
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium, marginBottom: 2 }}>Motivo</Text>
                          <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{r.reason}</Text>
                        </View>
                      ) : null}
                      {r.proposed_changes && Object.keys(r.proposed_changes).length > 0 ? (
                        <View style={{ marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.md }}>
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium, marginBottom: 2 }}>Mudancas propostas</Text>
                          {Object.entries(r.proposed_changes).map(([k, v]) => (
                            <Text key={k} style={{ fontSize: font.sizes.sm, color: colors.text }}>
                              {describeChange(k, v)}
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
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>Cancelar pedido</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                      <TouchableOpacity
                        disabled={responding === r.id}
                        onPress={() => handleDecision(r, 'rejected')}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', opacity: responding === r.id ? 0.5 : 1 }}
                      >
                        {responding === r.id ? <ActivityIndicator size="small" color={colors.textSecondary} /> : (
                          <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>Rejeitar</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={responding === r.id}
                        onPress={() => handleDecision(r, 'approved')}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', opacity: responding === r.id ? 0.5 : 1 }}
                      >
                        {responding === r.id ? <ActivityIndicator size="small" color="#fff" /> : (
                          <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>Aprovar</Text>
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
