import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from 'src/store/auth';
import {
  fetchActivities, updateActivity, deleteActivity, type Activity,
} from 'src/services/activities';
import { ACTIVITY_CATEGORIES } from 'src/lib/constants';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { TimePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import ActivityReportModal from 'src/components/activities/ActivityReportModal';
import ActivityChecklistModal from 'src/components/activities/ActivityChecklistModal';
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
      Alert.alert('Erro', result.error || 'Falha ao salvar');
    }
  }

  function confirmDelete(activity: Activity) {
    Alert.alert(
      'Remover atividade',
      `Remover "${activity.name}" da lista? O historico fica preservado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover', style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const res = await deleteActivity(activity.id);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setEditing(null);
              await load();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Erro', res.error || 'Falha');
            }
          },
        },
      ]
    );
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
            style={{
              flex: 1, paddingVertical: 8, borderRadius: radius.sm,
              borderWidth: 1, borderColor: colors.borderLight,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4,
            }}
          >
            <Ionicons name="list-outline" size={14} color={colors.textSecondary} />
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, fontWeight: font.weights.medium }}>Checklist</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setReporting(item)}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: radius.sm,
              backgroundColor: `${colors.brand}15`,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4,
            }}
          >
            <Ionicons name="clipboard-outline" size={14} color={colors.brand} />
            <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>Relatar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Atividades" />
      <FlatList data={activities} keyExtractor={item => item.id} renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="📋" title="Nenhuma atividade" subtitle="Crie atividades recorrentes para as criancas" />}
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setEditing(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                Editar atividade
              </Text>
              {editing ? (
                <TouchableOpacity onPress={() => confirmDelete(editing)}>
                  <Ionicons name="trash-outline" size={22} color={colors.error} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>Nome</Text>
              <TextInput
                value={name} onChangeText={setName}
                placeholder="Nome da atividade" placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md,
                }}
              />

              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>Categoria</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                {ACTIVITY_CATEGORIES.map(c => {
                  const active = category === c.value;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      onPress={() => setCategory(c.value)}
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
                  <TimePickerField label="Inicio" value={timeStart} onChange={setTimeStart} placeholder="—" />
                </View>
                <View style={{ flex: 1 }}>
                  <TimePickerField label="Fim" value={timeEnd} onChange={setTimeEnd} placeholder="—" />
                </View>
              </View>

              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>Local</Text>
              <TextInput
                value={location} onChangeText={setLocation}
                placeholder="Onde acontece" placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md,
                }}
              />

              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>Observacoes</Text>
              <TextInput
                value={notes} onChangeText={setNotes}
                placeholder="Notas, material necessario..." placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
                  marginBottom: spacing.lg,
                }}
              />

              <TouchableOpacity
                disabled={saving || !name.trim()}
                onPress={handleSave}
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md + 2, alignItems: 'center',
                  opacity: saving || !name.trim() ? 0.5 : 1,
                }}
              >
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                    Salvar alteracoes
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
