/**
 * /perfil/seguranca — toggle Face ID/Touch ID + timeout picker.
 *
 * Validacoes:
 * - Antes de ligar o lock, verifica hasHardware + isEnrolled.
 *   Se faltar enrollment, abre Alert orientando o user a cadastrar
 *   biometria nos Ajustes (deep link nao e possivel pra App > Face ID
 *   no iOS, entao so explicamos onde clicar).
 * - Antes de ligar OU desligar, exige autenticacao biometrica
 *   (padrao bancario — pra evitar que alguem com o app aberto desabilite
 *   a protecao sem ser o dono).
 *
 * UX:
 * - Switch grande com label "Bloqueio com Face ID"/"Touch ID" dinamico.
 * - Quando enabled, mostra grupo de radio com opcoes de timeout.
 * - Quando disabled, esconde o radio (so reaparece se voltar a ligar).
 */

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, TouchableOpacity, Alert, ActivityIndicator, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import { useLock, LOCK_TIMEOUT_KEYS, type LockTimeout } from 'src/store/lock';
import { authenticate, getBiometricCapability, type BiometricCapability } from 'src/services/biometric-lock';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const TIMEOUT_OPTIONS: { value: LockTimeout; descKey: string }[] = [
  { value: 'immediate', descKey: 'timeoutImmediateDesc' },
  { value: '1m', descKey: 'timeout1mDesc' },
  { value: '15m', descKey: 'timeout15mDesc' },
  { value: '1h', descKey: 'timeout1hDesc' },
];

export default function SegurancaScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { enabled, timeout, hydrated, hydrate, setEnabled, setTimeout: setLockTimeout } = useLock();
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hydrated) hydrate();
    getBiometricCapability().then(setCapability).catch(() => {});
  }, [hydrated, hydrate]);

  const labelKind = capability?.label || t('security.biometrics');
  const supported = !!capability && capability.hasHardware;

  async function openIosSettings() {
    if (Platform.OS === 'ios') {
      try { await Linking.openURL('app-settings:'); } catch {}
    }
  }

  async function handleToggle(next: boolean) {
    if (busy) return;
    if (!capability) return;

    if (next) {
      // Liga o lock — primeiro checa hardware + enrollment
      if (!capability.hasHardware) {
        toast.show({ message: t('toasts.common.fallbackError'), variant: 'info' });
        return;
      }
      if (!capability.isEnrolled) {
        Alert.alert(
          t('security.enrollFirstTitle', { kind: labelKind }),
          t('security.enrollFirstMessage', { kind: labelKind }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('security.openSettings'), onPress: openIosSettings },
          ]
        );
        return;
      }
      // Exige biometria pra ligar (confirma identidade do dono).
      setBusy(true);
      const r = await authenticate(t('security.confirmEnable', { kind: labelKind }));
      setBusy(false);
      if (!r.success) {
        if (r.error && r.error !== 'user_cancel' && r.error !== 'cancel') {
          toast.show({ message: t('toasts.common.tryAgain'), variant: 'error' });
        }
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await setEnabled(true);
    } else {
      // Desliga o lock — tambem exige biometria (impede desativacao por terceiros).
      setBusy(true);
      const r = await authenticate(t('security.confirmDisable', { kind: labelKind }));
      setBusy(false);
      if (!r.success) {
        if (r.error && r.error !== 'user_cancel' && r.error !== 'cancel') {
          toast.show({ message: t('toasts.common.tryAgain'), variant: 'error' });
        }
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      await setEnabled(false);
    }
  }

  async function handleTimeoutChange(value: LockTimeout) {
    if (value === timeout) return;
    Haptics.selectionAsync().catch(() => {});
    await setLockTimeout(value);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('profile.security')} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        {/* Hero */}
        <View style={{ alignItems: 'center', marginBottom: spacing['2xl'] }}>
          <View style={{
            width: 64, height: 64, borderRadius: 20,
            backgroundColor: colors.brandLight,
            borderWidth: 1, borderColor: colors.border,
            alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
          }}>
            <Ionicons
              name={capability?.kind === 'faceId' ? 'scan-circle-outline' : 'finger-print-outline'}
              size={32}
              color={colors.brand}
            />
          </View>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text }}>
            {t('security.heroTitle', { kind: labelKind })}
          </Text>
          <Text style={{
            fontSize: font.sizes.sm, color: colors.textSecondary,
            textAlign: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.lg,
          }}>
            {t('security.heroSubtitle')}
          </Text>
        </View>

        {/* Toggle principal */}
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.xl,
          padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                {t('security.enable', { kind: labelKind })}
              </Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                {supported
                  ? capability?.isEnrolled
                    ? t('security.statusReady')
                    : t('security.statusNotEnrolled', { kind: labelKind })
                  : t('security.statusUnsupported')}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Switch
                testID="seguranca-toggle"
                value={enabled}
                onValueChange={handleToggle}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor="#fff"
                ios_backgroundColor={colors.border}
                disabled={!supported}
              />
            )}
          </View>
        </View>

        {/* Timeout picker — so aparece quando enabled */}
        {enabled ? (
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl,
            marginBottom: spacing.lg, ...shadows.sm, overflow: 'hidden',
          }}>
            <View style={{ padding: spacing.xl, paddingBottom: spacing.sm }}>
              <Text style={{
                fontSize: font.sizes.xs, fontWeight: font.weights.semibold,
                color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1,
              }}>
                {t('security.timeoutSectionTitle')}
              </Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 }}>
                {t('security.timeoutSectionHint')}
              </Text>
            </View>
            {TIMEOUT_OPTIONS.map((opt, idx) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => handleTimeoutChange(opt.value)}
                testID={`seguranca-timeout-${opt.value}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: timeout === opt.value }}
                accessibilityLabel={`${t(LOCK_TIMEOUT_KEYS[opt.value])}. ${t('security.' + opt.descKey)}`}
                style={{
                  paddingHorizontal: spacing.xl,
                  paddingVertical: spacing.md,
                  borderTopWidth: idx === 0 ? 0 : 0.5,
                  borderTopColor: colors.borderLight,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  borderWidth: 2,
                  borderColor: timeout === opt.value ? colors.brand : colors.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {timeout === opt.value ? (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand }} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: font.sizes.md,
                    fontWeight: timeout === opt.value ? font.weights.semibold : font.weights.medium,
                    color: colors.text,
                  }}>
                    {t(LOCK_TIMEOUT_KEYS[opt.value])}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                    {t('security.' + opt.descKey)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* Info */}
        <View style={{
          backgroundColor: colors.brandLight,
          borderRadius: radius.xl, padding: spacing.lg,
          flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
        }}>
          <Ionicons name="information-circle-outline" size={18} color={colors.brand} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: font.sizes.xs, color: colors.text, lineHeight: 18 }}>
            {t('security.privacyNote', { kind: labelKind })}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
