import { memo } from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors, font, radius, spacing } from 'src/design-system/tokens';
import { useReduceMotion } from '../_lib/useReduceMotion';
import type { Translate } from '../_lib/types';

interface Props {
  groupName: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  t: Translate;
}

/** Etapa 1: nome da família. */
function FamilyStepImpl({ groupName, onChange, onContinue, t }: Props) {
  const reduceMotion = useReduceMotion();
  const canContinue = groupName.trim().length > 0;
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(280)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
    >
      <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: spacing.lg }}>🏠</Text>
      <Text style={{
        fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold,
        color: colors.text, textAlign: 'center',
      }}>
        {t('onboarding.welcome')}
      </Text>
      <Text style={{
        fontSize: font.sizes.md, color: colors.textSecondary,
        textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing['3xl'],
        lineHeight: 22,
      }}>
        {t('onboardingForm.setupSubtitle')}
      </Text>

      <Text style={{
        fontSize: font.sizes.sm, fontWeight: font.weights.medium,
        color: colors.text, marginBottom: spacing.xs,
      }}>
        {t('onboardingForm.familyName')}
      </Text>
      <TextInput
        testID="onboarding-group-name"
        accessibilityLabel={t('onboardingForm.familyName')}
        value={groupName}
        onChangeText={onChange}
        placeholder={t('onboardingForm.familyNamePlaceholder')}
        placeholderTextColor={colors.textDim}
        autoFocus
        returnKeyType="next"
        onSubmitEditing={onContinue}
        style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.borderLight,
          padding: spacing.lg, fontSize: font.sizes.md, color: colors.text,
          marginBottom: spacing.xl,
        }}
      />

      <TouchableOpacity
        testID="onboarding-continue"
        accessibilityRole="button"
        accessibilityLabel={t('onboardingForm.continue')}
        accessibilityState={{ disabled: !canContinue }}
        onPress={onContinue}
        disabled={!canContinue}
        activeOpacity={0.85}
        style={{
          backgroundColor: colors.brand, borderRadius: radius.md,
          paddingVertical: spacing.lg, alignItems: 'center',
          opacity: canContinue ? 1 : 0.4,
        }}
      >
        <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
          {t('onboardingForm.continue')}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export const FamilyStep = memo(FamilyStepImpl);
