import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

/**
 * EmptyState — placeholder educacional + CTA pra estados sem dados.
 *
 * Animação consolidada: entry com FadeIn + ZoomIn no ícone, sequenciados
 * suavemente em 220ms cada. Substitui Lottie (que exigiria EAS rebuild
 * pra adicionar dep nativa) por animação OTA-safe via Reanimated.
 *
 * Sensação premium: o ícone "respira" entrando na tela, em vez de
 * aparecer estático. Subtle mas distintamente premium (Linear/Notion
 * fazem isso em todos os empty states deles).
 */

interface EmptyStateProps {
  /** Ionicons name (e.g. 'folder-open-outline') OR an emoji ('📁'). */
  icon: string;
  title: string;
  /** @deprecated use `description` */
  subtitle?: string;
  description?: string;
  action?: { label: string; onPress: () => void; accessibilityHint?: string };
}

function isIoniconName(s: string): boolean {
  // Ionicons names contain only lowercase letters and dashes; emojis don't.
  return /^[a-z][a-z-]*$/.test(s);
}

export default function EmptyState({ icon, title, subtitle, description, action }: EmptyStateProps) {
  const body = description ?? subtitle;
  const useIonicon = isIoniconName(icon);

  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.xl,
        padding: spacing['3xl'],
        alignItems: 'center',
        ...shadows.sm,
      }}
    >
      <Animated.View
        entering={ZoomIn.duration(360).delay(120)}
        style={{ marginBottom: spacing.md }}
      >
        {useIonicon ? (
          <Ionicons
            name={icon as keyof typeof Ionicons.glyphMap}
            size={40}
            color={colors.textMuted}
          />
        ) : (
          <Text style={{ fontSize: 44 }}>{icon}</Text>
        )}
      </Animated.View>
      <Animated.Text
        entering={FadeIn.duration(280).delay(160)}
        style={{
          fontSize: font.sizes.md,
          fontWeight: font.weights.semibold,
          color: colors.text,
          textAlign: 'center',
        }}
      >
        {title}
      </Animated.Text>
      {body ? (
        <Animated.Text
          entering={FadeIn.duration(280).delay(200)}
          style={{
            fontSize: font.sizes.sm,
            color: colors.textSecondary,
            textAlign: 'center',
            marginTop: spacing.xs,
            lineHeight: 20,
          }}
        >
          {body}
        </Animated.Text>
      ) : null}
      {action ? (
        <Animated.View entering={FadeIn.duration(280).delay(240)}>
          <TouchableOpacity
            onPress={action.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityHint={action.accessibilityHint}
            style={{
              marginTop: spacing.lg,
              backgroundColor: colors.brand,
              paddingHorizontal: spacing.lg,
              paddingVertical: 12,            // 12 + ~18 line-height = ~44pt
              minHeight: 44,
              justifyContent: 'center',
              borderRadius: radius.md,
            }}
          >
            <Text style={{ color: 'white', fontSize: font.sizes.sm, fontWeight: '700' }}>
              {action.label}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
