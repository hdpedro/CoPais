/**
 * DayArc — "Arco do Dia" nativo (paridade com o bloco de arco do RoutineTodayCard
 * do PWA). Trajetória de sol 06h→21h: percorrido sólido em terracota, futuro
 * tracejado, sol em "agora", estações agrupadas por horário com zigzag de rótulos.
 *
 * PORTE NATIVO (Regra 19 — lógica única, apresentação diverge): a GEOMETRIA é
 * byte-a-byte a do PWA (bezier quadrática + de Casteljau + clamp 06h–21h +
 * zigzag). A APRESENTAÇÃO troca SVG do DOM por `react-native-svg` e DROPA os
 * filtros (blur/dropshadow não têm suporte estável em RN) — o brilho do sol é
 * aproximado por halos translúcidos. NÃO há rota `/jornada` no native → "ver
 * jornada"/multi-item apontam pro `/calendario`.
 *
 * ⚠️ PRECISA DE EAS BUILD + VALIDAÇÃO EM DEVICE (não dá pra runtime-testar no
 * ambiente de dev). Emoji em <SvgText> (casas) pode variar no Android — validar.
 */

import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, {
  Path,
  Circle,
  G,
  Text as SvgText,
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useI18n } from '../i18n';
import type { JourneyItem } from '../lib/care-routine-journey';

interface DayArcProps {
  heroTimeline: JourneyItem[];
  /** minuto do dia "agora" (relógio do device); null = sem sol posicionado. */
  nowMin: number | null;
  /** locale ('pt' | 'en' | ...) — formato de hora do arco (Regra Canônica 8). */
  locale: string;
}

const DAY_START = 6 * 60;
const DAY_END = 21 * 60;

// Bezier quadrática com controle no meio ⇒ x é LINEAR no parâmetro t.
const AP0 = { x: 10, y: 86 };
const AC = { x: 300, y: -42 };
const AP2 = { x: 590, y: 86 };
const arcF = (min: number) => Math.min(1, Math.max(0, (min - DAY_START) / (DAY_END - DAY_START)));
const arcX = (f: number) => 10 + 580 * f;
const arcY = (f: number) => 86 - 256 * f + 256 * f * f;
const arcFStation = (min: number) => Math.min(0.97, Math.max(0.03, arcF(min)));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

const shortLabel = (s: string) => s.split(/:\s|\s[–·-]\s/)[0].trim();

export default function DayArc({ heroTimeline, nowMin, locale }: DayArcProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [width, setWidth] = useState(0);

  // Hora compacta do arco por locale (pt/fr "16h30"; demais via Intl).
  const fmtArcTime = (tm: string) => {
    const [hs, ms] = tm.split(':');
    const h = parseInt(hs, 10);
    const m = parseInt(ms ?? '0', 10) || 0;
    if (locale === 'pt' || locale === 'fr') return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
    try {
      return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: m === 0 ? undefined : '2-digit' }).format(
        new Date(2000, 0, 1, h, m),
      );
    } catch {
      return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
    }
  };
  const fmtClock = (tm: string) => {
    if (locale !== 'en') return tm.slice(0, 5);
    const [hs, ms] = tm.split(':');
    try {
      return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(
        new Date(2000, 0, 1, parseInt(hs, 10), parseInt(ms ?? '0', 10) || 0),
      );
    } catch {
      return tm.slice(0, 5);
    }
  };

  // Estações: cluster pela posição CLAMPADA na janela 06h–21h.
  const arcStations = (() => {
    const map = new Map<number, { time: string; min: number; items: JourneyItem[] }>();
    for (const it of heroTimeline) {
      if (!it.time) continue;
      const [h, m] = it.time.split(':').map(Number);
      if (Number.isNaN(h)) continue;
      const rawMin = h * 60 + (m || 0);
      const min = Math.max(DAY_START, Math.min(DAY_END, rawMin));
      const c = map.get(min) ?? { time: it.time, min, items: [] as JourneyItem[] };
      c.items.push(it);
      map.set(min, c);
    }
    return [...map.values()].sort((a, b) => a.min - b.min);
  })();

  const nowF = nowMin == null ? null : arcF(nowMin);
  const splitT = nowF ?? 0;
  const AQ1 = { x: lerp(AP0.x, AC.x, splitT), y: lerp(AP0.y, AC.y, splitT) };
  const AQ2 = { x: lerp(AC.x, AP2.x, splitT), y: lerp(AC.y, AP2.y, splitT) };
  const AR = { x: lerp(AQ1.x, AQ2.x, splitT), y: lerp(AQ1.y, AQ2.y, splitT) };

  const hasHomeAm = heroTimeline.some((i) => i.key === 'home-am');
  const hasHomePm = heroTimeline.some((i) => i.key === 'home-pm');
  const homeAm = heroTimeline.find((i) => i.key === 'home-am') ?? null;
  const homePm = heroTimeline.find((i) => i.key === 'home-pm') ?? null;
  const dayMoving = nowMin != null && arcStations.length > 0 && nowMin >= arcStations[0].min;

  // Deep-link nativo: atividade com id → detalhe; resto → calendário (sem
  // rota /jornada no native).
  const goStation = (it: JourneyItem) => {
    if (it.kind === 'activity' && it.activityId) router.push(`/atividades/${it.activityId}` as never);
    else router.push('/calendario' as never);
  };

  // Rótulos do arco com zigzag (mesma matemática do PWA).
  const arcLabeled = (() => {
    const lastXAtLevel = [-999, -999];
    return arcStations.map((c) => {
      const x = arcX(arcFStation(c.min));
      const g0 = x - lastXAtLevel[0];
      const g1 = x - lastXAtLevel[1];
      let level = 0;
      let showLabels = true;
      if (g0 < 92) {
        if (g1 >= 92) level = 1;
        else if (Math.max(g0, g1) >= 50) level = g0 >= g1 ? 0 : 1;
        else showLabels = false;
      }
      if (showLabels && level === 0 && ((hasHomeAm && x < 118) || (hasHomePm && x > 482))) {
        level = 1;
      }
      if (showLabels) lastXAtLevel[level] = x;
      const names = c.items.map((i) => shortLabel(i.text)).join(' + ');
      const resps = [...new Set(c.items.map((i) => i.responsible).filter((r): r is string => !!r))];
      return {
        c,
        x,
        level,
        showLabels,
        display: [...names].length > 17 ? `${[...names].slice(0, 16).join('')}…` : names,
        resp: resps.length === 1 ? resps[0] : null,
      };
    });
  })();

  const nextCluster = (() => {
    if (arcStations.length === 0) return null;
    if (nowMin == null) return arcStations[0];
    return arcStations.find((s) => s.min > nowMin) ?? null;
  })();

  // viewBox com margem lateral (−10..610): react-native-svg CLIPA no limite (o
  // PWA usa overflow:visible), então as casas/labels nas pontas (x≈10/590) e o
  // "agora" cortavam. A margem dá folga sem mexer nas coordenadas do conteúdo.
  const arcH = width > 0 ? (width * 116) / 620 : 0;

  return (
    <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
        {width > 0 && (
          <Svg width={width} height={arcH} viewBox="-10 -2 620 116">
            <Defs>
              <RadialGradient id="arcSun" cx="38%" cy="32%" r="75%">
                <Stop offset="0%" stopColor="#FFE9CF" />
                <Stop offset="45%" stopColor="#F0B988" />
                <Stop offset="100%" stopColor="#D08A55" />
              </RadialGradient>
              <RadialGradient id="arcBead" cx="35%" cy="30%" r="80%">
                <Stop offset="0%" stopColor="#564B3F" />
                <Stop offset="100%" stopColor="#26211C" />
              </RadialGradient>
              {/* react-native-svg IGNORA alpha em stopColor="rgba(...)" → o alpha
                  TEM que vir em stopOpacity separado (senão o glow vira blob
                  sólido — bug visto no device Angelino 13/jun). */}
              <LinearGradient id="arcTrailGrad" x1={AP0.x} y1="0" x2={arcX(nowF ?? 0)} y2="0" gradientUnits="userSpaceOnUse">
                <Stop offset="0%" stopColor="#C9A573" stopOpacity={0.3} />
                <Stop offset="70%" stopColor="#C9A573" stopOpacity={1} />
                <Stop offset="100%" stopColor="#F0B988" stopOpacity={1} />
              </LinearGradient>
              <LinearGradient id="arcSkyGlow" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#E7AE80" stopOpacity={0.16} />
                <Stop offset="100%" stopColor="#E7AE80" stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Trilho: percorrido (sólido) + futuro (tracejado). */}
            {nowF != null && nowF > 0 ? (
              <>
                <Path d={`M ${AP0.x} ${AP0.y} Q ${AQ1.x} ${AQ1.y} ${AR.x} ${AR.y} L ${AR.x} 86 Z`} fill="url(#arcSkyGlow)" />
                <Path d={`M ${AP0.x} ${AP0.y} Q ${AQ1.x} ${AQ1.y} ${AR.x} ${AR.y}`} fill="none" stroke="url(#arcTrailGrad)" strokeWidth={2.5} strokeLinecap="round" />
                <Path d={`M ${AR.x} ${AR.y} Q ${AQ2.x} ${AQ2.y} ${AP2.x} ${AP2.y}`} fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth={1.5} strokeDasharray={[2, 6]} strokeLinecap="round" />
              </>
            ) : (
              <Path d={`M ${AP0.x} ${AP0.y} Q ${AC.x} ${AC.y} ${AP2.x} ${AP2.y}`} fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth={1.5} strokeDasharray={[2, 6]} strokeLinecap="round" />
            )}

            {/* Estações (beads + hora + dizeres com zigzag). */}
            {arcLabeled.map(({ c, x, level, showLabels, display, resp }) => {
              const f = arcFStation(c.min);
              const y = arcY(f);
              const passed = nowMin != null && c.min <= nowMin;
              const nameY = Math.min(y + 21, 76) + level * 12;
              return (
                <G key={c.min} opacity={passed ? 0.55 : 1} onPress={() => (c.items.length === 1 ? goStation(c.items[0]) : router.push('/calendario' as never))}>
                  <Circle cx={x} cy={y} r={22} fill="transparent" />
                  <SvgText x={x} y={y - 16 - level * 11} textAnchor="middle" fontSize={10} fill={passed ? '#9A8A77' : '#C9A98B'}>
                    {fmtArcTime(c.time)}
                  </SvgText>
                  <Circle cx={x} cy={y} r={9} fill="url(#arcBead)" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                  <Circle cx={x - 3} cy={y - 3.2} r={2.2} fill="rgba(255,255,255,0.18)" />
                  {c.items.length > 1 ? (
                    <SvgText x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontWeight="600" fill="#E7E0D5">
                      {String(c.items.length)}
                    </SvgText>
                  ) : (
                    <Circle cx={x} cy={y} r={2.5} fill="#C9A98B" />
                  )}
                  {showLabels ? (
                    <SvgText x={x} y={nameY} textAnchor="middle" fontSize={9.5} fill={passed ? '#9A8A77' : '#C9BCAA'}>
                      {display}
                    </SvgText>
                  ) : null}
                  {showLabels && resp ? (
                    <SvgText x={x} y={nameY + 11} textAnchor="middle" fontSize={9} fill={passed ? 'rgba(231,174,128,0.6)' : '#E7AE80'}>
                      {resp}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}

            {/* Sol "agora" (halos translúcidos no lugar do blur). */}
            {nowF != null ? (
              <G onPress={() => router.push('/calendario' as never)}>
                <Circle cx={arcX(nowF)} cy={arcY(nowF)} r={20} fill="transparent" />
                {/* Glow graduado (3 halos no lugar do filtro de blur do PWA). */}
                <Circle cx={arcX(nowF)} cy={arcY(nowF)} r={16} fill="#E7AE80" opacity={0.1} />
                <Circle cx={arcX(nowF)} cy={arcY(nowF)} r={11} fill="#E7AE80" opacity={0.2} />
                <Circle cx={arcX(nowF)} cy={arcY(nowF)} r={7.6} fill="#E7AE80" opacity={0.36} />
                <Circle cx={arcX(nowF)} cy={arcY(nowF)} r={6.8} fill="url(#arcSun)" />
                <Circle cx={arcX(nowF) - 2.1} cy={arcY(nowF) - 2.4} r={2} fill="#FFF3E2" opacity={0.9} />
                <SvgText
                  x={Math.min(556, Math.max(44, arcX(nowF)))}
                  y={Math.max(10, arcY(nowF) - (arcLabeled.some((s) => Math.abs(s.x - arcX(nowF!)) < 32) ? 31 : 19))}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight="700"
                  fill="#E7AE80"
                >
                  {t('careRoutine.arcNow')}
                </SvgText>
              </G>
            ) : null}

            {/* Casas nas pontas (por cima do sol). */}
            <G opacity={dayMoving ? 0.55 : 1} onPress={homeAm ? () => router.push('/calendario' as never) : undefined}>
              <Circle cx={AP0.x} cy={AP0.y} r={3.2} fill="rgba(255,255,255,0.3)" />
              {homeAm ? (
                <SvgText x={AP0.x} y={AP0.y - 9} textAnchor="start" fontSize={9.5} fill="#E7AE80">
                  🏠 {homeAm.text}
                </SvgText>
              ) : null}
            </G>
            <G onPress={homePm ? () => router.push('/calendario' as never) : undefined}>
              <Circle cx={AP2.x} cy={AP2.y} r={3.2} fill="rgba(255,255,255,0.3)" />
              {homePm ? (
                <SvgText x={AP2.x} y={AP2.y - 9} textAnchor="end" fontSize={9.5} fill="#E7AE80">
                  🏠 {homePm.text}
                </SvgText>
              ) : null}
            </G>

            {/* Eixo do dia. */}
            <G>
              <SvgText x={10} y={106} fontSize={10} fill="#A89A88">06h</SvgText>
              <SvgText x={arcX(arcF(9 * 60))} y={106} textAnchor="middle" fontSize={10} fill="#A89A88">{t('careRoutine.arcMorning')}</SvgText>
              <SvgText x={arcX(arcF(15 * 60))} y={106} textAnchor="middle" fontSize={10} fill="#A89A88">{t('careRoutine.arcAfternoon')}</SvgText>
              <SvgText x={arcX(arcF(19.5 * 60))} y={106} textAnchor="middle" fontSize={10} fill="#A89A88">{t('careRoutine.arcEvening')}</SvgText>
              <SvgText x={590} y={106} textAnchor="end" fontSize={10} fill="#A89A88">21h</SvgText>
            </G>
          </Svg>
        )}
      </View>

      {/* Próximo momento — o cluster que vem agora. */}
      {nextCluster ? (
        <Pressable
          onPress={() => (nextCluster.items.length === 1 ? goStation(nextCluster.items[0]) : router.push('/calendario' as never))}
          style={{ marginTop: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <Text style={{ fontSize: 10, letterSpacing: 1.6, color: '#9A8A77', fontWeight: '600', marginBottom: 6 }}>
            {t('careRoutine.nextMomentLabel').toUpperCase()}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 21, color: '#E7AE80', fontWeight: '600' }}>
              {fmtClock(nextCluster.items[0].time ?? '')}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: '#F4ECE1' }}>
                {nextCluster.items.length > 1
                  ? nextCluster.items.map((i) => shortLabel(i.text)).join(' + ')
                  : nextCluster.items[0].kind === 'activity'
                    ? shortLabel(nextCluster.items[0].text)
                    : `${t(nextCluster.items[0].kind === 'pickup' ? 'careRoutine.pickup' : 'careRoutine.dropoff')} · ${nextCluster.items[0].text}`}
              </Text>
              {nextCluster.items.length === 1 && (nextCluster.items[0].location || nextCluster.items[0].responsible) ? (
                <Text numberOfLines={1} style={{ fontSize: 11.5, color: '#A89A88' }}>
                  {[nextCluster.items[0].location, nextCluster.items[0].responsible].filter(Boolean).join(' — ')}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: '#C9A98B' }}>›</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
