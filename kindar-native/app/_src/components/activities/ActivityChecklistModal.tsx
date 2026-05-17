/**
 * ActivityChecklistModal — Show per-activity checklist items and let user
 * toggle completion for a specific occurrence date.
 *
 * Mirrors PWA /atividades/ActivityChecklistModal.
 */
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchChecklist, fetchChecklistCompletions, toggleChecklistItem,
  type ChecklistItem,
} from '../../services/activities';
import { useToast } from '../ui/ToastProvider';
import ModalBackdrop from '../ui/ModalBackdrop';
import { useI18n } from '../../i18n';
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  activityId: string;
  activityName: string;
  occurrenceDate: string;
  completedBy: string;
}

export default function ActivityChecklistModal({ visible, onClose, activityId, activityName, occurrenceDate, completedBy }: Props) {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([
      fetchChecklist(activityId),
      fetchChecklistCompletions(activityId, occurrenceDate),
    ]).then(([list, completedSet]) => {
      setItems(list);
      setCompleted(completedSet);
      setLoading(false);
    });
  }, [visible, activityId, occurrenceDate]);

  async function handleToggle(item: ChecklistItem) {
    const isNowCompleted = !completed.has(item.id);
    // Optimistic update
    setCompleted(prev => {
      const next = new Set(prev);
      if (isNowCompleted) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    setToggling(item.id);
    Haptics.impactAsync(isNowCompleted ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    const res = await toggleChecklistItem({
      activityId, itemId: item.id, occurrenceDate,
      completed: isNowCompleted, completedBy,
    });
    setToggling(null);
    if (!res.success) {
      // Rollback on error
      setCompleted(prev => {
        const next = new Set(prev);
        if (isNowCompleted) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      toast.show({ message: res.error || t('toasts.common.updateFailed'), variant: 'error' });
    }
  }

  const completedCount = completed.size;
  const allDone = items.length > 0 && completedCount === items.length;
  const progress = items.length > 0 ? completedCount / items.length : 0;

  const formattedDate = new Date(occurrenceDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ModalBackdrop onClose={onClose} align="bottom" dim={0.4} padding={0}>
        <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '85%' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                {activityName}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                {formattedDate}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {items.length > 0 ? (
            <View style={{ marginVertical: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                  {completedCount} de {items.length} concluidos
                </Text>
                {allDone ? (
                  <Text style={{ fontSize: font.sizes.xs, color: '#16a34a', fontWeight: font.weights.semibold }}>
                    Tudo pronto ✓
                  </Text>
                ) : null}
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.borderLight, overflow: 'hidden' }}>
                <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: allDone ? '#16a34a' : colors.brand }} />
              </View>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.xl }} />
          ) : items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'] }}>
              <Text style={{ fontSize: 40, marginBottom: spacing.md }}>📋</Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, textAlign: 'center' }}>
                Esta atividade nao tem checklist configurado
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              {items.map(item => {
                const isDone = completed.has(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => handleToggle(item)}
                    disabled={toggling === item.id}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      paddingVertical: spacing.md, paddingHorizontal: spacing.md,
                      borderRadius: radius.md, marginBottom: 6,
                      backgroundColor: isDone ? 'rgba(34,197,94,0.08)' : colors.bg,
                      borderWidth: 1, borderColor: isDone ? 'rgba(34,197,94,0.3)' : colors.borderLight,
                      opacity: toggling === item.id ? 0.5 : 1,
                    }}
                  >
                    <View style={{
                      width: 22, height: 22, borderRadius: 11,
                      borderWidth: 2, borderColor: isDone ? '#16a34a' : colors.borderLight,
                      backgroundColor: isDone ? '#16a34a' : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isDone ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                    <Text style={{
                      flex: 1, fontSize: font.sizes.md,
                      color: isDone ? colors.textSecondary : colors.text,
                      textDecorationLine: isDone ? 'line-through' : 'none',
                    }}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </ModalBackdrop>
    </Modal>
  );
}
