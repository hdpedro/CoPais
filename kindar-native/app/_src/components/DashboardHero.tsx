/**
 * DashboardHero — herói universal do painel nativo (paridade com o
 * RoutineTodayCard do PWA pós-cutover). UM card escuro premium que serve as 3
 * formas de família:
 *   - GUARDA (pais separados): voz com perspectiva + badge "Guarda ativa" +
 *     ritmo da semana colorido + "Próxima troca / Você pega".
 *   - DIA EM FAMÍLIA (together/single sem rotina): voz de presença
 *     "{filhos} com vocês/você hoje" + Arco do Dia (com evento → estações;
 *     dia vazio → só o sol).
 *   - ROTINA (leva/busca): voz "{quem} leva · {quem} busca" + arco.
 * Todos compõem o DayArc.
 *
 * PORTE NATIVO (Regra 19): lógica/voz idênticas ao PWA; apresentação RN. O
 * gradiente do card vira cor sólida (#272019 ≈ ponto médio do gradiente do PWA).
 *
 * ⚠️ PROPS-DRIVEN: alimentado pelo useDashboard (ver wiring spec). PRECISA DE
 * EAS BUILD + VALIDAÇÃO EM DEVICE. Chaves i18n de guarda/arco PENDENTES (serão
 * adicionadas ao catálogo nativo — ver scripts/i18n/_keys-native-hero.json).
 */

import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useI18n } from '../i18n';
import type { JourneyItem } from '../lib/care-routine-journey';
import type { RoutineHeroEntry } from '../lib/care-routine-resolve';
import DayArc from './DayArc';

export interface HeroCustodyContext {
  mode: 'single' | 'together' | 'split';
  withName: string;
  withIsMe: boolean;
  kids: string[];
  untilLabel: string | null;
  handoff: { name: string; isMe: boolean } | null;
  groups?: { name: string; isMe: boolean; colorHex: string; kids: string[] }[];
  streakDays: number;
  streakTotal: number;
  week: { label: string; color: string | null; isToday: boolean }[];
  nextSwap: { dateLabel: string; dateKey: string; name: string; isMine: boolean } | null;
}

export interface HeroFamilyDayContext {
  mode: 'together' | 'single';
  kids: string[];
}

interface DashboardHeroProps {
  /** Timeline do dia (casa + leva/busca + atividades) pro arco. */
  heroTimeline: JourneyItem[];
  /** minuto "agora" do device (relógio); null = sem sol. */
  nowMin: number | null;
  /** Pais separados → vira Herói de Guarda. */
  custodyContext?: HeroCustodyContext | null;
  /** Família intacta/solo sem rotina → voz de presença. */
  familyDayContext?: HeroFamilyDayContext | null;
  /** Entradas da rotina de leva/busca (modo routine). */
  routineEntries?: RoutineHeroEntry[];
  hasRoutineSlots: boolean;
}

const TERRACOTA = '#E7AE80';

function listFormat(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export default function DashboardHero({
  heroTimeline,
  nowMin,
  custodyContext = null,
  familyDayContext = null,
  routineEntries = [],
  hasRoutineSlots,
}: DashboardHeroProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const kidsLabel = (names: string[]) => listFormat(names);

  const editLabel = custodyContext
    ? t('careRoutine.editScheduleCta')
    : hasRoutineSlots
      ? t('careRoutine.editCta')
      : t('careRoutine.activationCta');
  const editHref = custodyContext ? '/calendario/escala' : '/calendario/rotina';

  return (
    <View style={{ backgroundColor: '#272019', borderRadius: 16, padding: 20, marginBottom: 16 }}>
      {/* Header: 📍 HOJE + badge Guarda ativa + editar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          <Text style={{ fontSize: 11, letterSpacing: 2, color: '#B79B7E', fontWeight: '600' }}>
            📍 {t('careRoutine.todayHeading').toUpperCase()}
          </Text>
          {custodyContext ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' }} />
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#D9E4D9' }}>{t('dashboard.activeCustody')}</Text>
            </View>
          ) : null}
        </View>
        <Pressable onPress={() => router.push(editHref as never)}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#C9A98B' }}>{editLabel}</Text>
        </Pressable>
      </View>

      {/* VOZ */}
      <View style={{ marginBottom: 4 }}>
        {familyDayContext && routineEntries.length === 0 ? (
          <Text style={{ fontSize: 21, color: '#E9DECF', lineHeight: 26 }}>
            {familyDayContext.kids.length
              ? t(familyDayContext.mode === 'single' ? 'careRoutine.heroFamilySingle' : 'careRoutine.heroFamilyTogether', {
                  kids: kidsLabel(familyDayContext.kids),
                })
              : t('briefing.calmTitle')}
          </Text>
        ) : custodyContext ? (
          custodyContext.mode === 'split' && custodyContext.groups ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {custodyContext.groups.map((g, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: g.colorHex }} />
                  <Text style={{ fontSize: 19, color: '#E9DECF', flexShrink: 1 }}>
                    {g.isMe
                      ? t('careRoutine.heroCustodyWithYou', { kids: kidsLabel(g.kids) })
                      : t('careRoutine.heroCustodyWithOther', { kids: kidsLabel(g.kids), name: g.name })}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 21, color: '#E9DECF', lineHeight: 27, marginTop: 4 }}>
              {custodyContext.withIsMe
                ? t('careRoutine.heroCustodyWithYou', { kids: kidsLabel(custodyContext.kids) })
                : t('careRoutine.heroCustodyWithOther', { kids: kidsLabel(custodyContext.kids), name: custodyContext.withName })}
              {custodyContext.handoff ? (
                <Text style={{ color: '#C9B79F' }}>
                  {'  '}
                  {custodyContext.handoff.isMe
                    ? t('careRoutine.heroCustodyHandoffToYou')
                    : t('careRoutine.heroCustodyHandoffToOther', { name: custodyContext.handoff.name })}
                </Text>
              ) : custodyContext.untilLabel ? (
                <Text style={{ color: '#C9B79F' }}> {t('careRoutine.heroCustodyUntil', { date: custodyContext.untilLabel })}</Text>
              ) : null}
            </Text>
          )
        ) : (
          <View style={{ gap: 8, marginTop: 4 }}>
            {routineEntries.map((entry, i) => {
              const kids = kidsLabel(entry.childNames);
              if (entry.sameAllDay && entry.dropoff) {
                return (
                  <Text key={i} style={{ fontSize: 19, color: '#E9DECF' }}>
                    {t('careRoutine.heroFullDay', { name: entry.dropoff.responsibleName, kids })}
                  </Text>
                );
              }
              return (
                <Text key={i} style={{ fontSize: 19, color: '#E9DECF' }}>
                  {entry.dropoff ? t('careRoutine.heroDropoff', { name: entry.dropoff.responsibleName, kids }) : ''}
                  {entry.dropoff && entry.pickup ? '  ·  ' : ''}
                  {entry.pickup
                    ? entry.pickup.time
                      ? t('careRoutine.heroPickupAt', { name: entry.pickup.responsibleName, kids, time: entry.pickup.time.slice(0, 5) })
                      : t('careRoutine.heroPickup', { name: entry.pickup.responsibleName, kids })
                    : ''}
                </Text>
              );
            })}
          </View>
        )}
      </View>

      {/* ARCO DO DIA — aparece quando há timeline OU é dia em família. */}
      {heroTimeline.length > 0 || familyDayContext ? (
        <DayArc heroTimeline={heroTimeline} nowMin={nowMin} locale={locale} />
      ) : null}

      {/* RITMO DA SEMANA (guarda) — semana colorida + contagem. */}
      {custodyContext && custodyContext.week.length > 0 ? (
        <Pressable
          onPress={() => router.push('/calendario' as never)}
          style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ flexDirection: 'row', gap: 4, flex: 1 }}>
            {custodyContext.week.map((d, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 20,
                  borderRadius: 6,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: d.color ? `${d.color}59` : 'rgba(255,255,255,0.06)',
                  borderWidth: d.isToday ? 1 : 0,
                  borderColor: TERRACOTA,
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: '600', color: d.color ? '#F4ECE1' : '#9A8A77' }}>{d.label}</Text>
              </View>
            ))}
          </View>
          {custodyContext.streakTotal > 1 ? (
            <Text style={{ fontSize: 10.5, color: '#C9A98B' }}>
              {t('dashboard.consecutive', { current: custodyContext.streakDays, total: custodyContext.streakTotal })}
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      {/* PRÓXIMA TROCA (guarda). */}
      {custodyContext?.nextSwap ? (
        <Pressable
          onPress={() => router.push(`/calendario?day=${custodyContext.nextSwap!.dateKey}` as never)}
          style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Text>🔄</Text>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#D8CBB9' }}>
            {custodyContext.nextSwap.isMine ? t('careRoutine.heroYouPickUp') : t('dashboard.nextSwap')}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: '#A89A88', flexShrink: 1 }}>
            {' · '}
            {custodyContext.nextSwap.dateLabel}
            {custodyContext.nextSwap.isMine ? '' : ` · ${custodyContext.nextSwap.name}`}
          </Text>
        </Pressable>
      ) : null}

      {/* Ver jornada (native → calendário, sem rota /jornada). */}
      <Pressable onPress={() => router.push('/calendario' as never)} style={{ marginTop: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '500', color: '#C9A98B' }}>{t('careRoutine.journeyCta')} →</Text>
      </Pressable>
    </View>
  );
}
