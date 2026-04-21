/**
 * Floating Action Button.
 */

import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../design-system/tokens';

interface FABProps {
  onPress: () => void;
  icon?: string;
}

export default function FAB({ onPress, icon = 'add' }: FABProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        position: 'absolute', bottom: 100, right: 20,
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: colors.brand,
        alignItems: 'center', justifyContent: 'center',
        ...shadows.lg,
      }}
    >
      <Ionicons name={icon as any} size={26} color="#fff" />
    </TouchableOpacity>
  );
}
