/**
 * ActivityDetailSheet — rich bottom-sheet for one specific activity
 * occurrence. Replaces the simpler ActivityChecklistModal when the user
 * taps a Hoje/Amanhã card on the dashboard.
 *
 * Mirrors PWA `src/app/(app)/calendario/DayDetailSheet.tsx` per-activity
 * card (the expanded state shown in the user's reference screenshot).
 *
 * Shows:
 *   - Activity name + category icon
 *   - Date (formatted)
 *   - Time range (HH:MM - HH:MM)
 *   - Location
 *   - Responsible person (with "Alterar" hint linking to edit)
 *   - Child name
 *   - Checklist with progress bar + toggles
 *   - Quick actions: Compartilhar, Editar, Excluir, Reportar
 */
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert, Share,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import {
  fetchChecklist, fetchChecklistCompletions, toggleChecklistItem, deleteActivity,
  type ChecklistItem,
} from '../../services/activities';
import { ACTIVITY_CATEGORIES } from '../../lib/constants';

const CATEGORY_LABEL: Record<string, string> = {
  sports: 'Esporte',
  arts: 'Arte',
  music: 'Música',
  education: 'Educação',
  health: 'Saúde',
  therapy: 'Terapia',
  social: 'Social',
  other: 'Outra',
};
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface ActivityFull {
  id: string;
  name: string;
  category: string;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  notes: string | null;
  childName: string;
  responsibleName: string | null;
  teacherName: string | null;
  className: string | null;
  room: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  activityId: string;
  occurrenceDate: string;
  completedBy: string;
  /** Triggers ActivityReportModal in the parent. Optional. */
  onReport?: () => void;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const days = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${days[date.getDay()]}, ${d} de ${months[m - 1]}`;
}

function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

export default function ActivityDetailSheet({
  visible, onClose, activityId, occurrenceDate, completedBy, onReport,
}: Props) {
  const [activity, setActivity] = useState<ActivityFull | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([
      supabase
        .from('child_activities')
        .select('id, name, category, time_start, time_end, location, notes, teacher_name, class_name, room, children(full_name), responsible:profiles!child_activities_responsible_id_fkey(full_name)')
        .eq('id', activityId)
        .maybeSingle()
        .then((r: any) => {
          if (!r.data) return null;
          const child = Array.isArray(r.data.children) ? r.data.children[0] : r.data.children;
          const resp = Array.isArray(r.data.responsible) ? r.data.responsible[0] : r.data.responsible;
          return {
            id: r.data.id,
            name: r.data.name,
            category: r.data.category,
            time_start: r.data.time_start,
            time_end: r.data.time_end,
            location: r.data.location,
            notes: r.data.notes,
            childName: child?.full_name?.split(' ')[0] || 'Todos',
            responsibleName: resp?.full_name || null,
            teacherName: r.data.teacher_name,
            className: r.data.class_name,
            room: r.data.room,
          } as ActivityFull;
        }),
      fetchChecklist(activityId),
      fetchChecklistCompletions(activityId, occurrenceDate),
    ]).then(([act, list, completedSet]) => {
      setActivity(act);
      setItems(list);
      setCompleted(completedSet);
      setLoading(false);
    }).catch(() => {
      // Sem .catch o setLoading nunca cleared -> "tela de processando"
      // infinita. Reportado pelo Henrique. Garante encerramento mesmo
      // em erro (no piores casos, activity fica null e onClose cuida).
      setLoading(false);
    });
  }, [visible, activityId, occurrenceDate]);

  async function handleToggle(item: ChecklistItem) {
    const isNowCompleted = !completed.has(item.id);
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
      setCompleted(prev => {
        const next = new Set(prev);
        if (isNowCompleted) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      Alert.alert('Erro', res.error);
    }
  }

  async function handleShare() {
    if (!activity) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lines = [
      `📋 ${activity.name}`,
      formatDate(occurrenceDate),
    ];
    if (activity.time_start) {
      lines.push(`🕐 ${formatTime(activity.time_start)}${activity.time_end ? ` - ${formatTime(activity.time_end)}` : ''}`);
    }
    if (activity.location) lines.push(`📍 ${activity.location}`);
    if (activity.childName) lines.push(`👶 ${activity.childName}`);
    if (items.length > 0) {
      lines.push('');
      lines.push(`✅ ${completed.size}/${items.length} itens do checklist`);
    }
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // user cancelled
    }
  }

  function handleEdit() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push('/atividades');
  }

  async function handleDelete() {
    if (!activity) return;
    Alert.alert(
      'Excluir atividade',
      `Apagar "${activity.name}"? Essa ação remove a atividade e todas as ocorrências futuras.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const r = await deleteActivity(activityId);
            if (r.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onClose();
            } else {
              Alert.alert('Erro', r.error || 'Falha ao excluir.');
            }
          },
        },
      ],
    );
  }

  function handleReport() {
    if (!onReport) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    // small delay to let the sheet close before opening the report modal
    setTimeout(onReport, 200);
  }

  const cat = activity ? ACTIVITY_CATEGORIES.find(c => c.value === activity.category) : null;
  const completedCount = completed.size;
  const progress = items.length > 0 ? completedCount / items.length : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={onClose} />
        <View style={{
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
          paddingTop: spacing.md, paddingBottom: 40, maxHeight: '92%',
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />

          {/* Header: date + close */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, flex: 1 }}>
              {formatDate(occurrenceDate)}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading || !activity ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing['3xl'] }} />
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl }}>
              {/* Activity title card */}
              <View style={{
                backgroundColor: `${colors.secondary}10`,
                borderWidth: 1, borderColor: `${colors.secondary}40`,
                borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: radius.md,
                    backgroundColor: `${colors.secondary}25`,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 22 }}>{cat?.icon || '📌'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                      {activity.name}
                    </Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                      {[CATEGORY_LABEL[activity.category] || 'Atividade', activity.childName, formatTime(activity.time_start)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>

                {/* Detail rows */}
                <View style={{ gap: 10 }}>
                  {activity.time_start ? (
                    <DetailRow icon="alarm-outline" label={`${formatTime(activity.time_start)}${activity.time_end ? ` - ${formatTime(activity.time_end)}` : ''}`} />
                  ) : null}
                  {activity.location ? (
                    <DetailRow icon="location-outline" label={activity.location} />
                  ) : null}
                  {activity.responsibleName ? (
                    <DetailRow
                      icon="person-outline"
                      label={`Responsável pela atividade: ${activity.responsibleName}`}
                      action={{ label: 'Alterar', onPress: handleEdit }}
                    />
                  ) : null}
                  {activity.childName ? (
                    <DetailRow icon="people-outline" label={activity.childName} />
                  ) : null}
                  {activity.teacherName ? (
                    <DetailRow icon="school-outline" label={`Prof. ${activity.teacherName}`} />
                  ) : null}
                  {activity.className || activity.room ? (
                    <DetailRow icon="business-outline" label={[activity.className, activity.room].filter(Boolean).join(' · ')} />
                  ) : null}
                </View>

                {/* Checklist progress + items */}
                {items.length > 0 ? (
                  <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: `${colors.secondary}30` }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ionicons name="checkbox-outline" size={16} color={progress === 1 ? '#16a34a' : colors.secondary} />
                      <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: progress === 1 ? '#16a34a' : colors.text }}>
                        {completedCount}/{items.length} {items.length === 1 ? 'item no checklist' : 'itens no checklist'}
                      </Text>
                    </View>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.borderLight, overflow: 'hidden', marginBottom: spacing.sm }}>
                      <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: progress === 1 ? '#16a34a' : colors.secondary }} />
                    </View>
                    {items.map(item => {
                      const isDone = completed.has(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => handleToggle(item)}
                          disabled={toggling === item.id}
                          activeOpacity={0.75}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                            paddingVertical: 8, paddingHorizontal: 8,
                            borderRadius: radius.sm, marginBottom: 4,
                            backgroundColor: isDone ? 'rgba(34,197,94,0.08)' : 'transparent',
                            opacity: toggling === item.id ? 0.5 : 1,
                          }}
                        >
                          <View style={{
                            width: 18, height: 18, borderRadius: 4,
                            borderWidth: 1.5, borderColor: isDone ? '#16a34a' : colors.borderLight,
                            backgroundColor: isDone ? '#16a34a' : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isDone ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                          </View>
                          <Text style={{
                            flex: 1, fontSize: font.sizes.sm,
                            color: isDone ? colors.textMuted : colors.text,
                            textDecorationLine: isDone ? 'line-through' : 'none',
                          }}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {/* Action row: share / edit / delete / report */}
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: `${colors.secondary}30` }}>
                  <ActionButton icon="share-outline" label="Compartilhar" onPress={handleShare} />
                  <ActionButton icon="create-outline" label="Editar" onPress={handleEdit} />
                  <ActionButton icon="trash-outline" label="Excluir" onPress={handleDelete} destructive />
                  {onReport ? (
                    <ActionButton icon="clipboard-outline" label="Relatar" onPress={handleReport} primary />
                  ) : null}
                </View>
              </View>

              {activity.notes ? (
                <View style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    Observações
                  </Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text, lineHeight: 20 }}>
                    {activity.notes}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({
  icon, label, action,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text, lineHeight: 20 }}>
        {label}
      </Text>
      {action ? (
        <TouchableOpacity onPress={action.onPress} hitSlop={6}>
          <Text style={{ fontSize: font.sizes.xs, color: colors.secondary, fontWeight: font.weights.semibold }}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ActionButton({
  icon, label, onPress, destructive, primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  primary?: boolean;
}) {
  const tint = destructive ? colors.error : primary ? colors.brand : colors.textSecondary;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flex: 1,
        flexDirection: 'column', alignItems: 'center', gap: 4,
        paddingVertical: spacing.sm,
        borderRadius: radius.sm,
        backgroundColor: primary ? `${colors.brand}10` : 'transparent',
        borderWidth: primary ? 1 : 0,
        borderColor: primary ? `${colors.brand}30` : 'transparent',
      }}
    >
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={{ fontSize: font.sizes.xs, color: tint, fontWeight: font.weights.medium }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
