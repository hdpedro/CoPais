import { View, Text } from 'react-native';
import { useI18n } from '../i18n';
import { spacing, radius, font } from '../design-system/tokens';
import { useCareRoutineToday } from '../hooks/use-care-routine-today';
import type { RoutineHeroEntry, RoutineHeroLeg } from '../lib/care-routine-resolve';

/**
 * Chip "📍 Hoje · quem leva/busca" do painel nativo (paridade com o
 * RoutineTodayCard do PWA). READ-ONLY nesta versão — a edição e a "Trocar hoje"
 * vivem no editor (PWA). Renderiza só quando há rotina hoje; some em erro
 * (não bloqueia o painel). Precisa de EAS build pra validação de runtime.
 */

const MUTED = '#7A8C8B';
const TEXT = '#2C2C2C';
const SOFT = '#3A3A3A';

function formatNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export default function RoutineTodayCard() {
  const { t } = useI18n();
  const payload = useCareRoutineToday();
  if (!payload || payload.today.mode === 'none') return null;
  const { today } = payload;

  const legText = (leg: RoutineHeroLeg, kind: 'dropoff' | 'pickup', kids: string): string => {
    const name = leg.responsibleName;
    if (kind === 'dropoff') {
      return leg.label
        ? t('careRoutine.heroDropoffTo', { name, kids, label: leg.label })
        : t('careRoutine.heroDropoff', { name, kids });
    }
    return leg.time
      ? t('careRoutine.heroPickupAt', { name, kids, time: leg.time.slice(0, 5) })
      : t('careRoutine.heroPickup', { name, kids });
  };

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: radius.xl,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: '#F0F0F0',
      }}
    >
      <Text
        style={{
          fontSize: 12,
          color: MUTED,
          fontWeight: font.weights.semibold,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          marginBottom: spacing.sm,
        }}
      >
        📍 {t('careRoutine.todayHeading')}
      </Text>

      <View style={{ gap: 8 }}>
        {today.entries.map((entry: RoutineHeroEntry, i: number) => {
          const kids = formatNames(entry.childNames);
          if (entry.sameAllDay && entry.dropoff) {
            return (
              <Text key={i} style={{ fontSize: 13, color: entry.dropoff.isMe ? TEXT : SOFT }}>
                🤝 {t('careRoutine.heroFullDay', { name: entry.dropoff.responsibleName, kids })}
              </Text>
            );
          }
          return (
            <View key={i} style={{ gap: 4 }}>
              {entry.dropoff ? (
                <Text
                  style={{
                    fontSize: 13,
                    color: entry.dropoff.isMe ? TEXT : SOFT,
                    fontWeight: entry.dropoff.isMe ? font.weights.semibold : '400',
                  }}
                >
                  🚗 {legText(entry.dropoff, 'dropoff', kids)}
                </Text>
              ) : null}
              {entry.pickup ? (
                <Text
                  style={{
                    fontSize: 13,
                    color: entry.pickup.isMe ? TEXT : SOFT,
                    fontWeight: entry.pickup.isMe ? font.weights.semibold : '400',
                  }}
                >
                  🏠 {legText(entry.pickup, 'pickup', kids)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
