/**
 * AIFab — botão flutuante global para abrir o Kindar AI.
 *
 * Aparece em quase toda tela (oculto em /auth, /onboarding e quando o modal
 * já está aberto). Posicionado acima da tab-bar.
 *
 * Equivalente nativo do PWA — `<button class="fixed bottom-8 right-8...">`
 * em src/components/AIAssistant.tsx.
 */

import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAIModal } from '../../store/ai-modal';
import { colors, shadows } from '../../design-system/tokens';

// Routes where the FAB should NOT appear.
const HIDE_PATTERNS = [
  /^\/auth(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/login$/,
  /^\/signup$/,
  /^\/forgot-password$/,
  /^\/convite(\/|$)/,
  /^\/ai$/,         // legacy AI screen — modal opens itself
  /^\/pricing$/,    // already a modal presentation
];

export default function AIFab() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isOpen = useAIModal((s) => s.isOpen);
  const open = useAIModal((s) => s.open);

  // Hide while modal is open (so the close button is the only exit) or when on
  // a screen where a floating button would be intrusive.
  if (isOpen) return null;
  if (HIDE_PATTERNS.some((re) => re.test(pathname || ''))) return null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    open();
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 16,
        bottom: insets.bottom + 80, // above bottom-nav
        zIndex: 100,
      }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        accessibilityLabel="Abrir assistente Kindar"
        accessibilityRole="button"
        testID="ai-fab-open"
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
          ...shadows.lg,
        }}
      >
        <Ionicons name="sparkles" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
