"use client";

import { useState } from "react";
import {
  getWeightForAge,
  getHeightForAge,
  type GrowthDataPoint,
} from "@/lib/who-growth-data";

type GrowthRecord = {
  id: string;
  measured_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  head_cm: number | null;
  notes: string | null;
};

type Props = {
  records: GrowthRecord[];
  birthDate: string; // YYYY-MM-DD
  childName: string;
};

type Metric = "weight" | "height";
type Sex = "M" | "F";

// Chart dimensions
const CHART_W = 360;
const CHART_H = 240;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 32;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function monthsBetween(birth: string, date: string): number {
  const b = new Date(birth + "T12:00:00");
  const d = new Date(date + "T12:00:00");
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
  maxMonth: number
): string {
  return data
    .filter((d) => d.month <= maxMonth)
    .map((d, i) => {
      const x = xScale(d.month);
      const y = yScale(d[key] as number);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function buildAreaPath(
  data: GrowthDataPoint[],
  keyTop: keyof GrowthDataPoint,
  keyBot: keyof GrowthDataPoint,
  xScale: (m: number) => number,
  yScale: (v: number) => number,
  maxMonth: number
): string {
  const filtered = data.filter((d) => d.month <= maxMonth);
  if (filtered.length === 0) return "";
  const top = filtered.map(
    (d, i) =>
      `${i === 0 ? "M" : "L"}${xScale(d.month)},${yScale(d[keyTop] as number)}`
  );
  const bot = [...filtered]
    .reverse()
    .map(
      (d, i) =>
        `${i === 0 ? "L" : "L"}${xScale(d.month)},${yScale(d[keyBot] as number)}`
    );
  return top.join(" ") + " " + bot.join(" ") + " Z";
}

export default function GrowthChart({ records, birthDate, childName }: Props) {
  const [metric, setMetric] = useState<Metric>("weight");
  const [sex, setSex] = useState<Sex>("M");

  const whoData =
    metric === "weight" ? getWeightForAge(sex) : getHeightForAge(sex);

  // Compute child data points
  const childPoints = records
    .map((r) => ({
      month: monthsBetween(birthDate, r.measured_date),
      value: metric === "weight" ? r.weight_kg : r.height_cm,
      date: r.measured_date,
    }))
    .filter((p) => p.value != null && p.month >= 0)
    .sort((a, b) => a.month - b.month) as {
    month: number;
    value: number;
    date: string;
  }[];

  // Determine X axis range
  const childMaxMonth = childPoints.length > 0 ? Math.max(...childPoints.map((p) => p.month)) : 0;
  const maxMonth = Math.max(12, Math.min(60, Math.ceil(childMaxMonth / 6) * 6 + 6));

  // Y axis range from WHO data
  const relevantWho = whoData.filter((d) => d.month <= maxMonth);
  const yMin =
    Math.floor(Math.min(...relevantWho.map((d) => d.p3)) / (metric === "weight" ? 1 : 5)) *
    (metric === "weight" ? 1 : 5);
  const yMaxWho = Math.max(...relevantWho.map((d) => d.p97));
  const childMax = childPoints.length > 0 ? Math.max(...childPoints.map((p) => p.value)) : 0;
  const yMax =
    Math.ceil(Math.max(yMaxWho, childMax) / (metric === "weight" ? 2 : 10)) *
    (metric === "weight" ? 2 : 10) +
    (metric === "weight" ? 1 : 5);

  // Scale functions
  const xScale = (m: number) => PAD_L + (m / maxMonth) * PLOT_W;
  const yScale = (v: number) => PAD_T + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  // Grid lines
  const yStep = metric === "weight" ? 2 : 10;
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += yStep) yTicks.push(v);

  const xStep = maxMonth <= 12 ? 2 : maxMonth <= 24 ? 3 : 6;
  const xTicks: number[] = [];
  for (let m = 0; m <= maxMonth; m += xStep) xTicks.push(m);

  // Band area paths
  const areaRed1 = buildAreaPath(whoData, "p3", "p3", xScale, yScale, maxMonth); // below p3 border
  const areaYellow1 = buildAreaPath(whoData, "p15", "p3", xScale, yScale, maxMonth);
  const areaGreen = buildAreaPath(whoData, "p85", "p15", xScale, yScale, maxMonth);
  const areaYellow2 = buildAreaPath(whoData, "p97", "p85", xScale, yScale, maxMonth);

  // Percentile line paths
  const pLines: { key: keyof GrowthDataPoint; label: string; dash?: boolean }[] = [
    { key: "p3", label: "P3", dash: true },
    { key: "p15", label: "P15" },
    { key: "p50", label: "P50" },
    { key: "p85", label: "P85" },
    { key: "p97", label: "P97", dash: true },
  ];

  // Child data path
  const childPath =
    childPoints.length >= 2
      ? childPoints
          .map(
            (p, i) =>
              `${i === 0 ? "M" : "L"}${xScale(p.month)},${yScale(p.value)}`
          )
          .join(" ")
      : "";

  const firstName = childName.split(" ")[0];
  const unitLabel = metric === "weight" ? "kg" : "cm";

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <h2 className="text-sm font-semibold text-dark mb-3">
        Curva de Crescimento OMS
      </h2>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Metric toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => setMetric("weight")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              metric === "weight"
                ? "bg-white text-dark shadow-sm"
                : "text-muted hover:text-dark"
            }`}
          >
            Peso
          </button>
          <button
            onClick={() => setMetric("height")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              metric === "height"
                ? "bg-white text-dark shadow-sm"
                : "text-muted hover:text-dark"
            }`}
          >
            Altura
          </button>
        </div>

        {/* Sex toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => setSex("M")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              sex === "M"
                ? "bg-blue-100 text-blue-700 shadow-sm"
                : "text-muted hover:text-dark"
            }`}
          >
            Menino
          </button>
          <button
            onClick={() => setSex("F")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              sex === "F"
                ? "bg-pink-100 text-pink-700 shadow-sm"
                : "text-muted hover:text-dark"
            }`}
          >
            Menina
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="overflow-x-auto -mx-2 px-2">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full"
          style={{ minWidth: 320, maxWidth: 500 }}
        >
          {/* Background */}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={PLOT_W}
            height={PLOT_H}
            fill="#fafafa"
            rx={2}
          />

          {/* WHO colored bands */}
          {/* Below P3 is implicit (red background shown by default fafafa) */}
          <path d={areaYellow1} fill="#FEF3C7" opacity={0.7} />
          <path d={areaGreen} fill="#D1FAE5" opacity={0.6} />
          <path d={areaYellow2} fill="#FEF3C7" opacity={0.7} />

          {/* Grid lines */}
          {yTicks.map((v) => (
            <g key={`y-${v}`}>
              <line
                x1={PAD_L}
                y1={yScale(v)}
                x2={PAD_L + PLOT_W}
                y2={yScale(v)}
                stroke="#e5e7eb"
                strokeWidth={0.5}
              />
              <text
                x={PAD_L - 4}
                y={yScale(v) + 3}
                textAnchor="end"
                fill="#9ca3af"
                fontSize={8}
              >
                {v}
              </text>
            </g>
          ))}
          {xTicks.map((m) => (
            <g key={`x-${m}`}>
              <line
                x1={xScale(m)}
                y1={PAD_T}
                x2={xScale(m)}
                y2={PAD_T + PLOT_H}
                stroke="#e5e7eb"
                strokeWidth={0.5}
              />
              <text
                x={xScale(m)}
                y={PAD_T + PLOT_H + 14}
                textAnchor="middle"
                fill="#9ca3af"
                fontSize={8}
              >
                {m}m
              </text>
            </g>
          ))}

          {/* Percentile lines */}
          {pLines.map(({ key, label, dash }) => {
            const path = buildPath(whoData, key, xScale, yScale, maxMonth);
            const lastPt = relevantWho[relevantWho.length - 1];
            return (
              <g key={key}>
                <path
                  d={path}
                  fill="none"
                  stroke={
                    key === "p50"
                      ? "#059669"
                      : key === "p15" || key === "p85"
                        ? "#D97706"
                        : "#EF4444"
                  }
                  strokeWidth={key === "p50" ? 1.2 : 0.8}
                  strokeDasharray={dash ? "3,3" : undefined}
                  opacity={0.7}
                />
                {lastPt && (
                  <text
                    x={xScale(lastPt.month) + 2}
                    y={yScale(lastPt[key] as number) + 3}
                    fill="#9ca3af"
                    fontSize={6}
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Child data line */}
          {childPath && (
            <path
              d={childPath}
              fill="none"
              stroke={sex === "M" ? "#2563EB" : "#DB2777"}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Child data points */}
          {childPoints.map((p, i) => (
            <g key={i}>
              <circle
                cx={xScale(p.month)}
                cy={yScale(p.value)}
                r={4}
                fill="white"
                stroke={sex === "M" ? "#2563EB" : "#DB2777"}
                strokeWidth={2}
              />
              <circle
                cx={xScale(p.month)}
                cy={yScale(p.value)}
                r={2}
                fill={sex === "M" ? "#2563EB" : "#DB2777"}
              />
            </g>
          ))}

          {/* Axis labels */}
          <text
            x={PAD_L + PLOT_W / 2}
            y={CHART_H - 2}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={9}
          >
            Idade (meses)
          </text>
          <text
            x={8}
            y={PAD_T + PLOT_H / 2}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={9}
            transform={`rotate(-90, 8, ${PAD_T + PLOT_H / 2})`}
          >
            {metric === "weight" ? "Peso (kg)" : "Altura (cm)"}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm bg-emerald-200" />
          Normal (P15-P85)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm bg-amber-100" />
          Atencao (P3-P15 / P85-P97)
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5 rounded"
            style={{
              backgroundColor: sex === "M" ? "#2563EB" : "#DB2777",
            }}
          />
          {firstName}
        </span>
      </div>

      {/* Info about empty data */}
      {childPoints.length === 0 && (
        <p className="text-xs text-muted text-center mt-3">
          Registre medidas de {metric === "weight" ? "peso" : "altura"} para
          ver os dados de {firstName} no grafico.
        </p>
      )}
    </div>
  );
}
