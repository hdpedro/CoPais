/**
 * Nova Atividade — cria atividade extracurricular (aula, esporte, consulta recorrente).
 * Mirrors PWA /atividades/nova.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { createActivity } from '../../src/services/activities';
import { fetchChildren, type Child } from '../../src/services/children';
import { ACTIVITY_CATEGORIES, getBrazilToday } from '../../src/lib/constants';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

const CAT_LABELS: Record<string, string> = {
  sports: 'Esporte',
  arts: 'Arte',
  music: 'Musica',
  education: 'Educacao',
  health: 'Saude',
  therapy: 'Terapia',
  social: 'Social',
  other: 'Outro',
};

const DAYS = [
  { key: 'mon', label: 'Seg' },
  { key: 'tue', label: 'Ter' },
  { key: 'wed', label: 'Qua' },
  { key: 'thu', label: 'Qui' },
  { key: 'fri', label: 'Sex' },
  { key: 'sat', label: 'Sab' },
  { key: 'sun', label: 'Dom' },
];

const RECURRENCE_OPTS = [
  { value: 'never', label: 'Evento unico' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
];

function formatHHMM(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function validHHMM(v: string): boolean {
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const [, h, mi] = m;
  return +h >= 0 && +h <= 23 && +mi >= 0 && +mi <= 59;
}

export default function NovaAtividadeScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [recurrence, setRecurrence] = useState('weekly');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeGroup) fetchChildren(activeGroup.groupId).then(setChildren);
  }, [activeGroup]);

  function toggleDay(d: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));
  }

  async function handleSave() {
    if (!activeGroup || !userId) return;
    if (!name.trim()) { setError('Informe o nome da atividade'); return; }
    if (timeStart && !validHHMM(timeStart)) { setError('Horario inicio invalido (HH:MM)'); return; }
    if (timeEnd && !validHHMM(timeEnd)) { setError('Horario fim invalido (HH:MM)'); return; }
    if (recurrence !== 'never' && selectedDays.length === 0) {
      setError('Selecione ao menos um dia da semana');
      return;
    }
    setError('');
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await createActivity({
      groupId: activeGroup.groupId,
      name,
      category,
      childId: childId || undefined,
      recurrenceType: recurrence,
      startDate: getBrazilToday(),
      timeStart: timeStart ? `${timeStart}:00` : undefined,
      timeEnd: timeEnd ? `${timeEnd}:00` : undefined,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      daysOfWeek: selectedDays.length > 0 ? selectedDays.join(',') : undefined,
      createdBy: userId,
    });
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', 'Nao foi possivel salvar a atividade.');
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Nova atividade
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {/* Name */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Nome *</Text>
        <TextInput
          value={name} onChangeText={setName}
          placeholder="Ex: Judo, Ingles, Natacao"
          placeholderTextColor={colors.textMuted}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Category chips */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Categoria</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          {ACTIVITY_CATEGORIES.map(c => {
            const active = category === c.value;
            return (
              <TouchableOpacity
                key={c.value}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCategory(c.value); }}
                style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                  backgroundColor: active ? colors.brand : colors.bgElevated,
                  borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}
              >
                <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {CAT_LABELS[c.value] || c.value}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Child selector */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Crianca</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          <TouchableOpacity
            onPress={() => setChildId(null)}
            style={{
              paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
              backgroundColor: childId === null ? colors.brand : colors.bgElevated,
              borderWidth: 1, borderColor: childId === null ? colors.brand : colors.borderLight,
            }}
          >
            <Text style={{ fontSize: font.sizes.sm, color: childId === null ? '#fff' : colors.text, fontWeight: childId === null ? font.weights.semibold : font.weights.normal }}>
              Todas
            </Text>
          </TouchableOpacity>
          {children.map(c => {
            const active = childId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => setChildId(c.id)}
                style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                  backgroundColor: active ? colors.brand : colors.bgElevated,
                  borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                }}
              >
                <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {c.full_name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Recurrence */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Recorrencia</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          {RECURRENCE_OPTS.map(r => {
            const active = recurrence === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                onPress={() => setRecurrence(r.value)}
                style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                  backgroundColor: active ? colors.brand : colors.bgElevated,
                  borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                }}
              >
                <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Days of week (only if recurring) */}
        {recurrence !== 'never' ? (
          <>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Dias da semana</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.lg }}>
              {DAYS.map(d => {
                const active = selectedDays.includes(d.key);
                return (
                  <TouchableOpacity
                    key={d.key}
                    onPress={() => toggleDay(d.key)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center',
                      backgroundColor: active ? colors.brand : colors.bgElevated,
                      borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.xs, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.bold : font.weights.medium }}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Times */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Inicio</Text>
            <TextInput
              value={timeStart}
              onChangeText={v => setTimeStart(formatHHMM(v))}
              placeholder="HH:MM"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                fontSize: font.sizes.md, color: colors.text,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Fim</Text>
            <TextInput
              value={timeEnd}
              onChangeText={v => setTimeEnd(formatHHMM(v))}
              placeholder="HH:MM"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                fontSize: font.sizes.md, color: colors.text,
              }}
            />
          </View>
        </View>

        {/* Location */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Local</Text>
        <TextInput
          value={location} onChangeText={setLocation}
          placeholder="Ex: Clube, escola, casa"
          placeholderTextColor={colors.textMuted}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Notes */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Observacoes</Text>
        <TextInput
          value={notes} onChangeText={setNotes}
          placeholder="Professor, material, regras..."
          placeholderTextColor={colors.textMuted}
          multiline
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
            marginBottom: spacing['2xl'],
          }}
        />

        <TouchableOpacity
          disabled={saving || !name.trim()}
          onPress={handleSave}
          activeOpacity={0.85}
          style={{
            backgroundColor: colors.brand, borderRadius: radius.md,
            paddingVertical: spacing.md + 2, alignItems: 'center',
            opacity: saving || !name.trim() ? 0.5 : 1,
          }}
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Salvar atividade
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
