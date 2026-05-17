import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from 'src/store/auth';
import { fetchEvents, updateEvent, deleteEvent, type SocialEvent } from 'src/services/events';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { DatePickerField, TimePickerField } from 'src/components/ui/DateTimeField';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function EventosScreen() {
  const t = useI18n(s => s.t);
  const { activeGroup } = useAuth();
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<SocialEvent | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateIso, setDateIso] = useState('');
  const [timeHHMM, setTimeHHMM] = useState<string | null>(null);
  const [location, setLocation] = useState('');

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const data = await fetchEvents(activeGroup.groupId);
    setEvents(data);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openEditor(ev: SocialEvent) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTitle(ev.title);
    setDescription(ev.description || '');
    setDateIso(ev.event_date);
    // event_time is on the row — present in the DB, not typed in SocialEvent
    const evTime = (ev as unknown as { event_time?: string | null }).event_time;
    setTimeHHMM(normalizeTime(evTime));
    setLocation(ev.location || '');
    setEditing(ev);
  }

  function closeEditor() {
    setEditing(null);
    setSaving(false);
  }

  async function handleSave() {
    if (!editing || !title.trim() || !dateIso) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await updateEvent(editing.id, {
      title: title.trim(),
      description: description.trim() || null,
      event_date: dateIso,
      event_time: timeHHMM ? `${timeHHMM}:00` : null,
      location: location.trim() || null,
      all_day: !timeHHMM,
    });
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeEditor();
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', result.error || 'Não foi possível salvar');
    }
  }

  function confirmDelete(ev: SocialEvent) {
    Alert.alert(
      'Remover evento',
      `Remover "${ev.title}"? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover', style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const res = await deleteEvent(ev.id);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              closeEditor();
              await load();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Erro', res.error || 'Falha');
            }
          },
        },
      ],
    );
  }

  const renderItem = ({ item }: { item: SocialEvent }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => openEditor(item)}
      onLongPress={() => confirmDelete(item)}
      style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${colors.secondary}15`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="flag-outline" size={18} color={colors.secondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.title}</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
          {formatDate(item.event_date)}{item.location ? ` · ${item.location}` : ''}{item.assignedName ? ` · ${item.assignedName}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('events.title')} rightAction={{ icon: 'mail-outline', onPress: () => router.push('/eventos/pedidos') }} />
      <FlatList data={events} keyExtractor={item => item.id} renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="🎯" title={t('empty.eventos.title')} description={t('empty.eventos.description')} />}
      />
      <FAB onPress={() => router.push('/calendario/novo')} />

      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={closeEditor}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={closeEditor} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                Editar evento
              </Text>
              {editing ? (
                <TouchableOpacity onPress={() => confirmDelete(editing)}>
                  <Ionicons name="trash-outline" size={22} color={colors.error} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>Titulo</Text>
              <TextInput
                value={title} onChangeText={setTitle}
                placeholder="Titulo do evento" placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md,
                }}
              />

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <DatePickerField label="Data" value={dateIso || null} onChange={setDateIso} placeholder="Selecione" />
                </View>
                <View style={{ flex: 1 }}>
                  <TimePickerField label="Hora (opcional)" value={timeHHMM} onChange={setTimeHHMM} placeholder="Dia inteiro" />
                </View>
              </View>

              {timeHHMM ? (
                <TouchableOpacity
                  onPress={() => setTimeHHMM(null)}
                  style={{ alignSelf: 'flex-start', marginBottom: spacing.md }}
                >
                  <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>
                    Remover horario (evento de dia inteiro)
                  </Text>
                </TouchableOpacity>
              ) : null}

              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>Local (opcional)</Text>
              <TextInput
                value={location} onChangeText={setLocation}
                placeholder="Local" placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md,
                }}
              />

              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>Descricao (opcional)</Text>
              <TextInput
                value={description} onChangeText={setDescription}
                placeholder="Detalhes" placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
                  marginBottom: spacing.lg,
                }}
              />

              <TouchableOpacity
                disabled={saving || !title.trim() || !dateIso}
                onPress={handleSave}
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md + 2, alignItems: 'center',
                  opacity: saving || !title.trim() || !dateIso ? 0.5 : 1,
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
