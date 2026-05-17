/**
 * Nova Crianca — cadastrar criança no grupo.
 * Mirrors PWA /criancas/nova form.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { createChild } from 'src/services/children';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

// Schema check (CHECK sex IN ('M','F')) lives on `children.sex`. Native must
// store one of these two literals — values like 'female'/'male'/'other' are
// rejected by Postgres and the entire add-child flow fails with HTTP 400.
const SEX_OPTIONS: { value: 'M' | 'F'; label: string; icon: string }[] = [
  { value: 'F', label: 'Feminino', icon: '👧' },
  { value: 'M', label: 'Masculino', icon: '👦' },
];

function parseDate(display: string): string | null {
  // input: DD/MM/AAAA → YYYY-MM-DD
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(+y, +mo - 1, +d);
  if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return null;
  if (dt > new Date()) return null; // no future birthdays
  return `${y}-${mo}-${d}`;
}

export default function NovaCriancaScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<'M' | 'F' | ''>('');
  const [allergiesText, setAllergiesText] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleBirthDateChange(value: string) {
    // auto-format DD/MM/YYYY while typing
    const digits = value.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    setBirthDate(formatted);
  }

  async function handleSave() {
    if (!activeGroup) return;
    if (!fullName.trim()) { setError('Informe o nome da criança'); return; }
    const iso = parseDate(birthDate);
    if (!iso) { setError('Data de nascimento inválida (DD/MM/AAAA)'); return; }

    setError('');
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Allergies: comma- or newline-separated → text[] for the children.allergies column.
    const allergies = allergiesText
      .split(/[,\n;]/)
      .map(s => s.trim())
      .filter(Boolean);

    const result = await createChild({
      groupId: activeGroup.groupId,
      fullName,
      birthDate: iso,
      sex: sex || null,
      allergies: allergies.length > 0 ? allergies : null,
      notes: notes.trim() || undefined,
    });
    setSaving(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {/* Header */}
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Nova criança
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {/* Full name */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
          Nome completo *
        </Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Ex: Maria Silva"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Birth date */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
          Data de nascimento *
        </Text>
        <TextInput
          value={birthDate}
          onChangeText={handleBirthDateChange}
          placeholder="DD/MM/AAAA"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={10}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Sex (matches DB CHECK constraint and PWA — M/F) */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>
          Sexo
        </Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: spacing.sm }}>
          Usado para curvas de crescimento OMS. Opcional.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          {SEX_OPTIONS.map(g => {
            const active = sex === g.value;
            return (
              <TouchableOpacity
                key={g.value}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSex(active ? '' : g.value);
                }}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  backgroundColor: active ? `${colors.brand}15` : colors.bgElevated,
                  borderRadius: radius.md,
                  borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                }}
              >
                <Text style={{ fontSize: 22 }}>{g.icon}</Text>
                <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {g.label}
                </Text>
                {active ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Allergies */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
          Alergias
        </Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: spacing.sm }}>
          Separe por vírgula. Ex: amendoim, leite, dipirona
        </Text>
        <TextInput
          value={allergiesText}
          onChangeText={setAllergiesText}
          placeholder="Ex: amendoim, leite"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Notes */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
          Observações
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Condições médicas, preferências, restrições..."
          placeholderTextColor={colors.textMuted}
          multiline
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, minHeight: 100, textAlignVertical: 'top',
            marginBottom: spacing['2xl'],
          }}
        />

        {/* Save button */}
        <PrimaryButton
          label="Adicionar criança"
          onPress={handleSave}
          loading={saving}
          disabled={!fullName.trim() || !birthDate}
          testID="crianca-save-button"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
