/**
 * Nova Doença — registrar episódio de doença.
 * Mirrors PWA /saude/doencas/nova.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { createIllness } from 'src/services/health';
import { fetchChildren, type Child } from 'src/services/children';
import ChildPicker from 'src/components/ui/ChildPicker';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
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
const SEVERITIES: { value: Severity; labelKey: string; color: string; icon: string }[] = [
  { value: 'leve', labelKey: 'health.illnessForm.severity_leve', color: '#4CAF50', icon: '🟢' },
  { value: 'moderado', labelKey: 'health.illnessForm.severity_moderado', color: '#E8A228', icon: '🟡' },
  { value: 'grave', labelKey: 'health.illnessForm.severity_grave', color: '#E53935', icon: '🔴' },
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
  const t = useI18n(s => s.t);
  const toast = useToast();
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
  const [titleError, setTitleError] = useState<string | null>(null);

  // onBlur validation — feedback inline antes do submit (padrão premium).
  function validateTitleField(value: string): string | null {
    if (!value.trim()) return t('validation.field.titleRequired');
    return null;
  }

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
    if (!childId) { setError(t('illnessNew.errorSelectChild')); return; }
    if (!title.trim()) { setError(t('illnessNew.errorTitleRequired')); return; }
    const iso = parseDate(startDate);
    if (!iso) { setError(t('validation.field.birthDateInvalid')); return; }

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
      toast.show({ message: detail || t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          {t('illnessNew.headerTitle')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {/* Child */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>{t('health.illnessForm.childRequired')}</Text>
        <ChildPicker
          items={children}
          selectedId={childId}
          onSelect={(id) => setChildId(id ?? '')}
          hideWhenSingle={false}
          containerStyle={{ marginBottom: spacing.lg }}
          testID="doenca-nova-child-picker"
        />

        {/* Title */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('illnessNew.titleLabel')}</Text>
        <TextInput
          accessibilityLabel={titleError ?? t('illnessNew.titleA11y')}
          value={title}
          onChangeText={(v) => { setTitle(v); if (titleError) setTitleError(null); }}
          onBlur={() => setTitleError(validateTitleField(title))}
          placeholder={t('illnessNew.titlePlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md,
            borderWidth: 1, borderColor: titleError ? colors.error : colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text,
            marginBottom: titleError ? spacing.xs : spacing.lg,
          }}
        />
        {titleError ? (
          <Text style={{ color: colors.error, fontSize: font.sizes.xs, marginTop: 2, marginBottom: spacing.lg }}>
            {titleError}
          </Text>
        ) : null}

        {/* Start date */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('illnessNew.startLabel')}</Text>
        <TextInput
          value={startDate} onChangeText={handleDateChange}
          placeholder={t('illnessNew.datePlaceholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad" maxLength={10}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Severity */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>{t('health.illnessForm.severityLabel')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          {SEVERITIES.map(s => {
            const active = severity === s.value;
            return (
              <TouchableOpacity
                key={s.value}
                onPress={() => setSeverity(s.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t('healthRegister.severityA11y', { level: t(s.labelKey) })}
                style={{
                  flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                  backgroundColor: active ? `${s.color}20` : colors.bgElevated,
                  borderWidth: 1, borderColor: active ? s.color : colors.borderLight,
                  alignItems: 'center', gap: 4,
                }}
              >
                <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                <Text style={{ fontSize: font.sizes.sm, color: active ? s.color : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {t(s.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Symptoms */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('health.illnessForm.symptoms')}</Text>
        <TextInput
          value={symptoms} onChangeText={setSymptoms}
          placeholder={t('illnessNew.symptomsPlaceholder')}
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
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('illnessNew.hospitalLabel')}</Text>
        <TextInput
          value={hospital} onChangeText={setHospital}
          placeholder={t('illnessNew.hospitalPlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Notes */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('health.illnessForm.observations')}</Text>
        <TextInput
          value={notes} onChangeText={setNotes}
          placeholder={t('illnessNew.notesPlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
            marginBottom: spacing['2xl'],
          }}
        />

        <PrimaryButton
          label={t('illnessNew.submit')}
          onPress={handleSave}
          loading={saving}
          disabled={!title.trim() || !childId}
          testID="doenca-save-button"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
