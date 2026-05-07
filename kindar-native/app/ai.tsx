/**
 * /ai deep-link shim.
 *
 * The Kindar AI assistant is now a global floating modal (`AIAssistantSheet`)
 * controlled by `useAIModal`, mirroring the PWA's portal-based bubble.
 *
 * To preserve backward compatibility with existing `/ai` deep-links, push
 * notifications, and external links into the app, this route just opens the
 * modal and bounces back to wherever the user was — keeping the
 * "AI is everywhere" UX from the PWA.
 */

import { useEffect } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useAIModal } from 'src/store/ai-modal';
import { colors } from 'src/design-system/tokens';

export default function AIAssistantScreen() {
  const open = useAIModal((s) => s.open);

  useEffect(() => {
    open();
    // If we arrived as a stand-alone modal screen, dismiss it so the FAB-modal
    // takes over. router.canGoBack() is false on a cold deep-link launch — in
    // that case redirect to the home tab.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [open]);

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
