/**
 * ProposeBalanceAdjustmentSheet — Propose a custody balance adjustment.
 * Mirrors PWA /calendario/ProposeBalanceAdjustmentSheet + BalanceOperationPicker.
 */

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  createBalanceOperation, type BalanceOperationType,
} from '../../services/balance-operations';
import { useToast } from '../ui/ToastProvider';
import { useI18n } from '../../i18n';
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  proposerId: string;
  targetUserId: string;
  targetName: string;
  currentBalance: number;
  onSubmitted?: () => void;
}

// Exclude 'debit' because it requires a specific swap date — that flow uses SwapRequestModal
const OPTIONS: Array<{
  type: BalanceOperationType;
  icon: string;
  label: string;
  description: string;
  needsDays: boolean;
}> = [
  { type: 'waive', icon: '🤝', label: 'Sem gerar saldo', description: 'Troca amigavel, sem criar divida', needsDays: false },
  { type: 'gift_day', icon: '🎁', label: 'Ceder gratuitamente', description: 'Voce cede este dia sem cobrar nada', needsDays: false },
  { type: 'forgive_balance', icon: '⚖️', label: 'Abater saldo existente', description: 'Perdoa parte da divida acumulada', needsDays: true },
  { type: 'reset_balance', icon: '🧹', label: 'Zerar pendencias', description: 'Recomecar do zero. Ambos precisam aprovar.', needsDays: false },
];

export default function ProposeBalanceAdjustmentSheet({
  visible, onClose, groupId, proposerId, targetUserId, targetName, currentBalance, onSubmitted,
}: Props) {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [operationType, setOperationType] = useState<BalanceOperationType>('waive');
  const [days, setDays] = useState<string>('1');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const config = OPTIONS.find(o => o.type === operationType)!;

  function reset() {
    setOperationType('waive');
    setDays('1');
    setNotes('');
    setSubmitting(false);
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    const daysNum = Math.max(1, Math.min(30, parseInt(days, 10) || 1));
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await createBalanceOperation({
      groupId,
      proposerId,
      targetUserId,
      operationType,
      days: daysNum,
      notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onSubmitted?.();
      onClose();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity activeOpacity={1} onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '92%' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              Propor ajuste
            </Text>
            <TouchableOpacity onPress={close} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text
              testID={`balance-recipient-${targetUserId}`}
              accessibilityLabel={`Destinatario ${targetName}`}
              style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md }}
            >
              Proposta para <Text style={{ fontWeight: font.weights.semibold, color: colors.text }}>{targetName}</Text>. Seu saldo atual:{' '}
              <Text style={{ fontWeight: font.weights.semibold, color: currentBalance > 0 ? '#16a34a' : currentBalance < 0 ? '#E53935' : colors.text }}>
                {currentBalance > 0 ? '+' : ''}{currentBalance} {Math.abs(currentBalance) === 1 ? 'dia' : 'dias'}
              </Text>.
            </Text>

            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm, fontWeight: font.weights.medium }}>
              Como tratar esta operacao?
            </Text>
            {OPTIONS.map(opt => {
              const active = operationType === opt.type;
              return (
                <TouchableOpacity
                  key={opt.type}
                  onPress={() => setOperationType(opt.type)}
                  activeOpacity={0.85}
                  testID={`balance-direction-toggle-${opt.type}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.label}
                  style={{
                    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
                    borderWidth: 2, borderColor: active ? colors.brand : colors.borderLight,
                    backgroundColor: active ? 'rgba(192,112,85,0.08)' : colors.bg,
                    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{opt.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: active ? colors.brand : colors.text }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                      {opt.description}
                    </Text>
                  </View>
                  {active ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
                </TouchableOpacity>
              );
            })}

            {config.needsDays ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 4, fontWeight: font.weights.medium }}>
                  Quantos dias abater?
                </Text>
                <TextInput
                  value={days}
                  onChangeText={v => setDays(v.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                  testID="balance-amount"
                  accessibilityLabel="Quantos dias abater"
                  style={{
                    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                    fontSize: font.sizes.md, color: colors.text,
                  }}
                />
              </View>
            ) : null}

            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 4, marginTop: spacing.md, fontWeight: font.weights.medium }}>
              Observacao (opcional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Motivo ou contexto..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              style={{
                backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
                marginBottom: spacing.md,
              }}
            />

            {operationType === 'reset_balance' ? (
              <View style={{ backgroundColor: 'rgba(232,162,40,0.1)', borderWidth: 1, borderColor: 'rgba(232,162,40,0.3)', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md }}>
                <Text style={{ fontSize: font.sizes.xs, color: '#b45309' }}>
                  ⚠️ <Text style={{ fontWeight: font.weights.semibold }}>Atencao:</Text> Zerar saldo reseta todas as pendencias. {targetName} precisa aprovar.
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity
                onPress={close}
                disabled={submitting}
                style={{
                  flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                  borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                testID="balance-propose-submit"
                accessibilityLabel="Enviar proposta de ajuste de saldo"
                style={{
                  flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                  backgroundColor: colors.brand, alignItems: 'center',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                    Enviar proposta
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
