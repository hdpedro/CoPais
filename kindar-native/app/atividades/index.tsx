import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput,
  ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import {
  fetchActivities, updateActivity, deleteActivity, type Activity,
} from 'src/services/activities';
import { ACTIVITY_CATEGORIES } from 'src/lib/constants';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { TimePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import { confirmDestructive } from 'src/components/ui/DestructiveConfirm';
import ActivityReportModal from 'src/components/activities/ActivityReportModal';
import ActivityChecklistModal from 'src/components/activities/ActivityChecklistModal';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Format the day(s) on which an activity occurs:
 *   - weekly + days_of_week "[1,3]"  → "Seg, Qua"
 *   - daily                          → "Todos os dias"
 *   - monthly                        → "Mensal"
 *   - never (one-time) + start_date  → "23/03"
 */
function formatActivityDay(item: { recurrence_type: string; days_of_week: string | null; start_date: string }): string {
  if (item.recurrence_type === 'weekly' && item.days_of_week) {
    try {
      const arr: number[] = JSON.parse(item.days_of_week);
      return arr.map(n => DAY_SHORT[n] || '').filter(Boolean).join(', ');
    } catch {
      // legacy "1,3,5" plain CSV — best-effort fallback
      return item.days_of_week.split(',').map(s => DAY_SHORT[parseInt(s.trim(), 10)] || '').filter(Boolean).join(', ');
    }
  }
  if (item.recurrence_type === 'daily') return 'Todos os dias';
  if (item.recurrence_type === 'monthly') return 'Mensal';
  if (item.recurrence_type === 'never' && item.start_date) {
    const [, m, d] = item.start_date.split('-');
    return d && m ? `${d}/${m}` : '';
  }
  return '';
}

export default function AtividadesScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { activeGroup, userId } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState<Activity | null>(null);
  const [checklisting, setChecklisting] = useState<Activity | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [timeStart, setTimeStart] = useState<string | null>(null);
  const [timeEnd, setTimeEnd] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const data = await fetchActivities(activeGroup.groupId);
    setActivities(data);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Real-time entre coparentes
  useCollabRealtime({
    table: 'child_activities',
    groupId: activeGroup?.groupId,
    onChange: load,
    displayLabel: 'atividade',
    myUserId: userId,
  });

  function openEditor(activity: Activity) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setName(activity.name);
    setCategory(activity.category || 'other');
    setTimeStart(normalizeTime(activity.time_start));
    setTimeEnd(normalizeTime(activity.time_end));
    setLocation(activity.location || '');
    setNotes(activity.notes || '');
    setEditing(activity);
  }

  async function handleSave() {
    if (!editing || !name.trim()) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await updateActivity(editing.id, {
      name: name.trim(),
      category,
      time_start: timeStart ? `${timeStart}:00` : null,
      time_end: timeEnd ? `${timeEnd}:00` : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(null);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('activities.errors.saveFallback'), variant: 'error' });
    }
  }

  /**
   * Conta ocorrências futuras + histórico antes do delete. Heurística rápida
   * via calendar_occurrences (trigger 00074 mantém isso atualizado).
   */
  async function countActivityImpact(activityId: string): Promise<{ future: number; past: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const [future, past] = await Promise.all([
      supabase
        .from('calendar_occurrences')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', activityId)
        .gte('occurrence_date', today),
      supabase
        .from('calendar_occurrences')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', activityId)
        .lt('occurrence_date', today),
    ]);
    return { future: future.count ?? 0, past: past.count ?? 0 };
  }

  async function confirmDelete(activity: Activity) {
    const impact = await countActivityImpact(activity.id);
    const ok = await confirmDestructive({
      title: t('activities.removeTitle', { name: activity.name }),
      consequences: [
        { count: impact.future, label: t('activities.consequences.futureLabel'), impact: 'apagado' },
        { count: impact.past, label: t('activities.consequences.pastLabel'), impact: 'preservado' },
      ],
      destructiveLabel: t('activities.removeAction'),
    });
    if (!ok) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const res = await deleteActivity(activity.id);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(null);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('activities.errors.deleteFallback'), variant: 'error' });
    }
  }

  const renderItem = ({ item }: { item: Activity }) => {
    const cat = ACTIVITY_CATEGORIES.find(c => c.value === item.category);
    const dayLabel = formatActivityDay(item);
    return (
      <View
        style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => openEditor(item)}
          onLongPress={() => confirmDelete(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}${item.childName ? `, ${item.childName}` : ''}${dayLabel ? `, ${dayLabel}` : ''}`}
          accessibilityHint={t('a11y.activities.cardHint') || 'Toque para editar, toque longo para remover'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          <Text style={{ fontSize: 22 }}>{cat?.icon || '📌'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
              {[item.childName, dayLabel, item.time_start?.slice(0, 5), item.location].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <TouchableOpacity
            onPress={() => setChecklisting(item)}
            accessibilityRole="button"
            accessibilityLabel={`${t('activities.checklist')} de ${item.name}`}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: radius.sm,
              borderWidth: 1, borderColor: colors.borderLight,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4,
            }}
          >
            <Ionicons name="list-outline" size={14} color={colors.textSecondary} />
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, fontWeight: font.weights.medium }}>{t('activities.checklist')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setReporting(item)}
            accessibilityRole="button"
            accessibilityLabel={`${t('activities.report')} de ${item.name}`}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: radius.sm,
              backgroundColor: `${colors.brand}15`,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4,
            }}
          >
            <Ionicons name="clipboard-outline" size={14} color={colors.brand} />
            <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>{t('activities.report')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('activities.title')} />
      {loading && activities.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      ) : null}
      <FlatList data={loading && activities.length === 0 ? [] : activities} keyExtractor={item => item.id} renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="📋" title={t('empty.atividades.title')} description={t('empty.atividades.description')} />}
      />
      <FAB onPress={() => router.push('/atividades/nova')} />

      {/* Report modal — current occurrence date = today */}
      {reporting && activeGroup && userId ? (
        <ActivityReportModal
          visible={!!reporting}
          onClose={() => setReporting(null)}
          groupId={activeGroup.groupId}
          activityId={reporting.id}
          activityName={reporting.name}
          childId={reporting.child_id}
          reporterId={userId}
          occurrenceDate={dateToIso(new Date())}
          onSubmitted={load}
        />
      ) : null}

      {/* Checklist modal */}
      {checklisting && userId ? (
        <ActivityChecklistModal
          visible={!!checklisting}
          onClose={() => setChecklisting(null)}
          activityId={checklisting.id}
          activityName={checklisting.name}
          occurrenceDate={dateToIso(new Date())}
          completedBy={userId}
        />
      ) : null}

      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <ModalBackdrop onClose={() => setEditing(null)} align="bottom" dim={0.4} padding={0}>
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                {t('activities.editTitle')}
              </Text>
              {editing ? (
                <TouchableOpacity onPress={() => confirmDelete(editing)} accessibilityRole="button" accessibilityLabel={`Remover ${editing.name}`}>
                  <Ionicons name="trash-outline" size={22} color={colors.error} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>{t('activities.fields.name')}</Text>
              <TextInput
                value={name} onChangeText={setName}
                placeholder={t('activities.placeholders.name')} placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md,
                }}
              />

              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>{t('activities.fields.category')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                {ACTIVITY_CATEGORIES.map(c => {
                  const active = category === c.value;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      onPress={() => setCategory(c.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={c.value}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: active ? colors.brand : colors.bg,
                        borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                      <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {c.value}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <TimePickerField label={t('activities.fields.start')} value={timeStart} onChange={setTimeStart} placeholder={t('activities.timePlaceholder')} />
                </View>
                <View style={{ flex: 1 }}>
                  <TimePickerField label={t('activities.fields.end')} value={timeEnd} onChange={setTimeEnd} placeholder={t('activities.timePlaceholder')} />
                </View>
              </View>

              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>{t('activities.fields.location')}</Text>
              <TextInput
                value={location} onChangeText={setLocation}
                placeholder={t('activities.placeholders.location')} placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md,
                }}
              />

              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>{t('activities.fields.notes')}</Text>
              <TextInput
                value={notes} onChangeText={setNotes}
                placeholder={t('activities.placeholders.notes')} placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
                  marginBottom: spacing.lg,
                }}
              />

              <PrimaryButton
                label={t('activities.saveChanges')}
                onPress={handleSave}
                loading={saving}
                disabled={!name.trim()}
                testID="atividades-save-edit"
              />
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
