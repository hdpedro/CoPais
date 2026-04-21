import { View, Text } from 'react-native';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
}

export default function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <View style={{
      backgroundColor: colors.bgElevated, borderRadius: radius.xl,
      padding: spacing['3xl'], alignItems: 'center', ...shadows.sm,
    }}>
      <Text style={{ fontSize: 32, marginBottom: spacing.md }}>{icon}</Text>
      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text, textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
