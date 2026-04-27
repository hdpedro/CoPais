import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

interface EmptyStateProps {
  /** Ionicons name (e.g. 'folder-open-outline') OR an emoji ('📁'). */
  icon: string;
  title: string;
  /** @deprecated use `description` */
  subtitle?: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}

function isIoniconName(s: string): boolean {
  // Ionicons names contain only lowercase letters and dashes; emojis don't.
  return /^[a-z][a-z-]*$/.test(s);
}

export default function EmptyState({ icon, title, subtitle, description, action }: EmptyStateProps) {
  const body = description ?? subtitle;
  const useIonicon = isIoniconName(icon);

  return (
    <View
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.xl,
        padding: spacing['3xl'],
        alignItems: 'center',
        ...shadows.sm,
      }}
    >
      {useIonicon ? (
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={32}
          color={colors.textMuted}
          style={{ marginBottom: spacing.md }}
        />
      ) : (
        <Text style={{ fontSize: 32, marginBottom: spacing.md }}>{icon}</Text>
      )}
      <Text
        style={{
          fontSize: font.sizes.md,
          fontWeight: font.weights.medium,
          color: colors.text,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={{
            fontSize: font.sizes.sm,
            color: colors.textSecondary,
            textAlign: 'center',
            marginTop: spacing.xs,
            lineHeight: 20,
          }}
        >
          {body}
        </Text>
      ) : null}
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.7}
          style={{
            marginTop: spacing.lg,
            backgroundColor: colors.brand,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
          }}
        >
          <Text style={{ color: 'white', fontSize: font.sizes.sm, fontWeight: '700' }}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
