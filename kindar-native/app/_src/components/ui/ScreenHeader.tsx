/**
 * Reusable screen header with back button and optional action.
 */

import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, font } from '../../design-system/tokens';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: { icon: string; onPress: () => void };
}

export default function ScreenHeader({ title, showBack = true, rightAction }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{
      paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md,
      paddingHorizontal: spacing.lg, backgroundColor: colors.bgElevated,
      borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    }}>
      {showBack ? (
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
      ) : null}
      <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text, flex: 1 }}>
        {title}
      </Text>
      {rightAction ? (
        <TouchableOpacity onPress={rightAction.onPress} hitSlop={8}>
          <Ionicons name={rightAction.icon as any} size={22} color={colors.brand} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
