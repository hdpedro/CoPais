import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/auth';
import { markQuestStep } from '../../src/services/quest';
import { useI18n } from '../../src/i18n';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

function isoFromBR(value: string): string | null {
  // DD/MM/AAAA → YYYY-MM-DD with validation. Returns null on parse failure.
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(+y, +mo - 1, +d);
  if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return null;
  if (dt > new Date()) return null;
  return `${y}-${mo}-${d}`;
}

export default function OnboardingScreen() {
  const { userId } = useAuth();
  const [step, setStep] = useState<'checking' | 1 | 2>('checking');
  const [groupName, setGroupName] = useState('');
  const [childName, setChildName] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const t = useI18n(s => s.t);

  // Mirror PWA `OnboardingPage`: before showing the form, try to auto-accept
  // any pending invitation for this user's email. If one is accepted, the
  // user has a group already and lands on the dashboard.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setStep(1);
          return;
        }
        const resp = await fetch(`${WEB_URL}/api/onboarding/auto-accept-invitation`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.accepted) {
            if (!cancelled) {
              await useAuth.getState().loadActiveGroup();
              router.replace('/(tabs)');
              return;
            }
          }
        }
      } catch {
        // Non-fatal — fall through to manual onboarding
      }
      if (!cancelled) setStep(1);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  function handleBirthDateChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    setChildBirthDate(formatted);
  }

  async function handleFinish() {
    // Mirror PWA `OnboardingForm.tsx`: groupName + childName + childBirthDate
    // are all required. The previous native flow allowed skipping the child
    // fields, drifting from PWA behaviour and creating empty groups that
    // confused several downstream features.
    if (!userId || !groupName.trim() || !childName.trim() || !childBirthDate.trim()) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      // Use the server endpoint for parity with PWA (`OnboardingForm` POSTs
      // to `/api/create-group`). Server validates/persists onboarding_step,
      // invalidates caches, and runs business logic in a single place.
      const childIsoBd = isoFromBR(childBirthDate);
      if (!childIsoBd) {
        Alert.alert(t('common.error'), 'Data de nascimento inválida (DD/MM/AAAA).');
        setSaving(false);
        return;
      }
      const resp = await fetch(`${WEB_URL}/api/create-group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: groupName.trim(),
          childName: childName.trim(),
          childBirthDate: childIsoBd,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${resp.status}`);
      }

      // Mirror PWA quest tracking: src/actions/group.ts:48,120
      markQuestStep('add_child', { via: childName.trim() ? 'addChild' : 'createGroup' });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await useAuth.getState().loadActiveGroup();
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert(t('common.error'), err.message || 'Não foi possível criar o grupo');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setSaving(false);
  }

  if (step === 'checking') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand} />
        <Text style={{ marginTop: spacing.md, fontSize: font.sizes.sm, color: colors.textSecondary }}>
          Verificando convites pendentes…
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing['3xl'] }}>
        {step === 1 ? (
          <>
            <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: spacing.xl }}>🏠</Text>
            <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text, textAlign: 'center' }}>
              {t('onboarding.welcome')}
            </Text>
            <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing['3xl'] }}>
              Vamos configurar seu grupo familiar
            </Text>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
              {t('onboardingForm.familyName')}
            </Text>
            <TextInput
              testID="onboarding-group-name"
              accessibilityLabel="Nome do grupo"
              value={groupName} onChangeText={setGroupName} placeholder={t('onboardingForm.familyNamePlaceholder')} placeholderTextColor={colors.textDim}
              style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.xl }} />
            <TouchableOpacity
              testID="onboarding-continue"
              accessibilityLabel="Continuar"
              onPress={() => { if (groupName.trim()) setStep(2); }} disabled={!groupName.trim()}
              style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', opacity: groupName.trim() ? 1 : 0.4 }}>
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>Continuar</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: spacing.xl }}>👶</Text>
            <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text, textAlign: 'center' }}>
              Adicione uma criança
            </Text>
            <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing['3xl'] }}>
              Vamos começar com a primeira
            </Text>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
              {t('onboardingForm.childFullName')}
            </Text>
            <TextInput
              testID="onboarding-child-name"
              accessibilityLabel="Nome completo da criança"
              value={childName} onChangeText={setChildName} placeholder={t('onboardingForm.childNamePlaceholder')} placeholderTextColor={colors.textDim}
              style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
              {t('onboardingForm.birthDate')}
            </Text>
            <TextInput
              testID="onboarding-child-birthdate"
              accessibilityLabel="Data de nascimento"
              value={childBirthDate}
              onChangeText={handleBirthDateChange}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              maxLength={10}
              style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.xl }}
            />
            <TouchableOpacity
              testID="onboarding-finish"
              accessibilityLabel="Finalizar"
              onPress={handleFinish}
              disabled={saving || !childName.trim() || !childBirthDate.trim()}
              style={{
                backgroundColor: colors.brand, borderRadius: radius.md,
                paddingVertical: spacing.lg, alignItems: 'center',
                opacity: saving || !childName.trim() || !childBirthDate.trim() ? 0.5 : 1,
              }}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>Finalizar</Text>}
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl, opacity: 0.7 }}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, flex: 1 }}>
                Você pode adicionar mais crianças depois pela aba Crianças.
              </Text>
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
