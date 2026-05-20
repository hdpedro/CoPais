/**
 * GrowthChart (Native) — paridade visual com PWA src/app/(app)/saude/crescimento/GrowthChart.tsx
 *
 * Renderiza curvas OMS (P3/P15/P50/P85/P97) com bandas coloridas (verde =
 * normal, âmbar = atenção) + linha do filho plotada por cima. Premium:
 *  - Toggle Peso/Altura (mantém zoom dinâmico do eixo Y por métrica)
 *  - Toggle Menino/Menina (default = sexo da criança ativa)
 *  - Badge "P{n}" no header reflete o percentil atual da última medida
 *  - Bandas opacas com alpha pra não competir com a linha do filho
 *  - Linha do filho azul (M) ou rosa (F), pontos circulares brancos com
 *    borda colorida pra destacar sobre as bandas
 *
 * Alimentado direto por who-growth-data.ts (333 linhas de percentis WHO,
 * mesma source-of-truth do PWA). Não depende de network — purê estático.
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Rect, Path, Line, Text as SvgText, Circle, G } from 'react-native-svg';
import {
  getWeightForAge,
  getHeightForAge,
  calculatePercentile,
  type GrowthDataPoint,
} from 'src/lib/who-growth-data';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

type GrowthRecord = {
  id: string;
  measured_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  head_cm: number | null;
};

type Props = {
  records: GrowthRecord[];
  birthDate: string; // YYYY-MM-DD
  childName: string;
  childSex?: 'M' | 'F' | null;
};

type Metric = 'weight' | 'height';
type Sex = 'M' | 'F';

// Chart dimensions — calibrado pra ~360px de viewport (iPhone padrão).
// Mantemos o aspect ratio do PWA (CHART_W=360, CHART_H=240). Pra telas
// maiores o SVG escala via width="100%" e mantém o viewBox.
const CHART_W = 360;
const CHART_H = 240;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 32;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function monthsBetween(birth: string, date: string): number {
  const b = new Date(birth + 'T12:00:00');
  const d = new Date(date + 'T12:00:00');
  const months =
    (d.getFullYear() - b.getFullYear()) * 12 +
    (d.getMonth() - b.getMonth()) +
    (d.getDate() - b.getDate()) / 30;
  return Math.max(0, months);
}

function buildPath(
  data: GrowthDataPoint[],
  key: keyof GrowthDataPoint,
  xScale: (m: number) => number,
  yScale: (v: number) => number,
  maxMonth: number,
): string {
  return data
    .filter((d) => d.month <= maxMonth)
    .map((d, i) => {
      const x = xScale(d.month);
      const y = yScale(d[key] as number);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

function buildAreaPath(
  data: GrowthDataPoint[],
  keyTop: keyof GrowthDataPoint,
  keyBot: keyof GrowthDataPoint,
  xScale: (m: number) => number,
  yScale: (v: number) => number,
  maxMonth: number,
): string {
  const filtered = data.filter((d) => d.month <= maxMonth);
  if (filtered.length === 0) return '';
  const top = filtered.map(
    (d, i) =>
      `${i === 0 ? 'M' : 'L'}${xScale(d.month)},${yScale(d[keyTop] as number)}`,
  );
  const bot = [...filtered]
    .reverse()
    .map(
      (d) => `L${xScale(d.month)},${yScale(d[keyBot] as number)}`,
    );
  return top.join(' ') + ' ' + bot.join(' ') + ' Z';
}

export default function GrowthChart({
  records,
  birthDate,
  childName,
  childSex,
}: Props) {
  const [metric, setMetric] = useState<Metric>('weight');
  const [sex, setSex] = useState<Sex>(childSex || 'M');

  // useMemo evita recalcular paths a cada re-render do parent (lista de
  // medidas, refreshing etc.). Dependency = mudanças que importam pro gráfico.
  const view = useMemo(() => {
    const whoData =
      metric === 'weight' ? getWeightForAge(sex) : getHeightForAge(sex);

    const childPoints = records
      .map((r) => ({
        month: monthsBetween(birthDate, r.measured_date),
        value: metric === 'weight' ? r.weight_kg : r.height_cm,
        date: r.measured_date,
      }))
      .filter((p) => p.value != null && p.month >= 0)
      .sort((a, b) => a.month - b.month) as {
      month: number;
      value: number;
      date: string;
    }[];

    const childMaxMonth =
      childPoints.length > 0 ? Math.max(...childPoints.map((p) => p.month)) : 0;
    const maxMonth = Math.max(
      12,
      Math.min(60, Math.ceil(childMaxMonth / 6) * 6 + 6),
    );

    const relevantWho = whoData.filter((d) => d.month <= maxMonth);
    const yMin =
      Math.floor(
        Math.min(...relevantWho.map((d) => d.p3)) /
          (metric === 'weight' ? 1 : 5),
      ) * (metric === 'weight' ? 1 : 5);
    const yMaxWho = Math.max(...relevantWho.map((d) => d.p97));
    const childMax =
      childPoints.length > 0 ? Math.max(...childPoints.map((p) => p.value)) : 0;
    const yMax =
      Math.ceil(
        Math.max(yMaxWho, childMax) / (metric === 'weight' ? 2 : 10),
      ) *
        (metric === 'weight' ? 2 : 10) +
      (metric === 'weight' ? 1 : 5);

    const xScale = (m: number) => PAD_L + (m / maxMonth) * PLOT_W;
    const yScale = (v: number) =>
      PAD_T + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

    const yStep = metric === 'weight' ? 2 : 10;
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax; v += yStep) yTicks.push(v);

    const xStep = maxMonth <= 12 ? 2 : maxMonth <= 24 ? 3 : 6;
    const xTicks: number[] = [];
    for (let m = 0; m <= maxMonth; m += xStep) xTicks.push(m);

    const areaYellow1 = buildAreaPath(
      whoData,
      'p15',
      'p3',
      xScale,
      yScale,
      maxMonth,
    );
    const areaGreen = buildAreaPath(
      whoData,
      'p85',
      'p15',
      xScale,
      yScale,
      maxMonth,
    );
    const areaYellow2 = buildAreaPath(
      whoData,
      'p97',
      'p85',
      xScale,
      yScale,
      maxMonth,
    );

    const pLines: {
      key: keyof GrowthDataPoint;
      label: string;
      dash?: boolean;
    }[] = [
      { key: 'p3', label: 'P3', dash: true },
      { key: 'p15', label: 'P15' },
      { key: 'p50', label: 'P50' },
      { key: 'p85', label: 'P85' },
      { key: 'p97', label: 'P97', dash: true },
    ];

    const childPath =
      childPoints.length >= 2
        ? childPoints
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'}${xScale(p.month)},${yScale(p.value)}`,
            )
            .join(' ')
        : '';

    const latestPoint =
      childPoints.length > 0 ? childPoints[childPoints.length - 1] : null;
    const currentPercentile = latestPoint
      ? calculatePercentile(latestPoint.month, latestPoint.value, sex, metric)
      : null;

    return {
      whoData,
      relevantWho,
      childPoints,
      maxMonth,
      yTicks,
      xTicks,
      xScale,
      yScale,
      areaYellow1,
      areaGreen,
      areaYellow2,
      pLines,
      childPath,
      currentPercentile,
    };
  }, [records, birthDate, metric, sex]);

  const childColor = sex === 'M' ? '#2563EB' : '#DB2777';
  const firstName = childName.split(' ')[0];

  // Cor do badge percentil — paridade PWA.
  const badgeStyle = (() => {
    if (view.currentPercentile === null) return null;
    if (view.currentPercentile >= 15 && view.currentPercentile <= 85)
      return { bg: '#D1FAE5', color: '#047857' };
    if (view.currentPercentile >= 3 && view.currentPercentile <= 97)
      return { bg: '#FEF3C7', color: '#B45309' };
    return { bg: '#FEE2E2', color: '#B91C1C' };
  })();

  return (
    <View
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.xl,
        padding: spacing.md,
        marginBottom: spacing.lg,
        ...shadows.sm,
      }}
    >
      {/* Header com badge percentil */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: font.sizes.sm,
            fontWeight: font.weights.semibold,
            color: colors.text,
          }}
        >
          Curva de Crescimento OMS
        </Text>
        {badgeStyle && view.currentPercentile !== null ? (
          <View
            style={{
              backgroundColor: badgeStyle.bg,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: radius.full,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: font.weights.bold,
                color: badgeStyle.color,
              }}
            >
              P{view.currentPercentile}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Toggles Peso/Altura + Menino/Menina (segmented control) */}
      <View
        style={{
          flexDirection: 'row',
          gap: spacing.sm,
          marginBottom: spacing.sm,
          flexWrap: 'wrap',
        }}
      >
        <Segmented
          options={[
            { value: 'weight', label: 'Peso' },
            { value: 'height', label: 'Altura' },
          ]}
          selected={metric}
          onSelect={(v) => setMetric(v as Metric)}
        />
        <Segmented
          options={[
            { value: 'M', label: 'Menino' },
            { value: 'F', label: 'Menina' },
          ]}
          selected={sex}
          onSelect={(v) => setSex(v as Sex)}
          variant="sex"
        />
      </View>

      {/* SVG chart — scroll horizontal só ativa se conteúdo extrapolar.
          O viewBox garante aspect ratio constante. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignSelf: 'stretch' }}
      >
        <Svg
          width={CHART_W}
          height={CHART_H}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        >
          {/* Background plot area */}
          <Rect
            x={PAD_L}
            y={PAD_T}
            width={PLOT_W}
            height={PLOT_H}
            fill="#fafafa"
            rx={2}
          />

          {/* Bandas OMS coloridas */}
          <Path d={view.areaYellow1} fill="#FEF3C7" opacity={0.7} />
          <Path d={view.areaGreen} fill="#D1FAE5" opacity={0.6} />
          <Path d={view.areaYellow2} fill="#FEF3C7" opacity={0.7} />

          {/* Grid + Y axis ticks */}
          {view.yTicks.map((v) => (
            <G key={`y-${v}`}>
              <Line
                x1={PAD_L}
                y1={view.yScale(v)}
                x2={PAD_L + PLOT_W}
                y2={view.yScale(v)}
                stroke="#e5e7eb"
                strokeWidth={0.5}
              />
              <SvgText
                x={PAD_L - 4}
                y={view.yScale(v) + 3}
                textAnchor="end"
                fill="#9ca3af"
                fontSize={8}
              >
                {v}
              </SvgText>
            </G>
          ))}

          {/* X axis ticks (idade em meses) */}
          {view.xTicks.map((m) => (
            <G key={`x-${m}`}>
              <Line
                x1={view.xScale(m)}
                y1={PAD_T}
                x2={view.xScale(m)}
                y2={PAD_T + PLOT_H}
                stroke="#e5e7eb"
                strokeWidth={0.5}
              />
              <SvgText
                x={view.xScale(m)}
                y={PAD_T + PLOT_H + 14}
                textAnchor="middle"
                fill="#9ca3af"
                fontSize={8}
              >
                {m}m
              </SvgText>
            </G>
          ))}

          {/* Percentile lines + labels */}
          {view.pLines.map(({ key, label, dash }) => {
            const path = buildPath(
              view.whoData,
              key,
              view.xScale,
              view.yScale,
              view.maxMonth,
            );
            const lastPt = view.relevantWho[view.relevantWho.length - 1];
            const stroke =
              key === 'p50'
                ? '#059669'
                : key === 'p15' || key === 'p85'
                  ? '#D97706'
                  : '#EF4444';
            return (
              <G key={key}>
                <Path
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={key === 'p50' ? 1.2 : 0.8}
                  strokeDasharray={dash ? '3,3' : undefined}
                  opacity={0.7}
                />
                {lastPt ? (
                  <SvgText
                    x={view.xScale(lastPt.month) + 2}
                    y={view.yScale(lastPt[key] as number) + 3}
                    fill="#9ca3af"
                    fontSize={6}
                  >
                    {label}
                  </SvgText>
                ) : null}
              </G>
            );
          })}

          {/* Linha do filho */}
          {view.childPath ? (
            <Path
              d={view.childPath}
              fill="none"
              stroke={childColor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {/* Pontos do filho — branco com borda colorida pra destaque sobre as bandas */}
          {view.childPoints.map((p, i) => (
            <G key={`pt-${i}`}>
              <Circle
                cx={view.xScale(p.month)}
                cy={view.yScale(p.value)}
                r={4}
                fill="#fff"
                stroke={childColor}
                strokeWidth={2}
              />
              <Circle
                cx={view.xScale(p.month)}
                cy={view.yScale(p.value)}
                r={2}
                fill={childColor}
              />
            </G>
          ))}

          {/* Axis labels */}
          <SvgText
            x={PAD_L + PLOT_W / 2}
            y={CHART_H - 2}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={9}
          >
            Idade (meses)
          </SvgText>
          <SvgText
            x={8}
            y={PAD_T + PLOT_H / 2}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={9}
            transform={`rotate(-90, 8, ${PAD_T + PLOT_H / 2})`}
          >
            {metric === 'weight' ? 'Peso (kg)' : 'Altura (cm)'}
          </SvgText>
        </Svg>
      </ScrollView>

      {/* Legenda */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.md,
          marginTop: spacing.sm,
        }}
      >
        <LegendItem
          swatch={<View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: '#D1FAE5' }} />}
          label="Normal (P15-P85)"
        />
        <LegendItem
          swatch={<View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: '#FEF3C7' }} />}
          label="Atenção (P3-P15 / P85-P97)"
        />
        <LegendItem
          swatch={<View style={{ width: 12, height: 2, borderRadius: 1, backgroundColor: childColor }} />}
          label={firstName}
        />
      </View>

      {view.childPoints.length === 0 ? (
        <Text
          style={{
            fontSize: font.sizes.xs,
            color: colors.textMuted,
            textAlign: 'center',
            marginTop: spacing.sm,
          }}
        >
          Registre medidas de {metric === 'weight' ? 'peso' : 'altura'} para
          ver os dados de {firstName} no gráfico.
        </Text>
      ) : null}
    </View>
  );
}

/* ─── Helpers internos ───────────────────────────────────────────── */

interface SegmentedOption {
  value: string;
  label: string;
}

function Segmented({
  options,
  selected,
  onSelect,
  variant = 'default',
}: {
  options: SegmentedOption[];
  selected: string;
  onSelect: (v: string) => void;
  variant?: 'default' | 'sex';
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: radius.md,
        padding: 2,
      }}
    >
      {options.map((opt) => {
        const isActive = opt.value === selected;
        // Para o segmented de sexo, tonalidade reflete o filho (azul/rosa)
        // pra reforçar a paridade visual da linha do gráfico.
        let activeBg = '#fff';
        let activeColor = colors.text;
        if (variant === 'sex' && isActive) {
          activeBg = opt.value === 'M' ? '#DBEAFE' : '#FCE7F3';
          activeColor = opt.value === 'M' ? '#1D4ED8' : '#BE185D';
        }
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={opt.label}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              borderRadius: radius.md - 2,
              backgroundColor: isActive ? activeBg : 'transparent',
              ...(isActive ? shadows.sm : {}),
            }}
          >
            <Text
              style={{
                fontSize: font.sizes.xs,
                fontWeight: font.weights.semibold,
                color: isActive ? activeColor : colors.textMuted,
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {swatch}
      <Text style={{ fontSize: 10, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}
