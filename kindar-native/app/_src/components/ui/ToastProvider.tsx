/**
 * ToastProvider — Toast global imperativo via context.
 *
 * Substitui o pattern "cada tela mantém seu próprio `useState<ToastValue>`":
 *
 *   import { useToast } from 'src/components/ui/ToastProvider';
 *   const { show } = useToast();
 *   show({ message: 'Alergia adicionada', variant: 'success' });
 *
 * Decisões consolidadas:
 *  - Fila de até 3 toasts (novos não destroem antigos; antigos saem por TTL).
 *  - Variants: success | error | info | warning.
 *  - TTL default 2200ms (alinhado ao Toast local existente).
 *  - Toast aparece no bottom + safe-area (não obstrui ações principais).
 *  - Sucesso → haptic notification Success; erro → Warning.
 *  - Não-bloqueante (pointer-events: none no container).
 *  - Acessibilidade: cada toast tem `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"`.
 *
 * Pattern de uso:
 *  - ✅ Sucesso silencioso (após save): show({ message, variant: 'success' })
 *  - ⚠️ Erro recuperável (rede caiu): show({ message, variant: 'error' })
 *  - 🚨 Destrutivo (apagar registro): use Alert.alert via SwipeToDelete.
 *  - ❌ Erro de servidor com retry: use banner inline na própria tela.
 *
 * Wrap em `_layout.tsx` raiz pra ficar acima das telas + below dos Modals.
 */
import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastInput {
  message: string;
  variant?: ToastVariant;
  /** Override default TTL (2200ms). */
  durationMs?: number;
}

interface ToastInstance extends ToastInput {
  id: number;
}

interface ToastContextValue {
  show: (input: ToastInput) => void;
  /** Dismiss all visible toasts (raro — útil em error boundary). */
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Não jogar — em testes ou ambientes sem provider, vira no-op.
    if (__DEV__) console.warn('[useToast] No ToastProvider mounted — toast suppressed');
    return { show: () => {}, clear: () => {} };
  }
  return ctx;
}

const MAX_VISIBLE = 3;
const DEFAULT_TTL = 2200;

const VARIANT_META: Record<
  ToastVariant,
  { icon: keyof typeof Ionicons.glyphMap; iconColor: string; bg: string; border: string; text: string }
> = {
  success: { icon: 'checkmark-circle', iconColor: colors.brand, bg: colors.bgElevated, border: colors.border, text: colors.text },
  error: { icon: 'alert-circle', iconColor: '#DC2626', bg: '#FEE2E2', border: '#FECACA', text: '#991B1B' },
  info: { icon: 'information-circle', iconColor: colors.brand, bg: colors.bgElevated, border: colors.border, text: colors.text },
  warning: { icon: 'warning', iconColor: '#D97706', bg: '#FEF3C7', border: '#FDE68A', text: '#92400E' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastInstance[]>([]);
  const idRef = useRef(0);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const id = ++idRef.current;
    const ttl = input.durationMs ?? DEFAULT_TTL;
    setItems(prev => {
      const next = [...prev, { ...input, id }];
      // Cap em MAX_VISIBLE — descarta os mais antigos.
      return next.slice(-MAX_VISIBLE);
    });

    // Haptic feedback aligned com a variant.
    if (input.variant === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (input.variant === 'success' || !input.variant) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const clear = useCallback(() => setItems([]), []);

  return (
    <ToastContext.Provider value={{ show, clear }}>
      {children}
      <View
        pointerEvents="box-none"
        style={[styles.layer, { bottom: insets.bottom + spacing.lg }]}
      >
        {items.map((toast, idx) => {
          const meta = VARIANT_META[toast.variant ?? 'success'];
          return (
            <Animated.View
              key={toast.id}
              entering={SlideInDown.duration(220)}
              exiting={FadeOut.duration(180)}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[
                styles.toast,
                {
                  backgroundColor: meta.bg,
                  borderColor: meta.border,
                  // Stack vertical com gap entre toasts.
                  marginTop: idx === 0 ? 0 : spacing.xs,
                },
              ]}
            >
              <Animated.View entering={FadeIn.duration(220)}>
                <Ionicons name={meta.icon} size={20} color={meta.iconColor} />
              </Animated.View>
              <Text style={[styles.text, { color: meta.text }]} numberOfLines={2}>
                {toast.message}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    ...shadows.lg,
  },
  text: {
    flex: 1,
    fontSize: font.sizes.sm,
    fontWeight: font.weights.semibold,
  },
});
