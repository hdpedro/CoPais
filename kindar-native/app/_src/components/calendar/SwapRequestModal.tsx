/**
 * SwapRequestModal — Bottom sheet to request a custody swap or visit.
 * Mirrors PWA /calendario/SwapRequestModal.
 *
 * When `isVisitRequest` is true, the user is requesting a visit on the other
 * parent's day without offering a swap date (counts as debt/favor).
 */

import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal,
  ScrollView, TextInput,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { createSwap } from '../../services/swaps';
import { DatePickerField, dateToIso } from '../ui/DateTimeField';
import { useToast } from '../ui/ToastProvider';
import PrimaryButton from '../ui/PrimaryButton';
import ModalBackdrop from '../ui/ModalBackdrop';
import { useI18n } from '../../i18n';
import { useIntl } from '../../lib/intl';
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
  const intl = useIntl();
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

  const formatted = intl.formatDate(selectedDate, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const title = isVisitRequest ? t('swapRequest.titleVisit') : t('swapRequest.titleSwap');
  const submitLabel = isVisitRequest ? t('swapRequest.submitVisit') : t('swapRequest.submitSwap');

  // Minimum proposed date = today (can't offer past days)
  const todayIso = dateToIso(new Date());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <ModalBackdrop onClose={close} align="bottom" dim={0.4} padding={0}>
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
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{t('swapModal.selectedDay')}</Text>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, textTransform: 'capitalize' }}>
                {formatted}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: targetColor }} />
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                  {t('swapRequest.responsibleLabel', { name: targetUserName })}
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
                  {t('swapRequest.visitExplanation')}
                </Text>
              </View>
            ) : (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
                  {t('swapModal.dayYouOffer')}
                </Text>
                <DatePickerField
                  value={proposedDate}
                  onChange={setProposedDate}
                  placeholder={t('swapRequest.noSwapPlaceholder')}
                  minimumDate={new Date(todayIso + 'T12:00:00')}
                />
                {!proposedDate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <Ionicons name="information-circle-outline" size={14} color="#b45309" />
                    <Text style={{ fontSize: font.sizes.xs, color: '#b45309' }}>
                      {t('swapRequest.noSwapHint')}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
              {isVisitRequest ? t('swapRequest.reasonLabel') : t('swapModal.reasonOptional')}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={isVisitRequest ? t('swapRequest.reasonPlaceholderVisit') : t('swapRequest.reasonPlaceholderSwap')}
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
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label={t('common.cancel')}
                  onPress={close}
                  loading={submitting}
                  variant="secondary"
                  testID="swap-request-cancel"
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label={submitLabel}
                  onPress={handleSubmit}
                  loading={submitting}
                  testID="swap-request-submit"
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}
