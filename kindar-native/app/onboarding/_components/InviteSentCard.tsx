import { memo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, font, radius, shadows, spacing } from 'src/design-system/tokens';
import { useReduceMotion } from '../_lib/useReduceMotion';
import type { Translate } from '../_lib/types';

interface Props {
  email: string;
  onShare: () => void;
  onAnother: () => void;
  t: Translate;
}

/**
 * Tela de sucesso pós-convite. O sheet de share do sistema já oferece
 * "Copiar / WhatsApp / SMS / e-mail" — não duplicamos com botão Copy.
 */
function InviteSentCardImpl({ email, onShare, onAnother, t }: Props) {
  const reduceMotion = useReduceMotion();
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(280)} style={{
      backgroundColor: colors.bgElevated, borderRadius: radius.xl,
      padding: spacing.lg, ...shadows.sm, alignItems: 'center',
    }}>
      <View style={{
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: `${colors.success}15`,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: spacing.md,
      }}>
        <Text style={{ fontSize: 28 }}>📨</Text>
      </View>
      <Text style={{
        fontSize: font.sizes.lg, fontWeight: font.weights.bold,
        color: colors.text, marginBottom: spacing.xs, textAlign: 'center',
      }}>
        {t('onboardingForm.inviteLinkReady')}
      </Text>
      <Text style={{
        fontSize: font.sizes.sm, color: colors.textSecondary,
        textAlign: 'center', marginBottom: spacing.lg, lineHeight: 20,
      }}>
        {t('onboardingForm.inviteLinkHelp', { email })}
      </Text>

      <TouchableOpacity
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel={t('onboardingForm.shareInviteLink')}
        activeOpacity={0.85}
        style={{
          alignSelf: 'stretch',
          backgroundColor: colors.brand, borderRadius: radius.md,
          paddingVertical: spacing.md,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        <Ionicons name="share-outline" size={18} color="#fff" />
        <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
          {t('onboardingForm.shareInviteLink')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onAnother}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('onboardingForm.sendAnotherInvite')}
        style={{ paddingVertical: spacing.sm }}
      >
        <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>
          {t('onboardingForm.sendAnotherInvite')}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export const InviteSentCard = memo(InviteSentCardImpl);
