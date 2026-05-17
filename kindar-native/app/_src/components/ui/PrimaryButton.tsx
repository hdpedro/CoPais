/**
 * PrimaryButton — Botão de ação primária com loading state, haptic e a11y.
 *
 * Substitui o pattern duplicado em todas as telas:
 *   <TouchableOpacity disabled={saving} onPress={save} style={...}>
 *     {saving ? <ActivityIndicator color="#fff" /> : <Text>Salvar</Text>}
 *   </TouchableOpacity>
 *
 * Padroniza:
 *  - Loading state: ActivityIndicator branco quando `loading` (substitui texto)
 *  - Disabled: opacity 0.5 + bloqueia onPress
 *  - Haptic Light no press (configurável)
 *  - Min height 44pt (iOS HIG)
 *  - accessibilityRole="button" + state.disabled / state.busy
 *  - Variant: primary (brand) | destructive (error) | secondary (outline)
 *
 * Usa testID compulsório quando passado pra facilitar testes E2E.
 */
import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'destructive' | 'secondary';
  /** Override default Light haptic. `false` desabilita totalmente. */
  haptic?: Haptics.ImpactFeedbackStyle | false;
  fullWidth?: boolean;
  style?: ViewStyle;
  labelStyle?: TextStyle;
  testID?: string;
  accessibilityHint?: string;
}

const VARIANT_BG: Record<NonNullable<PrimaryButtonProps['variant']>, string> = {
  primary: colors.brand,
  destructive: colors.error,
  secondary: 'transparent',
};

const VARIANT_BORDER: Record<NonNullable<PrimaryButtonProps['variant']>, string> = {
  primary: colors.brand,
  destructive: colors.error,
  secondary: colors.borderLight,
};

const VARIANT_FG: Record<NonNullable<PrimaryButtonProps['variant']>, string> = {
  primary: '#fff',
  destructive: '#fff',
  secondary: colors.text,
};

export default function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  haptic = Haptics.ImpactFeedbackStyle.Light,
  fullWidth = true,
  style,
  labelStyle,
  testID,
  accessibilityHint,
}: PrimaryButtonProps) {
  const isBlocked = loading || disabled;

  function handlePress() {
    if (isBlocked) return;
    if (haptic !== false) Haptics.impactAsync(haptic);
    onPress();
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={isBlocked}
      activeOpacity={0.85}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      style={[
        {
          backgroundColor: VARIANT_BG[variant],
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: VARIANT_BORDER[variant],
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isBlocked ? 0.5 : 1,
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={VARIANT_FG[variant]} />
      ) : (
        <Text
          style={[
            {
              color: VARIANT_FG[variant],
              fontSize: font.sizes.md,
              fontWeight: font.weights.semibold,
            },
            labelStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
