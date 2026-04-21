/**
 * Novo Evento — Criacao de evento no calendario.
 * Tipos: guarda (custody), evento social, atividade.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeWrite } from '../../src/services/offline';
import { notifyAction } from '../../src/services/notify';
import { useAuth } from '../../src/store/auth';
import { getBrazilToday } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

type EventKind = 'social' | 'custody' | 'activity';

const EVENT_KINDS: Array<{ kind: EventKind; icon: string; label: string; desc: string }> = [
  { kind: 'social', icon: '🎯', label: 'Evento Social', desc: 'Aniversario, reuniao, viagem' },
  { kind: 'custody', icon: '📅', label: 'Guarda / Escala', desc: 'Dia com pai ou mae' },
  { kind: 'activity', icon: '📋', label: 'Atividade', desc: 'Aula, consulta recorrente' },
];

export default function NovoEventoScreen() {
  const insets = useSafeAreaInsets();
  const { userId, activeGroup } = useAuth();
  const [kind, setKind] = useState<EventKind>('social');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(getBrazilToday());
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim() || !userId || !activeGroup) return;
    setSaving(true);

    let result;
    if (kind === 'social') {
      result = await safeWrite({
        table: 'events', operation: 'insert',
        payload: { group_id: activeGroup.groupId, title: title.trim(), event_date: date, location: location.trim() || null, all_day: true, created_by: userId },
      });
      if (result.success && !result.queued) notifyAction('event_created', activeGroup.groupId, { title });
    } else if (kind === 'custody') {
      result = await safeWrite({
        table: 'custody_events', operation: 'insert',
        payload: { group_id: activeGroup.groupId, start_date: date, end_date: date, responsible_user_id: userId, custody_type: 'regular', notes: title.trim(), created_by: userId },
      });
    } else {
      result = await safeWrite({
        table: 'child_activities', operation: 'insert',
        payload: { group_id: activeGroup.groupId, name: title.trim(), category: 'other', recurrence_type: 'never', start_date: date, location: location.trim() || null, notes: notes.trim() || null, is_active: true, created_by: userId },
      });
    }

    if (result?.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      Alert.alert('Erro', result?.error || 'Nao foi possivel salvar');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setSaving(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Novo Evento" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">

        {/* Tipo */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textMuted, marginBottom: spacing.sm }}>Tipo</Text>
        {EVENT_KINDS.map(ek => (
          <TouchableOpacity key={ek.kind} onPress={() => { setKind(ek.kind); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, marginBottom: spacing.sm,
              backgroundColor: kind === ek.kind ? `${colors.brand}10` : colors.bgElevated,
              borderWidth: kind === ek.kind ? 2 : 1, borderColor: kind === ek.kind ? colors.brand : colors.borderLight }}>
            <Text style={{ fontSize: 22 }}>{ek.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>{ek.label}</Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{ek.desc}</Text>
            </View>
            {kind === ek.kind ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
          </TouchableOpacity>
        ))}

        {/* Titulo */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.xs }}>
          {kind === 'custody' ? 'Descricao da escala' : 'Titulo'}
        </Text>
        <TextInput value={title} onChangeText={setTitle}
          placeholder={kind === 'social' ? 'Ex: Aniversario da Ana' : kind === 'custody' ? 'Ex: Semana com o pai' : 'Ex: Natacao'}
          placeholderTextColor={colors.textDim}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }} />

        {/* Data */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textMuted, marginBottom: spacing.xs }}>Data (AAAA-MM-DD)</Text>
        <TextInput value={date} onChangeText={setDate} placeholder="2026-04-14" placeholderTextColor={colors.textDim}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }} />

        {/* Local */}
        {kind !== 'custody' ? (
          <>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textMuted, marginBottom: spacing.xs }}>Local (opcional)</Text>
            <TextInput value={location} onChangeText={setLocation} placeholder="Onde?" placeholderTextColor={colors.textDim}
              style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }} />
          </>
        ) : null}

        {/* Save */}
        <TouchableOpacity onPress={handleSave} disabled={saving || !title.trim()}
          style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', opacity: saving || !title.trim() ? 0.5 : 1, marginTop: spacing.md }}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>Salvar evento</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
