import { memo } from 'react';
import {
  ActivityIndicator, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, font, radius, shadows, spacing } from 'src/design-system/tokens';
import { useReduceMotion } from '../_lib/useReduceMotion';
import type { InviteRole, Translate } from '../_lib/types';

interface Props {
  email: string;
  role: InviteRole;
  sending: boolean;
  error: string;
  onEmail: (v: string) => void;
  onRole: (v: InviteRole) => void;
  onSend: () => void;
  t: Translate;
}

const ROLE_OPTIONS: { value: InviteRole; key: string; icon: string }[] = [
  { value: 'parent', key: 'roleParent', icon: '👨‍👩‍👧' },
  { value: 'grandparent', key: 'roleGrandparent', icon: '👴' },
  { value: 'caregiver', key: 'roleCaregiver', icon: '🧑‍🍼' },
];

/** Form inline de convite (single-screen no resumo da família). */
function InviteFormImpl({ email, role, sending, error, onEmail, onRole, onSend, t }: Props) {
  const reduceMotion = useReduceMotion();
  const canSend = !sending && email.trim().length > 0;
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(280)} style={{
      backgroundColor: colors.bgElevated, borderRadius: radius.xl,
      padding: spacing.lg, ...shadows.sm,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: `${colors.secondary}15`,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 22 }}>🤝</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
              {t('onboardingForm.inviteCoparentTitle')}
            </Text>
            <View style={{
              backgroundColor: `${colors.brand}15`, paddingHorizontal: spacing.sm,
              paddingVertical: 2, borderRadius: radius.sm,
            }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.semibold }}>
                {t('onboardingForm.recommended')}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
            {t('onboardingForm.inviteCoparentSubtitle')}
          </Text>
        </View>
      </View>

      {error ? (
        <View
          accessibilityRole="alert"
          style={{
            backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md,
            borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)',
            padding: spacing.md, marginBottom: spacing.md,
          }}
        >
          <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
        </View>
      ) : null}

      <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
        {t('onboarding.otherParentEmail')}
      </Text>
      <TextInput
        value={email}
        onChangeText={onEmail}
        placeholder="email@exemplo.com"
        placeholderTextColor={colors.textDim}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        style={{
          backgroundColor: colors.bgSurface, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.borderLight,
          paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
          fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md,
        }}
      />

      <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
        {t('onboarding.role')}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, flexWrap: 'wrap' }}>
        {ROLE_OPTIONS.map((r) => {
          const active = role === r.value;
          return (
            <TouchableOpacity
              key={r.value}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRole(r.value); }}
              accessibilityLabel={t(`onboarding.${r.key}`)}
              accessibilityState={{ selected: active }}
              activeOpacity={0.85}
              style={{
                flex: 1, minWidth: 90,
                backgroundColor: active ? `${colors.brand}10` : colors.bgSurface,
                borderRadius: radius.md,
                borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <Text style={{ fontSize: 16 }}>{r.icon}</Text>
              <Text style={{
                fontSize: font.sizes.xs, color: colors.text,
                fontWeight: active ? font.weights.semibold : font.weights.normal,
              }}>
                {t(`onboarding.${r.key}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        testID="onboarding-invite-send"
        accessibilityLabel={t('onboardingForm.sendInviteNow')}
        accessibilityState={{ busy: sending, disabled: !canSend }}
        onPress={onSend}
        disabled={!canSend}
        activeOpacity={0.85}
        style={{
          backgroundColor: colors.brand, borderRadius: radius.md,
          paddingVertical: spacing.md, alignItems: 'center',
          opacity: canSend ? 1 : 0.5,
        }}
      >
        {sending ? <ActivityIndicator color="#fff" /> : (
          <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
            {t('onboardingForm.sendInviteNow')}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export const InviteForm = memo(InviteFormImpl);
