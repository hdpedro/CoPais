import { memo } from 'react';
import { View } from 'react-native';
import { colors, spacing } from 'src/design-system/tokens';
import type { Translate } from '../_lib/types';

interface Props {
  activeIndex: number;
  totalSteps: number;
  t: Translate;
}

/** Indicador de progresso (3 dots: Família · Crianças · Convite). */
function ProgressDotsImpl({ activeIndex, totalSteps, t }: Props) {
  return (
    <View
      style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: spacing['2xl'] }}
      accessibilityRole="progressbar"
      accessibilityLabel={t('onboardingForm.stepIndicator', { current: activeIndex + 1, total: totalSteps })}
    >
      {Array.from({ length: totalSteps }).map((_, i) => {
        const active = i === activeIndex;
        const done = i < activeIndex;
        return (
          <View
            key={i}
            style={{
              width: active ? 32 : 24,
              height: 4,
              borderRadius: 2,
              backgroundColor: active || done ? colors.brand : colors.borderLight,
            }}
          />
        );
      })}
    </View>
  );
}

export const ProgressDots = memo(ProgressDotsImpl);
