/**
 * ActivityReportModal — Log outcome of an activity occurrence:
 *   - status (completed / missed / cancelled)
 *   - child mood
 *   - free-text notes
 *
 * Mirrors PWA /atividades/ActivityReportModal.
 */
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, TextInput,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  submitActivityReport, fetchActivityReport,
  type ActivityReportStatus, type ActivityReportMood,
} from '../../services/activities';
import { useToast } from '../ui/ToastProvider';
import PrimaryButton from '../ui/PrimaryButton';
import ModalBackdrop from '../ui/ModalBackdrop';
import { useI18n } from '../../i18n';
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  activityId: string;
  activityName: string;
  childId: string | null;
  reporterId: string;
  occurrenceDate: string; // YYYY-MM-DD
  onSubmitted?: () => void;
}

const STATUS_OPTIONS: Array<{ value: ActivityReportStatus; label: string; icon: string; color: string }> = [
  { value: 'completed', label: 'Realizada', icon: '✅', color: '#16a34a' },
  { value: 'missed', label: 'Perdida', icon: '❌', color: '#E53935' },
  { value: 'cancelled', label: 'Cancelada', icon: '🚫', color: colors.textMuted },
];
const MOOD_OPTIONS: Array<{ value: ActivityReportMood; emoji: string; label: string }> = [
  { value: 'happy', emoji: '😊', label: 'Feliz' },
  { value: 'neutral', emoji: '😐', label: 'Neutro' },
  { value: 'sad', emoji: '😢', label: 'Triste' },
  { value: 'anxious', emoji: '😰', label: 'Ansioso' },
  { value: 'tired', emoji: '😴', label: 'Cansado' },
];

export default function ActivityReportModal({
  visible, onClose, groupId, activityId, activityName, childId, reporterId, occurrenceDate, onSubmitted,
}: Props) {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [status, setStatus] = useState<ActivityReportStatus>('completed');
  const [notes, setNotes] = useState<string>('');
  const [mood, setMood] = useState<ActivityReportMood | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSubmitting(false);
    // Preload any existing report so the user can edit instead of re-submit
    setLoading(true);
    fetchActivityReport(activityId, occurrenceDate).then(existing => {
      if (existing) {
        setStatus(existing.status);
        setNotes(existing.notes || '');
        setMood(existing.child_mood || null);
      } else {
        setStatus('completed');
        setNotes('');
        setMood(null);
      }
      setLoading(false);
    });
  }, [visible, activityId, occurrenceDate]);

  async function handleSubmit() {
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await submitActivityReport({
      groupId, activityId, childId,
      occurrenceDate, status,
      notes: notes.trim() || null,
      childMood: mood,
      reportedBy: reporterId,
    });
    setSubmitting(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSubmitted?.();
      onClose();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  const formattedDate = new Date(occurrenceDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ModalBackdrop onClose={onClose} align="bottom" dim={0.4} padding={0}>
        <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '92%' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <View>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>Relatar</Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                {activityName} · {formattedDate}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.xl }} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm, marginTop: spacing.md, fontWeight: font.weights.medium }}>
                Como foi?
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                {STATUS_OPTIONS.map(opt => {
                  const active = status === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setStatus(opt.value)}
                      style={{
                        flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                        borderWidth: 1, borderColor: active ? opt.color : colors.borderLight,
                        backgroundColor: active ? `${opt.color}15` : colors.bg,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 22, marginBottom: 2 }}>{opt.icon}</Text>
                      <Text style={{ fontSize: font.sizes.xs, color: active ? opt.color : colors.textSecondary, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm, fontWeight: font.weights.medium }}>
                Humor da crianca
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                {MOOD_OPTIONS.map(opt => {
                  const active = mood === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setMood(active ? null : opt.value)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                        backgroundColor: active ? 'rgba(192,112,85,0.1)' : colors.bg,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{opt.emoji}</Text>
                      <Text style={{ fontSize: font.sizes.xs, color: active ? colors.brand : colors.textSecondary, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs, fontWeight: font.weights.medium }}>
                Observacoes
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Como foi? O que aconteceu?"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={1000}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
                  marginBottom: spacing.lg,
                }}
              />

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Cancelar"
                    onPress={onClose}
                    loading={submitting}
                    variant="secondary"
                    testID="activity-report-cancel"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Salvar relatório"
                    onPress={handleSubmit}
                    loading={submitting}
                    testID="activity-report-submit"
                  />
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </ModalBackdrop>
    </Modal>
  );
}
