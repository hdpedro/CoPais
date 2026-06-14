/**
 * SplitDayArc — "Dois Fios": o arco do dia para dias de ROTINA DIVIDIDA, quando
 * os filhos estão com responsáveis diferentes (getRoutineToday mode='split').
 *
 * Cada fio = um grupo de filho(s) sob o mesmo responsável (RoutineHeroEntry).
 * A cor do fio é a do responsável (você=sálvia, outro=terracota); na PASSAGEM
 * (quem leva ≠ quem busca) o fio TROCA de cor no meio, com contas de leva (🚗)
 * e busca (🏠) marcando o horário. Eventos do dia viram contas no fio do filho
 * a que pertencem. O sol do "agora" cruza todos os fios.
 *
 * Regras confirmadas pelo dono (14/jun): escopo = só rotina; mostra a passagem
 * (fio bicolor + leva/busca); um fio por responsável (together colapsa pro
 * DayArc único, tratado no DashboardHero).
 *
 * ⚠️ Gráfico — PRECISA de validação em device (não dá pra runtime-testar aqui).
 * Emoji em <SvgText> pode variar no Android (mesma ressalva do DayArc).
 */
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Circle, G, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useI18n } from '../i18n';
import { ACTIVITY_CATEGORIES } from '../lib/constants';
import type { RoutineHeroEntry } from '../lib/care-routine-resolve';

export interface ArcChildEvent {
  min: number;
  category: string;
  label: string;
  time: string;
}

interface SplitDayArcProps {
  entries: RoutineHeroEntry[];
  /** childId → eventos de hoje (com hora). Atribuídos ao fio do filho. */
  eventsByChild: Record<string, ArcChildEvent[]>;
  nowMin: number | null;
  locale: string;
}

const DAY_START = 6 * 60;
const DAY_END = 21 * 60;
const X0 = 10;
const X1 = 590;
const ME = '#7FC4AC'; // sálvia (você) sobre fundo escuro
const OTHER = '#E7AE80'; // terracota (coparente)

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fx = (min: number) => X0 + (X1 - X0) * clamp01((min - DAY_START) / (DAY_END - DAY_START));
const toMin = (t: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
};
const iconFor = (category: string): string =>
  category === 'evento' ? '📅' : ACTIVITY_CATEGORIES.find((c) => c.value === category)?.icon ?? '📌';

export default function SplitDayArc({ entries, eventsByChild, nowMin, locale }: SplitDayArcProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [width, setWidth] = useState(0);

  const fmtTime = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (locale === 'pt' || locale === 'fr') return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
    try {
      return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: m === 0 ? undefined : '2-digit' }).format(
        new Date(2000, 0, 1, h, m),
      );
    } catch {
      return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
    }
  };

  const LANE_GAP = 52;
  const TOP = 20;
  const laneY = (i: number) => TOP + 16 + i * LANE_GAP;
  const N = entries.length;
  const H = TOP + 16 + (N - 1) * LANE_GAP + 40;
  const svgH = width > 0 ? (width * H) / 620 : 0;

  const colorOf = (isMe: boolean | undefined) => (isMe ? ME : OTHER);

  return (
    <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
        {width > 0 && (
          <Svg width={width} height={svgH} viewBox={`-10 -2 620 ${H}`}>
            {entries.map((entry, i) => {
              const y = laneY(i);
              const dropMin = toMin(entry.dropoff?.time ?? null);
              const pickMin = toMin(entry.pickup?.time ?? null);
              const colorA = colorOf(entry.dropoff?.isMe ?? entry.pickup?.isMe);
              const colorB = colorOf(entry.pickup?.isMe ?? entry.dropoff?.isMe);
              const handoff =
                entry.dropoff && entry.pickup && entry.dropoff.responsibleId !== entry.pickup.responsibleId
                  ? dropMin != null && pickMin != null
                    ? (dropMin + pickMin) / 2
                    : (DAY_START + DAY_END) / 2
                  : null;
              const kids = entry.childNames.join(' e ');
              const childEvents = entry.childIds.flatMap((cid) => eventsByChild[cid] ?? []);

              return (
                <G key={entry.childIds.join('-') || i}>
                  {/* Rótulo do fio: filho(s) + cor do responsável */}
                  <Circle cx={X0 + 2} cy={y - 14} r={3} fill={colorA} />
                  <SvgText x={X0 + 10} y={y - 10.5} fontSize={11} fontWeight="600" fill="#E9DECF">
                    {kids}
                  </SvgText>

                  {/* Fio: 1 cor (mesmo responsável) ou bicolor com passagem */}
                  {handoff != null ? (
                    <>
                      <Line x1={fx(DAY_START)} y1={y} x2={fx(handoff)} y2={y} stroke={colorA} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
                      <Line x1={fx(handoff)} y1={y} x2={fx(DAY_END)} y2={y} stroke={colorB} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
                      <Circle cx={fx(handoff)} cy={y} r={2.5} fill="#E9DECF" opacity={0.6} />
                    </>
                  ) : (
                    <Line x1={fx(DAY_START)} y1={y} x2={fx(DAY_END)} y2={y} stroke={colorA} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
                  )}

                  {/* Eventos do dia desse(s) filho(s) */}
                  {childEvents.map((ev, k) => {
                    const ex = fx(Math.max(DAY_START, Math.min(DAY_END, ev.min)));
                    return (
                      <G key={`ev-${k}`} onPress={() => router.push('/calendario' as never)}>
                        <Circle cx={ex} cy={y} r={9} fill="#2A241D" stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
                        <SvgText x={ex} y={y + 4} textAnchor="middle" fontSize={11}>{iconFor(ev.category)}</SvgText>
                        <SvgText x={ex} y={y - 14} textAnchor="middle" fontSize={9.5} fill="#CFE6DC">{fmtTime(ev.min)}</SvgText>
                      </G>
                    );
                  })}

                  {/* Leva (🚗) — sempre que houver horário (mesmo sem troca). */}
                  {dropMin != null ? (
                    <G>
                      <Circle cx={fx(dropMin)} cy={y} r={8} fill="#2A241D" stroke={colorA} strokeWidth={1.5} />
                      <SvgText x={fx(dropMin)} y={y + 4} textAnchor="middle" fontSize={10}>🚗</SvgText>
                      <SvgText x={fx(dropMin)} y={y + 22} textAnchor="middle" fontSize={9} fill="#A89A88">{fmtTime(dropMin)}</SvgText>
                    </G>
                  ) : null}

                  {/* Busca (🏠) — sempre que houver horário. */}
                  {pickMin != null ? (
                    <G>
                      <Circle cx={fx(pickMin)} cy={y} r={8} fill="#2A241D" stroke={colorB} strokeWidth={1.5} />
                      <SvgText x={fx(pickMin)} y={y + 4} textAnchor="middle" fontSize={10}>🏠</SvgText>
                      <SvgText x={fx(pickMin)} y={y + 22} textAnchor="middle" fontSize={9} fill="#A89A88">{fmtTime(pickMin)}</SvgText>
                    </G>
                  ) : null}
                </G>
              );
            })}

            {/* Sol do "agora" cruzando todos os fios */}
            {nowMin != null ? (
              <G>
                <Line x1={fx(nowMin)} y1={laneY(0) - 22} x2={fx(nowMin)} y2={laneY(N - 1) + 14} stroke="#F4B860" strokeWidth={1} opacity={0.3} />
                <Circle cx={fx(nowMin)} cy={laneY(0) - 22} r={11} fill="#E7AE80" opacity={0.16} />
                <Circle cx={fx(nowMin)} cy={laneY(0) - 22} r={6.4} fill="#F4B860" />
                <Circle cx={fx(nowMin) - 2} cy={laneY(0) - 24} r={1.8} fill="#FFF3E2" opacity={0.9} />
                <SvgText x={fx(nowMin)} y={laneY(0) - 36} textAnchor="middle" fontSize={10} fontWeight="700" fill="#E7AE80">
                  {t('careRoutine.arcNow')}
                </SvgText>
              </G>
            ) : null}

            {/* Eixo do dia */}
            <G>
              <SvgText x={X0} y={H - 6} fontSize={10} fill="#A89A88">06h</SvgText>
              <SvgText x={fx(9 * 60)} y={H - 6} textAnchor="middle" fontSize={10} fill="#A89A88">{t('careRoutine.arcMorning')}</SvgText>
              <SvgText x={fx(15 * 60)} y={H - 6} textAnchor="middle" fontSize={10} fill="#A89A88">{t('careRoutine.arcAfternoon')}</SvgText>
              <SvgText x={fx(19.5 * 60)} y={H - 6} textAnchor="middle" fontSize={10} fill="#A89A88">{t('careRoutine.arcEvening')}</SvgText>
              <SvgText x={X1} y={H - 6} textAnchor="end" fontSize={10} fill="#A89A88">21h</SvgText>
            </G>
          </Svg>
        )}
      </View>
    </View>
  );
}
