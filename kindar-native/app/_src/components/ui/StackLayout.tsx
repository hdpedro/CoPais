/**
 * Reusable Stack layout for module routes.
 */

import { Stack } from 'expo-router';
import { colors } from '../../design-system/tokens';

export default function StackLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.bg },
      animation: 'slide_from_right',
    }} />
  );
}
