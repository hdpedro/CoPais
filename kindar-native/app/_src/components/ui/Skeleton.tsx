/**
 * Skeleton — placeholder animado com shimmer pra estados de loading.
 *
 * Substitui o pattern "ActivityIndicator centralizado" (apps de meio-de-caminho)
 * pelo padrão de apps premium (Linear, Notion, Cash, Robinhood): mostrar o
 * **shape do conteúdo** enquanto carrega. Usuário entende imediatamente
 * "isso vai virar uma lista de cards" e percebe o app como mais rápido,
 * mesmo que o tempo de carregamento real seja igual.
 *
 * Decisões consolidadas:
 *  - Animação opacity pulsando 0.4 → 0.8 em loop de 1100ms (não muito rápida
 *    pra não distrair; não muito lenta pra parecer travada).
 *  - Cores do design-system: bgElevated com border subtle.
 *  - Sem shimmer gradient (é mais caro renderizar e não traz valor — pulse
 *    funciona bem e mantém o app 60fps em devices baratos).
 *  - 3 variantes prontas: <SkeletonCard> (linha de lista),
 *    <SkeletonTile> (quadrado pro dashboard) e primitivos <SkeletonLine>
 *    pra montar layouts custom.
 *
 * Uso:
 *   {loading ? (
 *     <View>
 *       <SkeletonCard /><SkeletonCard /><SkeletonCard />
 *     </View>
 *   ) : (
 *     <FlatList data={items} ... />
 *   )}
 */
import { ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors, spacing, radius, shadows } from '../../design-system/tokens';
import { useI18n } from '../../i18n';

interface SkeletonLineProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Bloco primitivo. Use pra montar layouts custom.
 */
export function SkeletonLine({ width = '100%', height = 12, borderRadius = 6, style }: SkeletonLineProps) {
  const opacity = useSharedValue(0.4);
  const t = useI18n((s) => s.t);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.bgSurface,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/**
 * Skeleton de card de lista — equivalente visual a um item com avatar/icon +
 * 2 linhas de texto. Usado em listas de saúde, calendário, despesas, notas.
 */
export function SkeletonCard({ showAvatar = true, lines = 2 }: { showAvatar?: boolean; lines?: 1 | 2 | 3 }) {
  return (
    <Animated.View
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.lg,
        padding: spacing.lg,
        marginBottom: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        ...shadows.sm,
      }}
    >
      {showAvatar ? <SkeletonLine width={36} height={36} borderRadius={18} /> : null}
      <Animated.View style={{ flex: 1, gap: 8 }}>
        <SkeletonLine width="65%" height={14} />
        {lines >= 2 ? <SkeletonLine width="40%" height={11} /> : null}
        {lines === 3 ? <SkeletonLine width="55%" height={11} /> : null}
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Skeleton de chip horizontal — ChildPicker carregando.
 */
export function SkeletonChipRow({ count = 3 }: { count?: number }) {
  return (
    <Animated.View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
      }}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <SkeletonLine key={idx} width={72 + (idx % 2) * 12} height={36} borderRadius={radius.md} />
      ))}
    </Animated.View>
  );
}

/**
 * Skeleton de tile quadrado — usado no dashboard pra grid de módulos.
 */
export function SkeletonTile() {
  return (
    <Animated.View
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.lg,
        padding: spacing.md,
        alignItems: 'center',
        gap: spacing.xs,
        ...shadows.sm,
        flex: 1,
      }}
    >
      <SkeletonLine width={28} height={28} borderRadius={14} />
      <SkeletonLine width={48} height={10} />
    </Animated.View>
  );
}

/**
 * Wrapper conveniente pra renderizar N skeletons em sequência.
 */
export function SkeletonList({ count = 3, variant = 'card', showAvatar = true }: {
  count?: number;
  variant?: 'card' | 'card-no-avatar';
  showAvatar?: boolean;
}) {
  const useAvatar = variant === 'card' && showAvatar;
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <SkeletonCard key={idx} showAvatar={useAvatar} />
      ))}
    </>
  );
}
