/**
 * Nova Doenca — registrar episodio de doenca.
 * Mirrors PWA /saude/doencas/nova.
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
import { useAuth } from 'src/store/auth';
import { createIllness } from 'src/services/health';
import { fetchChildren, type Child } from 'src/services/children';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

/**
 * Enum DEVE bater com o CHECK constraint de `illness_episodes.severity`
 * (migration 00013): `severity IN ('leve', 'moderado', 'grave')`.
 *
 * Atencao: o valor "grave" e DIFERENTE de "forte" usado em
 * `symptom_entries.intensity` — sao tabelas distintas com vocabularios
 * historicamente distintos. Nao alinhar errado.
 *
 * Bug 2026-05-13 (mesma sessao do bug Diogo de sintomas): a tela usava
 * 'mild'/'moderate'/'severe' (ingles). Como ha CHECK constraint no banco,
 * TODO INSERT falhava silenciosamente com 23514 — o usuario via "Erro"
 * generico e abandonava o cadastro.
 */
type Severity = 'leve' | 'moderado' | 'grave';
const SEVERITIES: { value: Severity; label: string; color: string; icon: string }[] = [
  { value: 'leve', label: 'Leve', color: '#4CAF50', icon: '🟢' },
  { value: 'moderado', label: 'Moderado', color: '#E8A228', icon: '🟡' },
  { value: 'grave', label: 'Grave', color: '#E53935', icon: '🔴' },
];

function parseDate(display: string): string | null {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(+y, +mo - 1, +d);
  if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return null;
  if (dt > new Date()) return null;
  return `${y}-${mo}-${d}`;
}

function todayDisplay(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function NovaDoencaScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(todayDisplay());
  const [symptoms, setSymptoms] = useState('');
  const [severity, setSeverity] = useState<Severity>('leve');
  const [hospital, setHospital] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeGroup) {
      fetchChildren(activeGroup.groupId).then(list => {
        setChildren(list);
        if (list.length > 0 && !childId) setChildId(list[0].id);
      });
    }
  }, [activeGroup, childId]);

  function handleDateChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    setStartDate(formatted);
  }

  async function handleSave() {
    if (!activeGroup) return;
    if (!childId) { setError('Selecione uma crianca'); return; }
    if (!title.trim()) { setError('Informe o titulo do episodio'); return; }
    const iso = parseDate(startDate);
    if (!iso) { setError('Data invalida (DD/MM/AAAA)'); return; }

    setError('');
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await createIllness({
      groupId: activeGroup.groupId,
      childId,
      title,
      startDate: iso,
      symptoms: symptoms.trim() || undefined,
      severity,
      hospital: hospital.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSaving(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Surface o erro real do Supabase pra debug (mesmo padrao adotado em
      // sintomas.tsx apos o bug Diogo). Alert generico mascarava bugs por meses.
      const detail = (result as { error?: string }).error;
      Alert.alert(
        'Erro ao registrar doenca',
        detail
          ? `Detalhes: ${detail}`
          : 'Tente novamente. Se persistir, verifique sua conexão.'
      );
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
          Nova doenca
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {/* Child */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Crianca *</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
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

        {/* Title */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Titulo *</Text>
        <TextInput
          value={title} onChangeText={setTitle}
          placeholder="Ex: Gripe, Covid, Virose"
          placeholderTextColor={colors.textMuted}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Start date */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Inicio *</Text>
        <TextInput
          value={startDate} onChangeText={handleDateChange}
          placeholder="DD/MM/AAAA"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad" maxLength={10}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Severity */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Gravidade</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          {SEVERITIES.map(s => {
            const active = severity === s.value;
            return (
              <TouchableOpacity
                key={s.value}
                onPress={() => setSeverity(s.value)}
                style={{
                  flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                  backgroundColor: active ? `${s.color}20` : colors.bgElevated,
                  borderWidth: 1, borderColor: active ? s.color : colors.borderLight,
                  alignItems: 'center', gap: 4,
                }}
              >
                <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                <Text style={{ fontSize: font.sizes.sm, color: active ? s.color : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Symptoms */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Sintomas</Text>
        <TextInput
          value={symptoms} onChangeText={setSymptoms}
          placeholder="Tosse, febre, dor de garganta..."
          placeholderTextColor={colors.textMuted}
          multiline
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
            marginBottom: spacing.lg,
          }}
        />

        {/* Hospital */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Hospital/clinica</Text>
        <TextInput
          value={hospital} onChangeText={setHospital}
          placeholder="Onde foi atendido (se aplicavel)"
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
          placeholder="Diagnostico, medicacao prescrita, evolucao..."
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
          disabled={saving || !title.trim() || !childId}
          onPress={handleSave}
          activeOpacity={0.85}
          style={{
            backgroundColor: colors.brand, borderRadius: radius.md,
            paddingVertical: spacing.md + 2, alignItems: 'center',
            opacity: saving || !title.trim() || !childId ? 0.5 : 1,
          }}
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Registrar doenca
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
