/**
 * SplitDayArc — "Dois Fios": arco do dia para ROTINA DIVIDIDA (filhos com
 * responsáveis diferentes, getRoutineToday mode='split').
 *
 * Cada fio = um grupo de filho(s) sob o mesmo responsável (RoutineHeroEntry),
 * desenhado como um ARCO suave (bezier quadrática, paridade visual com o DayArc).
 * Cor do fio = responsável (você=sálvia, coparente=terracota). Na PASSAGEM
 * (quem leva ≠ quem busca) o fio troca de cor no meio (split de Casteljau) com
 * contas de leva (🚗) e busca (🏠). Eventos do dia viram contas NO fio do filho
 * a que pertencem, posicionadas sobre a curva. Sol do "agora" cruza os fios.
 * Card "próximo momento" abaixo (paridade com o arco único).
 *
 * Regras (dono 14/jun): escopo só rotina; mostra a passagem; um fio por
 * responsável; curvo + eventos + paridade com o arco lindo do dia único.
 *
 * ⚠️ Gráfico — PRECISA de validação em device. Emoji em <SvgText> pode variar
 * no Android (mesma ressalva do DayArc).
 */
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Path, Line, Circle, G, Text as SvgText } from 'react-native-svg';
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
const XMID = (X0 + X1) / 2;
const ARC_CTRL = 28; // offset do ponto de controle → pico visual de ~14px
const ME = '#7FC4AC'; // sálvia (você)
const OTHER = '#E7AE80'; // terracota (coparente)

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const tOf = (min: number) => clamp01((min - DAY_START) / (DAY_END - DAY_START));
const fx = (min: number) => X0 + (X1 - X0) * tOf(min);
/** y sobre a curva do fio (bezier quad com controle no meio → x linear em t). */
const fy = (min: number, yBase: number) => {
  const t = tOf(min);
  return yBase - 2 * t * (1 - t) * ARC_CTRL;
};
const toMin = (t: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
};
const iconFor = (category: string): string =>
  category === 'evento' ? '📅' : ACTIVITY_CATEGORIES.find((c) => c.value === category)?.icon ?? '📌';
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

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

  const LANE_GAP = 58;
  const TOP = 26;
  const laneY = (i: number) => TOP + 18 + i * LANE_GAP;
  const N = entries.length;
  const H = TOP + 18 + (N - 1) * LANE_GAP + 34;
  const svgH = width > 0 ? (width * H) / 620 : 0;
  const colorOf = (isMe?: boolean) => (isMe ? ME : OTHER);

  // Próximo momento (evento ou perna leva/busca) após "agora", entre todos os fios.
  const moments: { min: number; text: string; sub: string | null; activityId: string | null }[] = [];
  for (const entry of entries) {
    const kids = entry.childNames.join(' e ');
    const d = toMin(entry.dropoff?.time ?? null);
    const p = toMin(entry.pickup?.time ?? null);
    if (d != null) moments.push({ min: d, text: `${t('careRoutine.dropoff')} · ${kids}`, sub: entry.dropoff?.responsibleName ?? null, activityId: null });
    if (p != null) moments.push({ min: p, text: `${t('careRoutine.pickup')} · ${kids}`, sub: entry.pickup?.responsibleName ?? null, activityId: null });
    for (const cid of entry.childIds) {
      for (const ev of eventsByChild[cid] ?? []) {
        moments.push({ min: ev.min, text: `${ev.label} · ${kids}`, sub: ev.time, activityId: null });
      }
    }
  }
  moments.sort((a, b) => a.min - b.min);
  const nextMoment = nowMin == null ? moments[0] : moments.find((m) => m.min >= nowMin) ?? null;

  return (
    <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
        {width > 0 && (
          <Svg width={width} height={svgH} viewBox={`-10 -2 620 ${H}`}>
            {entries.map((entry, i) => {
              const yBase = laneY(i);
              const dropMin = toMin(entry.dropoff?.time ?? null);
              const pickMin = toMin(entry.pickup?.time ?? null);
              const colorA = colorOf(entry.dropoff?.isMe ?? entry.pickup?.isMe);
              const colorB = colorOf(entry.pickup?.isMe ?? entry.dropoff?.isMe);
              const handoffMin =
                entry.dropoff && entry.pickup && entry.dropoff.responsibleId !== entry.pickup.responsibleId
                  ? dropMin != null && pickMin != null
                    ? (dropMin + pickMin) / 2
                    : (DAY_START + DAY_END) / 2
                  : null;
              const kids = entry.childNames.join(' e ');
              const childEvents = entry.childIds.flatMap((cid) => eventsByChild[cid] ?? []);

              // Curva do fio (P0 esq, P1 controle no meio, P2 dir).
              const P0 = { x: X0, y: yBase };
              const P1 = { x: XMID, y: yBase - ARC_CTRL };
              const P2 = { x: X1, y: yBase };

              let lane;
              if (handoffMin != null) {
                // Split de Casteljau no t da passagem → 2 segmentos coloridos.
                const th = tOf(handoffMin);
                const Q1 = { x: lerp(P0.x, P1.x, th), y: lerp(P0.y, P1.y, th) };
                const Q2 = { x: lerp(P1.x, P2.x, th), y: lerp(P1.y, P2.y, th) };
                const R = { x: lerp(Q1.x, Q2.x, th), y: lerp(Q1.y, Q2.y, th) };
                lane = (
                  <>
                    <Path d={`M ${P0.x} ${P0.y} Q ${Q1.x} ${Q1.y} ${R.x} ${R.y}`} fill="none" stroke={colorA} strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
                    <Path d={`M ${R.x} ${R.y} Q ${Q2.x} ${Q2.y} ${P2.x} ${P2.y}`} fill="none" stroke={colorB} strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
                    <Circle cx={R.x} cy={R.y} r={2.5} fill="#E9DECF" opacity={0.6} />
                  </>
                );
              } else {
                lane = <Path d={`M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`} fill="none" stroke={colorA} strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />;
              }

              return (
                <G key={entry.childIds.join('-') || i}>
                  {/* Rótulo do fio: filho(s) + cor do responsável */}
                  <Circle cx={X0 + 1} cy={yBase - ARC_CTRL / 2 - 10} r={3} fill={colorA} />
                  <SvgText x={X0 + 9} y={yBase - ARC_CTRL / 2 - 6} fontSize={11} fontWeight="600" fill="#E9DECF">
                    {kids}
                  </SvgText>

                  {lane}

                  {/* Eventos do dia desse(s) filho(s), sobre a curva */}
                  {childEvents.map((ev, k) => {
                    const em = Math.max(DAY_START, Math.min(DAY_END, ev.min));
                    const ex = fx(em);
                    const ey = fy(em, yBase);
                    return (
                      <G key={`ev-${k}`} onPress={() => router.push('/calendario' as never)}>
                        <SvgText x={ex} y={ey - 13} textAnchor="middle" fontSize={9.5} fill="#CFE6DC">{fmtTime(ev.min)}</SvgText>
                        <Circle cx={ex} cy={ey} r={9} fill="#2A241D" stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
                        <SvgText x={ex} y={ey + 4} textAnchor="middle" fontSize={11}>{iconFor(ev.category)}</SvgText>
                      </G>
                    );
                  })}

                  {/* Leva (🚗) sobre a curva */}
                  {dropMin != null ? (
                    <G>
                      <Circle cx={fx(dropMin)} cy={fy(dropMin, yBase)} r={8} fill="#2A241D" stroke={colorA} strokeWidth={1.5} />
                      <SvgText x={fx(dropMin)} y={fy(dropMin, yBase) + 4} textAnchor="middle" fontSize={10}>🚗</SvgText>
                      <SvgText x={fx(dropMin)} y={fy(dropMin, yBase) + 21} textAnchor="middle" fontSize={9} fill="#A89A88">{fmtTime(dropMin)}</SvgText>
                    </G>
                  ) : null}

                  {/* Busca (🏠) sobre a curva */}
                  {pickMin != null ? (
                    <G>
                      <Circle cx={fx(pickMin)} cy={fy(pickMin, yBase)} r={8} fill="#2A241D" stroke={colorB} strokeWidth={1.5} />
                      <SvgText x={fx(pickMin)} y={fy(pickMin, yBase) + 4} textAnchor="middle" fontSize={10}>🏠</SvgText>
                      <SvgText x={fx(pickMin)} y={fy(pickMin, yBase) + 21} textAnchor="middle" fontSize={9} fill="#A89A88">{fmtTime(pickMin)}</SvgText>
                    </G>
                  ) : null}
                </G>
              );
            })}

            {/* Sol do "agora" cruzando os fios */}
            {nowMin != null ? (
              <G>
                <Line x1={fx(nowMin)} y1={laneY(0) - 28} x2={fx(nowMin)} y2={laneY(N - 1) + 6} stroke="#F4B860" strokeWidth={1} opacity={0.28} />
                <Circle cx={fx(nowMin)} cy={fy(nowMin, laneY(0))} r={11} fill="#E7AE80" opacity={0.16} />
                <Circle cx={fx(nowMin)} cy={fy(nowMin, laneY(0))} r={6.4} fill="#F4B860" />
                <Circle cx={fx(nowMin) - 2} cy={fy(nowMin, laneY(0)) - 2} r={1.8} fill="#FFF3E2" opacity={0.9} />
                <SvgText x={Math.min(560, Math.max(40, fx(nowMin)))} y={laneY(0) - 30} textAnchor="middle" fontSize={10} fontWeight="700" fill="#E7AE80">
                  {t('careRoutine.arcNow')}
                </SvgText>
              </G>
            ) : null}

            {/* Eixo do dia */}
            <G>
              <SvgText x={X0} y={H - 4} fontSize={10} fill="#A89A88">06h</SvgText>
              <SvgText x={fx(9 * 60)} y={H - 4} textAnchor="middle" fontSize={10} fill="#A89A88">{t('careRoutine.arcMorning')}</SvgText>
              <SvgText x={fx(15 * 60)} y={H - 4} textAnchor="middle" fontSize={10} fill="#A89A88">{t('careRoutine.arcAfternoon')}</SvgText>
              <SvgText x={fx(19.5 * 60)} y={H - 4} textAnchor="middle" fontSize={10} fill="#A89A88">{t('careRoutine.arcEvening')}</SvgText>
              <SvgText x={X1} y={H - 4} textAnchor="end" fontSize={10} fill="#A89A88">21h</SvgText>
            </G>
          </Svg>
        )}
      </View>

      {/* Próximo momento — paridade com o arco único. */}
      {nextMoment ? (
        <Pressable
          onPress={() => router.push('/calendario' as never)}
          style={{ marginTop: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <Text style={{ fontSize: 10, letterSpacing: 1.6, color: '#9A8A77', fontWeight: '600', marginBottom: 6 }}>
            {t('careRoutine.nextMomentLabel').toUpperCase()}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 21, color: '#E7AE80', fontWeight: '600' }}>{fmtTime(nextMoment.min)}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: '#F4ECE1' }}>{nextMoment.text}</Text>
              {nextMoment.sub ? <Text numberOfLines={1} style={{ fontSize: 11.5, color: '#A89A88' }}>{nextMoment.sub}</Text> : null}
            </View>
            <Text style={{ color: '#C9A98B' }}>›</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
