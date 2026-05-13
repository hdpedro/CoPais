import { memo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut, Layout } from 'react-native-reanimated';
import { colors, font, radius, shadows, spacing } from 'src/design-system/tokens';
import { ageLabel, avatarEmoji, brFromIso } from '../_lib/format';
import { useReduceMotion } from '../_lib/useReduceMotion';
import type { Translate, WizardChild } from '../_lib/types';

interface Props {
  kid: WizardChild;
  index: number;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  t: Translate;
}

/**
 * Cartão de uma criança no resumo da família.
 *
 * Memoizado pra evitar re-render de TODOS os cards quando outro estado do
 * parent muda (typing no convite, mudança de role etc.). As props são
 * estáveis (id string, handlers via useCallback), então o `memo` é eficaz.
 */
function ChildCardImpl({ kid, index, onEdit, onRemove, t }: Props) {
  const reduceMotion = useReduceMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(320).delay(index * 60)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      layout={reduceMotion ? undefined : Layout.springify()}
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.xl,
        padding: spacing.lg,
        marginBottom: spacing.md,
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        ...shadows.sm,
      }}
    >
      <View style={{
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: colors.brandLight,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 26 }}>{avatarEmoji(kid.sex)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
          {kid.fullName}
        </Text>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
          {ageLabel(kid.birthDate, t)} · {brFromIso(kid.birthDate)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onEdit(kid.id)}
        accessibilityLabel={t('onboardingForm.editChild')}
        hitSlop={8}
        style={{ padding: spacing.xs }}
      >
        <Ionicons name="pencil" size={20} color={colors.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onRemove(kid.id)}
        accessibilityLabel={t('onboardingForm.removeChild')}
        hitSlop={8}
        style={{ padding: spacing.xs }}
      >
        <Ionicons name="trash-outline" size={20} color={colors.error} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export const ChildCard = memo(ChildCardImpl);
