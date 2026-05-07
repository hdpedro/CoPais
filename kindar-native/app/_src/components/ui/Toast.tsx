/**
 * Toast — micro-feedback nao bloqueante.
 *
 * Aparece, vibra e some sozinho em ~2.2s. Usa Reanimated pra entrar/sair
 * suavemente. Nao bloqueia toque (pointer-events: none).
 *
 * Uso:
 *   const [toast, setToast] = useState<{msg: string; variant?: 'success'|'error'} | null>(null);
 *   ...
 *   <Toast value={toast} onClear={() => setToast(null)} />
 *
 * Setar `value` mostra; quando o auto-dismiss roda, chama onClear.
 */
import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

interface ToastValue {
  msg: string;
  variant?: 'success' | 'error';
}

interface Props {
  value: ToastValue | null;
  onClear: () => void;
  /** Override duracao default 2200ms */
  durationMs?: number;
}

export default function Toast({ value, onClear, durationMs = 2200 }: Props) {
  useEffect(() => {
    if (!value) return;
    const t = setTimeout(onClear, durationMs);
    return () => clearTimeout(t);
  }, [value, durationMs, onClear]);

  if (!value) return null;

  const isError = value.variant === 'error';
  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(180).withInitialValues({ transform: [{ translateY: 20 }] })}
      exiting={FadeOut.duration(220)}
      style={[styles.container, { backgroundColor: isError ? '#FEE2E2' : colors.bgElevated, borderColor: isError ? '#FECACA' : colors.border }]}
    >
      <Animated.View entering={ZoomIn.duration(220)}>
        <Ionicons
          name={isError ? 'alert-circle' : 'checkmark-circle'}
          size={20}
          color={isError ? '#DC2626' : colors.brand}
        />
      </Animated.View>
      <Text style={[styles.text, { color: isError ? '#991B1B' : colors.text }]} numberOfLines={2}>
        {value.msg}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 32,
    left: spacing.lg,
    right: spacing.lg,
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
