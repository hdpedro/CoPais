"use client";

/**
 * SplitDayArc (PWA) — "Dois Fios": arco do dia para ROTINA DIVIDIDA (filhos com
 * responsáveis diferentes). Paridade com o native
 * (`kindar-native/app/_src/components/SplitDayArc.tsx`): MESMA geometria
 * (bezier quad + de Casteljau na passagem) e cores; só a apresentação troca
 * react-native-svg por SVG do DOM (Regra 19).
 *
 * Cada fio = um grupo de filho(s) sob o mesmo responsável. Cor = responsável
 * (você=sálvia, coparente=terracota). Passagem (leva ≠ busca) → fio bicolor +
 * contas 🚗/🏠. Eventos viram contas no fio do filho. Sol do "agora" cruza.
 */

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import type { RoutineHeroEntry } from "@/lib/care-routine-resolve";

export interface ArcChildEvent {
  min: number;
  category: string;
  label: string;
  time: string;
}

const DAY_START = 6 * 60;
const DAY_END = 21 * 60;
const X0 = 10;
const X1 = 590;
const XMID = (X0 + X1) / 2;
const ARC_CTRL = 28;
const ME = "#7FC4AC";
const OTHER = "#E7AE80";

const CATEGORY_ICON: Record<string, string> = {
  sport: "⚽", school: "🎒", health: "🏥", party: "🎉", music: "🎵",
  art: "🎨", study: "📚", religious: "⛪", evento: "📅",
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const tOf = (min: number) => clamp01((min - DAY_START) / (DAY_END - DAY_START));
const fx = (min: number) => X0 + (X1 - X0) * tOf(min);
const fy = (min: number, yBase: number) => {
  const t = tOf(min);
  return yBase - 2 * t * (1 - t) * ARC_CTRL;
};
const toMin = (t: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
};
const iconFor = (c: string) => CATEGORY_ICON[c] ?? "📌";
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

interface Props {
  entries: RoutineHeroEntry[];
  eventsByChild: Record<string, ArcChildEvent[]>;
  nowMin: number | null;
  locale: string;
}

export default function SplitDayArc({ entries, eventsByChild, nowMin, locale }: Props) {
  const { t } = useI18n();

  const fmtTime = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (locale === "pt" || locale === "fr") return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
    try {
      return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: m === 0 ? undefined : "2-digit" }).format(
        new Date(2000, 0, 1, h, m),
      );
    } catch {
      return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
    }
  };

  const LANE_GAP = 58;
  const TOP = 26;
  const laneY = (i: number) => TOP + 18 + i * LANE_GAP;
  const N = entries.length;
  const H = TOP + 18 + (N - 1) * LANE_GAP + 34;
  const colorOf = (isMe?: boolean) => (isMe ? ME : OTHER);

  const moments: { min: number; text: string; sub: string | null }[] = [];
  for (const entry of entries) {
    const kids = entry.childNames.join(" e ");
    const d = toMin(entry.dropoff?.time ?? null);
    const p = toMin(entry.pickup?.time ?? null);
    if (d != null) moments.push({ min: d, text: `${t("careRoutine.dropoff")} · ${kids}`, sub: entry.dropoff?.responsibleName ?? null });
    if (p != null) moments.push({ min: p, text: `${t("careRoutine.pickup")} · ${kids}`, sub: entry.pickup?.responsibleName ?? null });
    for (const cid of entry.childIds) {
      for (const ev of eventsByChild[cid] ?? []) moments.push({ min: ev.min, text: `${ev.label} · ${kids}`, sub: ev.time });
    }
  }
  moments.sort((a, b) => a.min - b.min);
  const nextMoment = nowMin == null ? moments[0] : moments.find((m) => m.min >= nowMin) ?? null;

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <svg viewBox={`-10 -2 620 ${H}`} className="w-full h-auto" style={{ overflow: "visible" }}>
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
          const kids = entry.childNames.join(" e ");
          const childEvents = entry.childIds.flatMap((cid) => eventsByChild[cid] ?? []);
          const P0 = { x: X0, y: yBase };
          const P1 = { x: XMID, y: yBase - ARC_CTRL };
          const P2 = { x: X1, y: yBase };

          let lane: React.ReactNode;
          if (handoffMin != null) {
            const th = tOf(handoffMin);
            const Q1 = { x: lerp(P0.x, P1.x, th), y: lerp(P0.y, P1.y, th) };
            const Q2 = { x: lerp(P1.x, P2.x, th), y: lerp(P1.y, P2.y, th) };
            const R = { x: lerp(Q1.x, Q2.x, th), y: lerp(Q1.y, Q2.y, th) };
            lane = (
              <>
                <path d={`M ${P0.x} ${P0.y} Q ${Q1.x} ${Q1.y} ${R.x} ${R.y}`} fill="none" stroke={colorA} strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
                <path d={`M ${R.x} ${R.y} Q ${Q2.x} ${Q2.y} ${P2.x} ${P2.y}`} fill="none" stroke={colorB} strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
                <circle cx={R.x} cy={R.y} r={2.5} fill="#E9DECF" opacity={0.6} />
              </>
            );
          } else {
            lane = <path d={`M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`} fill="none" stroke={colorA} strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />;
          }

          return (
            <g key={entry.childIds.join("-") || i}>
              <circle cx={X0 + 1} cy={yBase - ARC_CTRL / 2 - 10} r={3} fill={colorA} />
              <text x={X0 + 9} y={yBase - ARC_CTRL / 2 - 6} fontSize={11} fontWeight={600} fill="#E9DECF">{kids}</text>
              {lane}
              {childEvents.map((ev, k) => {
                const em = Math.max(DAY_START, Math.min(DAY_END, ev.min));
                const ex = fx(em);
                const ey = fy(em, yBase);
                return (
                  <g key={`ev-${k}`}>
                    <text x={ex} y={ey - 13} textAnchor="middle" fontSize={9.5} fill="#CFE6DC">{fmtTime(ev.min)}</text>
                    <circle cx={ex} cy={ey} r={9} fill="#2A241D" stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
                    <text x={ex} y={ey + 4} textAnchor="middle" fontSize={11}>{iconFor(ev.category)}</text>
                  </g>
                );
              })}
              {dropMin != null ? (
                <g>
                  <circle cx={fx(dropMin)} cy={fy(dropMin, yBase)} r={8} fill="#2A241D" stroke={colorA} strokeWidth={1.5} />
                  <text x={fx(dropMin)} y={fy(dropMin, yBase) + 4} textAnchor="middle" fontSize={10}>🚗</text>
                  <text x={fx(dropMin)} y={fy(dropMin, yBase) + 21} textAnchor="middle" fontSize={9} fill="#A89A88">{fmtTime(dropMin)}</text>
                </g>
              ) : null}
              {pickMin != null ? (
                <g>
                  <circle cx={fx(pickMin)} cy={fy(pickMin, yBase)} r={8} fill="#2A241D" stroke={colorB} strokeWidth={1.5} />
                  <text x={fx(pickMin)} y={fy(pickMin, yBase) + 4} textAnchor="middle" fontSize={10}>🏠</text>
                  <text x={fx(pickMin)} y={fy(pickMin, yBase) + 21} textAnchor="middle" fontSize={9} fill="#A89A88">{fmtTime(pickMin)}</text>
                </g>
              ) : null}
            </g>
          );
        })}

        {nowMin != null ? (
          <g>
            <line x1={fx(nowMin)} y1={laneY(0) - 28} x2={fx(nowMin)} y2={laneY(N - 1) + 6} stroke="#F4B860" strokeWidth={1} opacity={0.28} />
            <circle cx={fx(nowMin)} cy={fy(nowMin, laneY(0))} r={11} fill="#E7AE80" opacity={0.16} />
            <circle cx={fx(nowMin)} cy={fy(nowMin, laneY(0))} r={6.4} fill="#F4B860" />
            <circle cx={fx(nowMin) - 2} cy={fy(nowMin, laneY(0)) - 2} r={1.8} fill="#FFF3E2" opacity={0.9} />
            <text x={Math.min(560, Math.max(40, fx(nowMin)))} y={laneY(0) - 30} textAnchor="middle" fontSize={10} fontWeight={700} fill="#E7AE80">{t("careRoutine.arcNow")}</text>
          </g>
        ) : null}

        <g>
          <text x={X0} y={H - 4} fontSize={10} fill="#A89A88">06h</text>
          <text x={fx(9 * 60)} y={H - 4} textAnchor="middle" fontSize={10} fill="#A89A88">{t("careRoutine.arcMorning")}</text>
          <text x={fx(15 * 60)} y={H - 4} textAnchor="middle" fontSize={10} fill="#A89A88">{t("careRoutine.arcAfternoon")}</text>
          <text x={fx(19.5 * 60)} y={H - 4} textAnchor="middle" fontSize={10} fill="#A89A88">{t("careRoutine.arcEvening")}</text>
          <text x={X1} y={H - 4} textAnchor="end" fontSize={10} fill="#A89A88">21h</text>
        </g>
      </svg>

      {nextMoment ? (
        <Link href="/calendario" prefetch={false} className="mt-2.5 flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3.5 py-3">
          <span className="text-[10px] tracking-wider text-[#9A8A77] font-semibold uppercase shrink-0">{t("careRoutine.nextMomentLabel")}</span>
          <span className="text-[21px] text-[#E7AE80] font-semibold">{fmtTime(nextMoment.min)}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[#F4ECE1] truncate">{nextMoment.text}</span>
            {nextMoment.sub ? <span className="block text-[11.5px] text-[#A89A88] truncate">{nextMoment.sub}</span> : null}
          </span>
          <span className="text-[#C9A98B]">›</span>
        </Link>
      ) : null}
    </div>
  );
}
