/**
 * BalanceHistorySheet — read-only log of custody_balance_operations,
 * with inline approve/reject for pending ops aimed at the current user.
 *
 * Mirrors PWA /calendario/BalanceHistorySheet.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  OPERATION_META, respondToBalanceOperation,
  type BalanceOperation,
} from '../../services/balance-operations';
import { useToast } from '../ui/ToastProvider';
import ModalBackdrop from '../ui/ModalBackdrop';
import { useI18n } from '../../i18n';
import { useIntl } from '../../lib/intl';
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  operations: BalanceOperation[];
  currentUserId: string;
  groupId: string;
  onChanged?: () => void;
}

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pendente', bg: 'rgba(232,162,40,0.15)', text: '#b45309' },
  approved: { label: 'Aprovada', bg: 'rgba(34,197,94,0.12)', text: '#15803d' },
  rejected: { label: 'Recusada', bg: 'rgba(239,68,68,0.1)', text: '#b91c1c' },
  cancelled: { label: 'Cancelada', bg: 'rgba(107,114,128,0.1)', text: colors.textMuted },
};

export default function BalanceHistorySheet({ visible, onClose, operations, currentUserId, groupId, onChanged }: Props) {
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const toast = useToast();
  // Data + hora locale-aware (dia, mês curto, hora:minuto). Reativo no idioma.
  const formatDateTime = useCallback(
    (iso: string): string =>
      intl.formatDate(iso, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    [intl],
  );
  const [responding, setResponding] = useState<string | null>(null);
  const sorted = [...operations].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  async function handleRespond(op: BalanceOperation, decision: 'approved' | 'rejected') {
    setResponding(op.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await respondToBalanceOperation(op.id, decision, groupId);
    setResponding(null);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onChanged?.();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ModalBackdrop onClose={onClose} align="bottom" dim={0.4} padding={0}>
        <View style={{
          backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
          padding: spacing.xl, paddingBottom: 40, maxHeight: '88%',
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              Histórico de operações
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {sorted.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
              <Text style={{ fontSize: 40, marginBottom: spacing.md }}>📋</Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>
                Nenhuma operacao registrada ainda.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 520 }}>
              {sorted.map(op => {
                const type = OPERATION_META[op.operation_type] || { icon: '⚖️', label: op.operation_type, needsDays: false };
                const status = STATUS_META[op.status] || STATUS_META.pending;
                const canRespond = op.status === 'pending' && op.target_user_id === currentUserId;
                return (
                  <View
                    key={op.id}
                    style={{
                      borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.md,
                      padding: spacing.md, marginBottom: spacing.sm,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                      <Text style={{ fontSize: 20 }}>{type.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                            {type.label}
                          </Text>
                          <View style={{ backgroundColor: status.bg, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.full }}>
                            <Text style={{ fontSize: 10, color: status.text, fontWeight: font.weights.semibold }}>
                              {status.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                          {op.proposerName} → {op.targetName}
                          {op.days > 1 ? ` · ${op.days} dias` : ''}
                        </Text>
                        {op.notes ? (
                          <Text style={{ fontSize: font.sizes.xs, color: colors.text, fontStyle: 'italic', marginTop: 4, backgroundColor: colors.bg, padding: 6, borderRadius: radius.sm }}>
                            &ldquo;{op.notes}&rdquo;
                          </Text>
                        ) : null}
                        <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>
                          Proposto em {formatDateTime(op.created_at)}
                          {op.responded_at ? ` · Respondido em ${formatDateTime(op.responded_at)}` : ''}
                        </Text>

                        {canRespond ? (
                          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                            <TouchableOpacity
                              disabled={responding === op.id}
                              onPress={() => handleRespond(op, 'rejected')}
                              style={{
                                flex: 1, paddingVertical: 6, borderRadius: radius.sm,
                                borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
                                opacity: responding === op.id ? 0.5 : 1,
                              }}
                            >
                              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, fontWeight: font.weights.medium }}>Recusar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              disabled={responding === op.id}
                              onPress={() => handleRespond(op, 'approved')}
                              style={{
                                flex: 1, paddingVertical: 6, borderRadius: radius.sm,
                                backgroundColor: colors.brand, alignItems: 'center',
                                opacity: responding === op.id ? 0.5 : 1,
                              }}
                            >
                              {responding === op.id
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={{ fontSize: font.sizes.xs, color: '#fff', fontWeight: font.weights.semibold }}>Aprovar</Text>}
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </ModalBackdrop>
    </Modal>
  );
}
