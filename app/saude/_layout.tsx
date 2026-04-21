import { Stack } from 'expo-router';
import { colors } from '../../src/design-system/tokens';

export default function SaudeLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.bg },
      animation: 'slide_from_right',
    }} />
  );
}
