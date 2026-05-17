/**
 * SwapRequestModal — Bottom sheet to request a custody swap or visit.
 * Mirrors PWA /calendario/SwapRequestModal.
 *
 * When `isVisitRequest` is true, the user is requesting a visit on the other
 * parent's day without offering a swap date (counts as debt/favor).
 */

import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, KeyboardAvoidingView, Platform,
  ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { createSwap } from '../../services/swaps';
import { DatePickerField, dateToIso } from '../ui/DateTimeField';
import { useToast } from '../ui/ToastProvider';
import { useI18n } from '../../i18n';
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface SwapRequestModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  selectedDate: string;     // YYYY-MM-DD
  targetUserId: string;
  targetUserName: string;
  targetColor: string;
  groupId: string;
  currentUserId: string;
  isVisitRequest?: boolean;
}

export default function SwapRequestModal({
  visible, onClose, onSubmitted,
  selectedDate, targetUserId, targetUserName, targetColor,
  groupId, currentUserId,
  isVisitRequest = false,
}: SwapRequestModalProps) {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [proposedDate, setProposedDate] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setProposedDate(null);
    setReason('');
    setSubmitting(false);
  }

  async function handleSubmit() {
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await createSwap({
      groupId,
      requesterId: currentUserId,
      targetUserId,
      originalDate: selectedDate,
      proposedDate: isVisitRequest ? null : proposedDate,
      reason: reason.trim() || null,
      type: isVisitRequest || !proposedDate ? 'giveaway' : 'swap',
    });
    setSubmitting(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onSubmitted?.();
      onClose();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  const formatted = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const title = isVisitRequest ? 'Pedir para visitar' : 'Pedir troca de dia';
  const submitLabel = isVisitRequest ? 'Pedir visita' : 'Pedir troca';

  // Minimum proposed date = today (can't offer past days)
  const todayIso = dateToIso(new Date());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity activeOpacity={1} onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '92%' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>{title}</Text>
            <TouchableOpacity onPress={close} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Selected day info */}
            <View style={{
              backgroundColor: colors.bg, borderRadius: radius.md,
              padding: spacing.md, marginBottom: spacing.md,
              borderWidth: 1, borderColor: colors.borderLight,
            }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Dia selecionado</Text>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, textTransform: 'capitalize' }}>
                {formatted}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: targetColor }} />
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                  Responsavel: {targetUserName}
                </Text>
              </View>
            </View>

            {isVisitRequest ? (
              <View style={{
                backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: radius.md,
                borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
                padding: spacing.md, marginBottom: spacing.md,
              }}>
                <Text style={{ fontSize: font.sizes.sm, color: '#1d4ed8', lineHeight: 18 }}>
                  Voce esta pedindo para visitar mesmo quando o dia e do outro responsavel.
                  Nao e uma troca — e um favor.
                </Text>
              </View>
            ) : (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
                  Dia que voce oferece em troca
                </Text>
                <DatePickerField
                  value={proposedDate}
                  onChange={setProposedDate}
                  placeholder="Sem troca (conta como favor)"
                  minimumDate={new Date(todayIso + 'T12:00:00')}
                />
                {!proposedDate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <Ionicons name="information-circle-outline" size={14} color="#b45309" />
                    <Text style={{ fontSize: font.sizes.xs, color: '#b45309' }}>
                      Sem dia oferecido = conta como dia devido
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
              Motivo {isVisitRequest ? '' : '(opcional)'}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={isVisitRequest ? 'Aniversario da vovo, passeio especial...' : 'Compromisso de trabalho, viagem...'}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              style={{
                backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                fontSize: font.sizes.md, color: colors.text,
                minHeight: 80, textAlignVertical: 'top', marginBottom: spacing.lg,
              }}
            />

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity
                onPress={close}
                disabled={submitting}
                style={{
                  flex: 1, paddingVertical: spacing.md + 2, borderRadius: radius.md,
                  borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: font.sizes.md, fontWeight: font.weights.medium }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1, paddingVertical: spacing.md + 2, borderRadius: radius.md,
                  backgroundColor: colors.brand, alignItems: 'center',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : (
                    <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                      {submitLabel}
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
