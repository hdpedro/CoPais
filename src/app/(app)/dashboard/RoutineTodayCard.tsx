"use client";

/**
 * Card "Hoje: quem leva · quem busca" do painel (Rotina de Leva & Busca).
 *
 * Pele PREMIUM (mockup do dono): card ESCURO + VOZ editorial em Cormorant
 * (nomes em terracota) que resume o dia — "Dia tranquilo. Fernanda leva as
 * crianças e Henrique busca." — em vez de linhas técnicas. Mantém as interações:
 *   - "Buscou?/Levou? Sim · Não" (registro otimista).
 *   - "Trocar hoje" (⇄): cria override pro outro responsável + ciência bilateral.
 *   - "Aguardando ciência" (criador) / "Confirmar" (destinatário).
 *
 * Voz compõe a partir das chaves i18n EXISTENTES (heroFullDay/heroDropoff/
 * heroPickup) com um sentinela pra colorir só o nome — sem chave nova.
 * NÃO toca no Herói de Guarda — bloco aditivo.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { INTL_LOCALE_MAP } from "@/lib/locale-utils";
import { createRoutineOverride, markRoutineOverrideRead, recordRoutineLog } from "@/actions/care-routine";
import type { RoutineToday, RoutineHeroEntry } from "@/lib/care-routine-resolve";
import type { JourneyItem } from "@/lib/care-routine-journey";

type Leg = "dropoff" | "pickup";

/** Contexto de GUARDA (pais separados): quando presente, o card vira o Herói
 *  de Guarda universal — voz com perspectiva ("com você até dom."), badge
 *  Guarda ativa, ritmo da semana colorido + contagem, próxima troca clicável.
 *  Contrato de não-regressão: preserva TUDO do herói de guarda antigo. */
export interface HeroCustodyContext {
  mode: "single" | "together" | "split";
  withName: string;
  withIsMe: boolean;
  kids: string[];
  untilLabel: string | null;
  /** Troca acontecendo hoje (handover dateKey = hoje/amanhã cedo). */
  handoff: { name: string; isMe: boolean } | null;
  /** Só no mode split: grupos por responsável (cores preservadas). */
  groups?: { name: string; isMe: boolean; colorHex: string; kids: string[] }[];
  streakDays: number;
  streakTotal: number;
  /** Ritmo da semana (restaura a Semana Colorida): 7 dias com cor da guarda. */
  week: { label: string; color: string | null; isToday: boolean }[];
  nextSwap: { dateLabel: string; dateKey: string; name: string; isMine: boolean } | null;
}

/** Contexto de DIA EM FAMÍLIA (intacta/solo): sem guarda nem leva/busca, mas
 *  o dia tem evento → o Arco do Dia lidera assim mesmo, com voz de presença
 *  ("{filhos} com vocês hoje") em vez da linguagem de revezamento. "O herói é
 *  bonito demais pra ficar escondido" (dono 13/jun). */
export interface HeroFamilyDayContext {
  mode: "together" | "single";
  /** Primeiros nomes dos filhos, pra voz de presença. Vazio → voz calma. */
  kids: string[];
}

/** Sentinela (char de controle improvável num nome) que envolve {name} pra
 *  a voz partir e colorir só o nome, reusando as chaves i18n existentes. */
const NAME_MARK = String.fromCharCode(1);

interface RoutineTodayCardProps {
  routineToday: RoutineToday;
  arrangement: "rotating" | "together" | "single" | "custom";
  hasRoutineSlots: boolean;
  groupId: string;
  todayDate: string;
  caregivers: { id: string; name: string }[];
  awaitingTheirAck: boolean;
  pendingAck: { fromName: string; overrideIds: string[] } | null;
  logsToday: Record<string, "done" | "missed">;
  tomorrowSummary: string | null;
  /** true quando nada exige você hoje → acende a voz "Dia tranquilo." */
  dayCalm: boolean;
  /** Jornada compacta do dia (casa → leva → atividades → busca) pro card dark. */
  heroTimeline: JourneyItem[];
  /** SÓ pro playground /prototipo/heroi: congela o relógio num minuto do dia
   *  (simulação de cenários). Em produção fica undefined → relógio do device. */
  simulateNowMin?: number | null;
  /** Pais separados: o card vira o Herói de Guarda universal. */
  custodyContext?: HeroCustodyContext | null;
  /** Família intacta/solo sem rotina: o arco lidera com voz de presença. */
  familyDayContext?: HeroFamilyDayContext | null;
}

export default function RoutineTodayCard({
  routineToday,
  hasRoutineSlots,
  groupId,
  todayDate,
  caregivers,
  awaitingTheirAck,
  pendingAck,
  logsToday,
  tomorrowSummary,
  dayCalm,
  heroTimeline,
  simulateNowMin = null,
  custodyContext = null,
  familyDayContext = null,
}: RoutineTodayCardProps) {
  const { t, locale } = useI18n();
  const intlLocale = INTL_LOCALE_MAP[locale] ?? "pt-BR";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  // Feedback OTIMISTA do "Buscou?/Levou?": marca na hora (o refresh confirma).
  const [optimisticLogs, setOptimisticLogs] = useState<Record<string, "done" | "missed">>({});

  // Lista localizada ("Otto e Martim" / "Otto and Martim") — Regra Canônica 8.
  const kidsLabel = (names: string[]) =>
    names.length ? new Intl.ListFormat(intlLocale, { type: "conjunction" }).format(names) : "";

  // Só dá pra "trocar" quando há exatamente 2 cuidadores (passa pro outro).
  const canSwap = caregivers.length === 2;
  const otherThan = (responsibleId: string) => caregivers.find((c) => c.id !== responsibleId)?.id ?? null;

  function handleSwap(childIds: string[], legs: Leg[], currentResponsibleId: string) {
    const target = otherThan(currentResponsibleId);
    if (!target) return;
    setError("");
    startTransition(async () => {
      for (const childId of childIds) {
        for (const leg of legs) {
          const fd = new FormData();
          fd.set("groupId", groupId);
          fd.set("childId", childId);
          fd.set("occurrenceDate", todayDate);
          fd.set("leg", leg);
          fd.set("responsibleId", target);
          const res = await createRoutineOverride(fd);
          if (res?.error) {
            setError(typeof res.error === "string" ? res.error : t("careRoutine.swapError"));
            return;
          }
        }
      }
      router.refresh();
    });
  }

  function handleConfirmAck() {
    if (!pendingAck) return;
    setError("");
    startTransition(async () => {
      for (const id of pendingAck.overrideIds) {
        await markRoutineOverrideRead(id);
      }
      router.refresh();
    });
  }

  function handleLog(childIds: string[], leg: Leg, status: "done" | "missed") {
    setError("");
    const keys = childIds.map((c) => `${c}:${leg}`);
    setOptimisticLogs((prev) => {
      const next = { ...prev };
      keys.forEach((k) => (next[k] = status));
      return next;
    });
    startTransition(async () => {
      for (const childId of childIds) {
        const fd = new FormData();
        fd.set("groupId", groupId);
        fd.set("childId", childId);
        fd.set("occurrenceDate", todayDate);
        fd.set("leg", leg);
        fd.set("status", status);
        const res = await recordRoutineLog(fd);
        if (res?.error) {
          setOptimisticLogs((prev) => {
            const next = { ...prev };
            keys.forEach((k) => delete next[k]);
            return next;
          });
          setError(typeof res.error === "string" ? res.error : t("careRoutine.swapError"));
          return;
        }
      }
      router.refresh();
    });
  }

  // Relógio do DEVICE (não do server): o SSR roda em UTC (3h à frente do BR)
  // e o navegador preserva os atributos do server na hydration — os estados
  // de hora ficavam imprecisos (visto pelo dono 10/jun). null no SSR → tudo
  // neutro; acende no mount e atualiza a cada minuto.
  const [clockMin, setClockMin] = useState<number | null>(null);
  useEffect(() => {
    if (simulateNowMin != null) return; // playground: relógio congelado via prop
    const update = () => {
      const d = new Date();
      // Virou o dia com a aba aberta → os dados do server são de ontem;
      // recarrega em vez de mostrar as estações de ontem como futuras.
      if (d.toLocaleDateString("sv-SE") !== todayDate) {
        router.refresh();
        return;
      }
      setClockMin(d.getHours() * 60 + d.getMinutes());
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [simulateNowMin, todayDate, router]);
  const nowMin = simulateNowMin ?? clockMin;

  // "Buscou?/Levou?" — só pra pernas já passadas e ainda não registradas.
  const isPast = (time: string | null) => {
    if (nowMin == null) return false;
    if (!time) return true;
    const [h, m] = time.split(":").map(Number);
    return h * 60 + (m || 0) <= nowMin;
  };
  const aggStatus = (childIds: string[], leg: Leg): "done" | "missed" | "none" => {
    const ss = childIds.map((c) => optimisticLogs[`${c}:${leg}`] ?? logsToday[`${c}:${leg}`]);
    if (ss.length > 0 && ss.every((s) => s === "done")) return "done";
    if (ss.length > 0 && ss.every((s) => s === "missed")) return "missed";
    return "none";
  };

  // Linha de ação (dark): "Buscou? Sim · Não" / "✓ feito" + "⇄ Trocar hoje".
  const actionRow = (entry: RoutineHeroEntry) => {
    const status = aggStatus(entry.childIds, "pickup");
    const past = isPast(entry.pickup?.time ?? entry.dropoff?.time ?? null);
    const swapResp = entry.dropoff?.responsibleId ?? entry.pickup?.responsibleId;
    return (
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        {/* "Buscou?" só faz sentido com handoff real — numa rotina "dia todo"
            (mesmo responsável nas 2 pernas) não houve busca, então some. */}
        {entry.sameAllDay ? null : status === "done" ? (
          <span className="text-[12px] text-[#7FBE9C] font-medium">{t("careRoutine.heroDone")}</span>
        ) : status === "missed" ? (
          <span className="text-[12px] text-[#A89A88]">{t("careRoutine.missedShort")}</span>
        ) : past ? (
          <span className="flex items-center gap-2.5">
            <span className="text-[12px] text-[#A89A88]">{t("careRoutine.didPickup")}</span>
            <button type="button" disabled={isPending} onClick={() => handleLog(entry.childIds, "pickup", "done")} className="text-[12px] font-semibold text-[#7FBE9C] disabled:opacity-40">
              {t("careRoutine.yes")}
            </button>
            <button type="button" disabled={isPending} onClick={() => handleLog(entry.childIds, "pickup", "missed")} className="text-[12px] font-medium text-[#A89A88] disabled:opacity-40">
              {t("careRoutine.no")}
            </button>
          </span>
        ) : null}
        {canSwap && swapResp ? (
          <button
            type="button"
            onClick={() => handleSwap(entry.childIds, ["dropoff", "pickup"], swapResp)}
            disabled={isPending}
            title={t("careRoutine.swapTodayCta")}
            className="ml-auto text-[12px] font-medium text-[#C9A98B] hover:text-[#E3C9AC] disabled:opacity-40 flex-shrink-0"
          >
            ⇄ {t("careRoutine.swapTodayCta")}
          </button>
        ) : null}
      </div>
    );
  };

  // Empty-state: ensina + CTA pro editor (claro — é estado de ativação).
  // NUNCA no modo guarda nem no dia em família: ambos exibem o arco mesmo sem
  // rotina de leva/busca configurada.
  if (!custodyContext && !familyDayContext && (!hasRoutineSlots || routineToday.mode === "none")) {
    return (
      <Link href="/calendario/rotina" prefetch={false} className="block">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-[#5B9E85]/40 transition-colors">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#5B9E85]/10 flex items-center justify-center text-xl flex-shrink-0">🚗</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-semibold text-[#2C2C2C]">{t("careRoutine.activationTitle")}</h3>
              <p className="text-[12px] text-[#7A8C8B] mt-0.5">{t("careRoutine.title")}</p>
            </div>
            <span className="text-[12px] font-semibold text-[#5B9E85] flex-shrink-0 mt-1">{t("careRoutine.activationCta")}</span>
          </div>
        </div>
      </Link>
    );
  }

  // Voz: colore só o NOME, reusando as chaves existentes via NAME_MARK.
  const vozColor = (s: string) => {
    const p = s.split(NAME_MARK);
    return p.length === 3 ? (
      <>
        {p[0]}
        <span className="text-[#E7AE80] font-medium">{p[1]}</span>
        {p[2]}
      </>
    ) : (
      s
    );
  };
  const mark = (name: string) => NAME_MARK + name + NAME_MARK;
  const vozLine = (entry: RoutineHeroEntry) => {
    const kids = kidsLabel(entry.childNames);
    if (entry.sameAllDay && entry.dropoff) {
      return vozColor(t("careRoutine.heroFullDay", { name: mark(entry.dropoff.responsibleName), kids }));
    }
    return (
      <>
        {entry.dropoff ? vozColor(t("careRoutine.heroDropoff", { name: mark(entry.dropoff.responsibleName), kids })) : null}
        {entry.dropoff && entry.pickup ? <span className="text-[#8A7A6A]"> · </span> : null}
        {entry.pickup
          ? vozColor(
              entry.pickup.time
                ? t("careRoutine.heroPickupAt", { name: mark(entry.pickup.responsibleName), kids, time: entry.pickup.time.slice(0, 5) })
                : t("careRoutine.heroPickup", { name: mark(entry.pickup.responsibleName), kids }),
            )
          : null}
      </>
    );
  };

  // Label curto pro timeline (coluna estreita): corta no 1º separador (": ",
  // " - ", " · ") pra mostrar o título principal sem truncar no meio da palavra.
  const shortLabel = (s: string) => s.split(/:\s|\s[–·-]\s/)[0].trim();

  // ——— ARCO DO DIA (mockup do dono): trajetória de sol 06h→21h. ———
  // Estações com horário viram pontos NO arco (agrupadas quando coincidem);
  // o sol marca "agora"; percorrido sólido, futuro tracejado.
  const DAY_START = 6 * 60;
  const DAY_END = 21 * 60;
  const arcStations = (() => {
    // Cluster pela posição CLAMPADA na janela 06h–21h (auditoria #1): itens
    // fora da janela (05:30, 22:00…) fundem num só bead de borda com contador,
    // em vez de empilharem por cima das âncoras de casa.
    const map = new Map<number, { time: string; min: number; items: typeof heroTimeline }>();
    for (const it of heroTimeline) {
      if (!it.time) continue;
      const [h, m] = it.time.split(":").map(Number);
      if (Number.isNaN(h)) continue;
      const rawMin = h * 60 + (m || 0);
      const min = Math.max(DAY_START, Math.min(DAY_END, rawMin));
      const c = map.get(min) ?? { time: it.time, min, items: [] as typeof heroTimeline };
      c.items.push(it);
      map.set(min, c);
    }
    return [...map.values()].sort((a, b) => a.min - b.min);
  })();
  // Bezier quadrática com controle no meio ⇒ x é LINEAR no parâmetro t
  // (t = fração do dia), então posicionar por horário é exato.
  const arcF = (min: number) => Math.min(1, Math.max(0, (min - DAY_START) / (DAY_END - DAY_START)));
  const arcX = (f: number) => 10 + 580 * f;
  const arcY = (f: number) => 86 - 256 * f + 256 * f * f;
  // Estações usam um leve inset nas pontas pra nunca cobrirem as âncoras de
  // casa (auditoria #12); sol e casas usam a faixa completa.
  const arcFStation = (min: number) => Math.min(0.97, Math.max(0.03, arcF(min)));
  const nowF = nowMin == null ? null : arcF(nowMin);
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  const AP0 = { x: 10, y: 86 };
  const AC = { x: 300, y: -42 };
  const AP2 = { x: 590, y: 86 };
  // de Casteljau: divide o arco em percorrido (sólido) + futuro (tracejado).
  const splitT = nowF ?? 0;
  const AQ1 = { x: lerp(AP0.x, AC.x, splitT), y: lerp(AP0.y, AC.y, splitT) };
  const AQ2 = { x: lerp(AC.x, AP2.x, splitT), y: lerp(AC.y, AP2.y, splitT) };
  const AR = { x: lerp(AQ1.x, AQ2.x, splitT), y: lerp(AQ1.y, AQ2.y, splitT) };
  // Hora compacta do arco por locale (Regra Canônica 8): pt/fr mantêm o
  // estilo de marca "16h30"; demais via Intl (en → "4:30 PM", de → "16:30").
  const fmtArcTime = (tm: string) => {
    const [hs, ms] = tm.split(":");
    const h = parseInt(hs, 10);
    const m = parseInt(ms ?? "0", 10) || 0;
    if (locale === "pt" || locale === "fr") return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
    return new Intl.DateTimeFormat(intlLocale, { hour: "numeric", minute: m === 0 ? undefined : "2-digit" }).format(
      new Date(2000, 0, 1, h, m),
    );
  };
  // Hora "cheia" (Próximo momento): 24h nos locales 24h; Intl pro inglês.
  const fmtClock = (tm: string) => {
    if (locale !== "en") return tm.slice(0, 5);
    const [hs, ms] = tm.split(":");
    return new Intl.DateTimeFormat(intlLocale, { hour: "numeric", minute: "2-digit" }).format(
      new Date(2000, 0, 1, parseInt(hs, 10), parseInt(ms ?? "0", 10) || 0),
    );
  };
  // Próximo momento: o primeiro CLUSTER ainda por vir (SSR: o primeiro).
  const nextCluster = (() => {
    if (arcStations.length === 0) return null;
    if (nowMin == null) return arcStations[0];
    return arcStations.find((s) => s.min > nowMin) ?? null;
  })();
  // "Sempre clicável": atividade → detalhe relatável; evento → o EVENTO no
  // calendário (deep-link day+eventId); casa → o dia; leva/busca → rotina.
  const hrefForStation = (it: (typeof heroTimeline)[number]) =>
    it.kind === "activity"
      ? it.activityId
        ? `/atividades/${it.activityId}`
        : it.eventId
          ? `/calendario?day=${todayDate}&eventId=${it.eventId}`
          : `/calendario?day=${todayDate}`
      : it.kind === "home"
        ? `/calendario?day=${todayDate}`
        : "/calendario/rotina";
  // Rótulos do arco (os dizeres da linha antiga): nome + responsável sob cada
  // ponto, com zigzag automático quando estações ficam próximas. Clique:
  // 1 item → destino dele; 2+ no mesmo horário → /jornada (lista o dia).
  const arcLabeled = (() => {
    const lastXAtLevel = [-999, -999];
    const hasHomeAm = heroTimeline.some((i) => i.key === "home-am");
    const hasHomePm = heroTimeline.some((i) => i.key === "home-pm");
    return arcStations.map((c) => {
      const x = arcX(arcFStation(c.min));
      // Nível 0 → nível 1 (zigzag) → SEM dizeres (só a hora): com 3+ estações
      // apertadas, texto embolado é pior que menos texto (achado S1/S7/S8 do
      // playground). O nome completo segue no tooltip e no Próximo momento.
      const g0 = x - lastXAtLevel[0];
      const g1 = x - lastXAtLevel[1];
      let level = 0;
      let showLabels = true;
      if (g0 < 92) {
        if (g1 >= 92) level = 1;
        else if (Math.max(g0, g1) >= 50) level = g0 >= g1 ? 0 : 1;
        else showLabels = false;
      }
      // Estação colada numa casa NOMEADA: dizeres descem um nível pra não
      // pintar por cima do "🏠 Nome" (colisão vista pelo dono, 11/jun).
      if (showLabels && level === 0 && ((hasHomeAm && x < 118) || (hasHomePm && x > 482))) {
        level = 1;
      }
      if (showLabels) lastXAtLevel[level] = x;
      const names = c.items.map((i) => shortLabel(i.text)).join(" + ");
      const resps = [...new Set(c.items.map((i) => i.responsible).filter((r): r is string => !!r))];
      return {
        c,
        x,
        level,
        showLabels,
        // Truncamento por code point (emoji não é cortado ao meio — aud. #25).
        display: [...names].length > 17 ? `${[...names].slice(0, 16).join("")}…` : names,
        fullNames: names,
        resp: resps.length === 1 ? resps[0] : null,
        href: c.items.length === 1 ? hrefForStation(c.items[0]) : "/jornada",
      };
    });
  })();
  const homeAm = heroTimeline.find((i) => i.key === "home-am") ?? null;
  const homePm = heroTimeline.find((i) => i.key === "home-pm") ?? null;
  const dayMoving = nowMin != null && arcStations.length > 0 && nowMin >= arcStations[0].min;

  return (
    <div
      className="rounded-2xl p-5 shadow-sm text-[#EFE7DC]"
      style={{ background: "linear-gradient(157deg, #2E2823 0%, #211C18 100%)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#B79B7E] font-semibold flex-shrink-0">
            <span aria-hidden="true">📍 </span>
            {t("careRoutine.todayHeading")}
          </h3>
          {/* Badge "Guarda ativa" — preservado do herói antigo (decisão do dono). */}
          {custodyContext && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold bg-white/10 rounded-full px-2.5 py-[3px] text-[#D9E4D9] flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
              {t("dashboard.activeCustody")}
            </span>
          )}
        </div>
        {custodyContext ? (
          <Link href="/calendario/escala" prefetch={false} className="text-[12px] font-medium text-[#C9A98B] hover:text-[#E3C9AC] flex-shrink-0">
            {t("careRoutine.editScheduleCta")}
          </Link>
        ) : (
          <Link href="/calendario/rotina" prefetch={false} className="text-[12px] font-medium text-[#C9A98B] hover:text-[#E3C9AC] flex-shrink-0">
            {/* Sem rotina montada (dia em família) → convida a montar; senão edita. */}
            {hasRoutineSlots ? t("careRoutine.editCta") : t("careRoutine.activationCta")}
          </Link>
        )}
      </div>

      {/* Destinatário: alguém trocou e eu ainda não dei ciência */}
      {pendingAck && (
        <div className="mb-3.5 rounded-xl bg-[#E8A228]/[0.14] border border-[#E8A228]/30 px-3 py-2.5 flex items-center gap-2">
          <span className="text-[13px] text-[#F4ECE1] flex-1">{t("careRoutine.changedToday", { name: pendingAck.fromName })}</span>
          <button
            type="button"
            onClick={handleConfirmAck}
            disabled={isPending}
            className="text-[12px] font-semibold text-[#211C18] bg-[#E8A228] rounded-lg px-3 py-1.5 disabled:opacity-50 flex-shrink-0"
          >
            {isPending ? t("careRoutine.confirming") : t("careRoutine.confirm")}
          </button>
        </div>
      )}

      {/* VOZ — editorial, Cormorant, nomes em terracota. */}
      <div className="mb-1">
        {/* calmTitle só quando NÃO há voz de família (senão a linha de presença
            já é o cabeçalho do dia). */}
        {dayCalm && !familyDayContext && (
          <p className="font-display text-[21px] leading-[1.12] text-[#F4ECE1]">{t("briefing.calmTitle")}</p>
        )}
        {familyDayContext && routineToday.entries.length === 0 ? (
          /* DIA EM FAMÍLIA (intacta/solo): voz de presença, sem revezamento. */
          <p className="font-display text-[21px] leading-[1.25] text-[#E9DECF] mt-1">
            {familyDayContext.kids.length
              ? t(
                  familyDayContext.mode === "single"
                    ? "careRoutine.heroFamilySingle"
                    : "careRoutine.heroFamilyTogether",
                  { kids: kidsLabel(familyDayContext.kids) },
                )
              : t("briefing.calmTitle")}
          </p>
        ) : custodyContext ? (
          /* GUARDA (pais separados): com quem estão, até quando, perspectiva. */
          custodyContext.mode === "split" && custodyContext.groups ? (
            <div className="space-y-1.5 mt-1">
              {custodyContext.groups.map((g, i) => (
                <p key={i} className="font-display text-[19px] leading-[1.32] text-[#E9DECF] flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.colorHex }} aria-hidden="true" />
                  <span className="min-w-0">
                    {vozColor(
                      g.isMe
                        ? t("careRoutine.heroCustodyWithYou", { kids: kidsLabel(g.kids), count: g.kids.length })
                        : t("careRoutine.heroCustodyWithOther", { kids: kidsLabel(g.kids), name: mark(g.name), count: g.kids.length }),
                    )}
                  </span>
                </p>
              ))}
            </div>
          ) : (
            <p className="font-display text-[21px] leading-[1.25] text-[#E9DECF] mt-1">
              {vozColor(
                custodyContext.withIsMe
                  ? t("careRoutine.heroCustodyWithYou", { kids: kidsLabel(custodyContext.kids), count: custodyContext.kids.length })
                  : t("careRoutine.heroCustodyWithOther", {
                      kids: kidsLabel(custodyContext.kids),
                      name: mark(custodyContext.withName),
                      count: custodyContext.kids.length,
                    }),
              )}
              {custodyContext.handoff ? (
                <>
                  <span className="text-[#8A7A6A]"> — </span>
                  {vozColor(
                    custodyContext.handoff.isMe
                      ? t("careRoutine.heroCustodyHandoffToYou")
                      : t("careRoutine.heroCustodyHandoffToOther", { name: mark(custodyContext.handoff.name) }),
                  )}
                </>
              ) : custodyContext.untilLabel ? (
                <span className="text-[#C9B79F]"> {t("careRoutine.heroCustodyUntil", { date: custodyContext.untilLabel })}</span>
              ) : null}
            </p>
          )
        ) : (
          <div className="space-y-2.5 mt-1">
            {routineToday.entries.map((entry, i) => (
              <div key={i}>
                <p className="font-display text-[19px] leading-[1.32] text-[#E9DECF]">{vozLine(entry)}</p>
                {actionRow(entry)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ARCO DO DIA — trajetória de sol 06h→21h (mockup do dono): percorrido
          sólido em terracota, futuro tracejado, sol em "agora", estações
          agrupadas por horário (contador quando 2+ no mesmo minuto). */}
      {/* O arco aparece SEMPRE que o herói aparece: mesmo num dia sem horários
          marcados, as casas e o sol mantêm o dia vivo (feedback 10/jun). No dia
          em família 100% vazio (sem evento) o arco fica só com o sol na
          trajetória — "o herói é bonito demais pra ficar escondido" (13/jun). */}
      {(heroTimeline.length > 0 || familyDayContext) && (
        <div className="mt-4 pt-3 border-t border-white/10">
          {/* SEM aria-hidden: há links reais dentro (auditoria #8/#18) —
              o decorativo (trilho/eixo) é que recebe aria-hidden. */}
          <svg viewBox="0 0 600 112" className="w-full h-auto" style={{ overflow: "visible" }}>
            <defs>
              {/* Sol esférico: núcleo quente deslocado (luz vindo de cima) */}
              <radialGradient id="arcSun" cx="38%" cy="32%" r="75%">
                <stop offset="0%" stopColor="#FFE9CF" />
                <stop offset="45%" stopColor="#F0B988" />
                <stop offset="100%" stopColor="#D08A55" />
              </radialGradient>
              {/* Contas das estações com volume (highlight no topo-esquerda) */}
              <radialGradient id="arcBead" cx="35%" cy="30%" r="80%">
                <stop offset="0%" stopColor="#564B3F" />
                <stop offset="100%" stopColor="#26211C" />
              </radialGradient>
              {/* Trilho percorrido acende em direção ao sol */}
              <linearGradient id="arcTrailGrad" gradientUnits="userSpaceOnUse" x1={AP0.x} y1="0" x2={arcX(nowF ?? 0)} y2="0">
                <stop offset="0%" stopColor="rgba(201,165,115,0.30)" />
                <stop offset="70%" stopColor="#C9A573" />
                <stop offset="100%" stopColor="#F0B988" />
              </linearGradient>
              {/* Luz de amanhecer sob o trecho já percorrido */}
              <linearGradient id="arcSkyGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(231,174,128,0.16)" />
                <stop offset="100%" stopColor="rgba(231,174,128,0)" />
              </linearGradient>
              <filter id="arcGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
              {/* Relevo: sombra curta projetada pelo trilho/contas */}
              <filter id="arcLift" x="-30%" y="-30%" width="160%" height="180%">
                <feDropShadow dx="0" dy="1.4" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.45" />
              </filter>
            </defs>
            {nowF != null && nowF > 0 ? (
              <>
                <path d={`M ${AP0.x} ${AP0.y} Q ${AQ1.x} ${AQ1.y} ${AR.x} ${AR.y} L ${AR.x} 86 Z`} fill="url(#arcSkyGlow)" stroke="none" />
                <path
                  d={`M ${AP0.x} ${AP0.y} Q ${AQ1.x} ${AQ1.y} ${AR.x} ${AR.y}`}
                  fill="none"
                  stroke="url(#arcTrailGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  filter="url(#arcLift)"
                />
                <path
                  d={`M ${AR.x} ${AR.y} Q ${AQ2.x} ${AQ2.y} ${AP2.x} ${AP2.y}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.30)"
                  strokeWidth="1.5"
                  strokeDasharray="2 6"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <path
                d={`M ${AP0.x} ${AP0.y} Q ${AC.x} ${AC.y} ${AP2.x} ${AP2.y}`}
                fill="none"
                stroke="rgba(255,255,255,0.30)"
                strokeWidth="1.5"
                strokeDasharray="2 6"
                strokeLinecap="round"
              />
            )}
            {/* (Casas renderizadas DEPOIS do sol — nomes nunca ficam sob o halo.) */}
            {arcLabeled.map(({ c, x, level, showLabels, display, fullNames, resp, href }) => {
              const f = arcFStation(c.min);
              const y = arcY(f);
              const passed = nowMin != null && c.min <= nowMin;
              // Clamp ANTES do offset de nível — preserva a separação do
              // zigzag mesmo nas bordas do arco (auditoria #6).
              const nameY = Math.min(y + 21, 76) + level * 12;
              return (
                <g
                  key={c.min}
                  opacity={passed ? 0.55 : 1}
                  className="cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E7AE80]"
                  role="link"
                  tabIndex={0}
                  aria-label={`${fmtArcTime(c.time)} · ${fullNames}`}
                  onClick={() => router.push(href)}
                  onKeyDown={(e) => { if (e.key === "Enter") router.push(href); }}
                >
                  <title>{`${fmtArcTime(c.time)} · ${fullNames}${resp ? ` · ${resp}` : ""}`}</title>
                  {/* Alvo de toque ~44px (mobile) — transparente mas clicável. */}
                  <circle cx={x} cy={y} r="22" fill="transparent" />
                  <text x={x} y={y - 16 - level * 11} textAnchor="middle" fontSize="10" fill={passed ? "#9A8A77" : "#C9A98B"}>
                    {fmtArcTime(c.time)}
                  </text>
                  <circle cx={x} cy={y} r="9" fill="url(#arcBead)" stroke="rgba(255,255,255,0.25)" strokeWidth="1" filter="url(#arcLift)" />
                  <circle cx={x - 3} cy={y - 3.2} r="2.2" fill="rgba(255,255,255,0.18)" />
                  {c.items.length > 1 ? (
                    <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#E7E0D5">
                      {c.items.length}
                    </text>
                  ) : (
                    <circle cx={x} cy={y} r="2.5" fill="#C9A98B" />
                  )}
                  {/* Dizeres: nome + responsável — SÓ quando há espaço (senão a
                      hora + tooltip contam a história; texto embolado nunca). */}
                  {showLabels && (
                    <text x={x} y={nameY} textAnchor="middle" fontSize="9.5" fill={passed ? "#9A8A77" : "#C9BCAA"}>
                      {display}
                    </text>
                  )}
                  {showLabels && resp && (
                    <text x={x} y={nameY + 11} textAnchor="middle" fontSize="9" fill={passed ? "rgba(231,174,128,0.6)" : "#E7AE80"}>
                      {resp}
                    </text>
                  )}
                </g>
              );
            })}
            {nowF != null && (
              <g
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E7AE80]"
                role="link"
                tabIndex={0}
                aria-label={t("careRoutine.journeyCta")}
                onClick={() => router.push("/jornada")}
                onKeyDown={(e) => { if (e.key === "Enter") router.push("/jornada"); }}
              >
                <title>{t("careRoutine.journeyCta")}</title>
                <circle cx={arcX(nowF)} cy={arcY(nowF)} r="20" fill="transparent" />
                <circle cx={arcX(nowF)} cy={arcY(nowF)} r="15" fill="#E7AE80" opacity="0.18" filter="url(#arcGlow)" />
                <circle cx={arcX(nowF)} cy={arcY(nowF)} r="9" fill="#E7AE80" opacity="0.30" filter="url(#arcGlow)" />
                <circle cx={arcX(nowF)} cy={arcY(nowF)} r="6.8" fill="url(#arcSun)" />
                <circle cx={arcX(nowF) - 2.1} cy={arcY(nowF) - 2.4} r="2" fill="#FFF3E2" opacity="0.85" />
                <text
                  x={Math.min(556, Math.max(44, arcX(nowF)))}
                  // Sobe quando há estação por perto — "agora" nunca pinta por
                  // cima do horário de uma parada (auditoria #2/#10).
                  y={Math.max(10, arcY(nowF) - (arcLabeled.some((s) => Math.abs(s.x - arcX(nowF!)) < 32) ? 31 : 19))}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="700"
                  fill="#E7AE80"
                  letterSpacing="0.08em"
                >
                  {t("careRoutine.arcNow")}
                </text>
              </g>
            )}
            {/* Casas nas pontas — POR CIMA do sol (nome legível nas bordas). */}
            <g
              opacity={dayMoving ? 0.55 : 1}
              className={homeAm ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E7AE80]" : undefined}
              role={homeAm ? "link" : undefined}
              tabIndex={homeAm ? 0 : undefined}
              aria-label={homeAm ? t("careRoutine.a11yHomeAnchor", { name: homeAm.text }) : undefined}
              onClick={homeAm ? () => router.push(hrefForStation(homeAm)) : undefined}
              onKeyDown={homeAm ? (e) => { if (e.key === "Enter") router.push(hrefForStation(homeAm)); } : undefined}
            >
              {homeAm && <title>{t("careRoutine.a11yHomeAnchor", { name: homeAm.text })}</title>}
              {homeAm && <circle cx={AP0.x + 14} cy={AP0.y - 4} r="20" fill="transparent" />}
              <circle cx={AP0.x} cy={AP0.y} r="3.2" fill="rgba(255,255,255,0.3)" />
              {homeAm && (
                <text x={AP0.x} y={AP0.y - 9} textAnchor="start" fontSize="9.5" fill="#E7AE80">
                  🏠 {homeAm.text}
                </text>
              )}
            </g>
            <g
              className={homePm ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E7AE80]" : undefined}
              role={homePm ? "link" : undefined}
              tabIndex={homePm ? 0 : undefined}
              aria-label={homePm ? t("careRoutine.a11yHomeAnchor", { name: homePm.text }) : undefined}
              onClick={homePm ? () => router.push(hrefForStation(homePm)) : undefined}
              onKeyDown={homePm ? (e) => { if (e.key === "Enter") router.push(hrefForStation(homePm)); } : undefined}
            >
              {homePm && <title>{t("careRoutine.a11yHomeAnchor", { name: homePm.text })}</title>}
              {homePm && <circle cx={AP2.x - 14} cy={AP2.y - 4} r="20" fill="transparent" />}
              <circle cx={AP2.x} cy={AP2.y} r="3.2" fill="rgba(255,255,255,0.3)" />
              {homePm && (
                <text x={AP2.x} y={AP2.y - 9} textAnchor="end" fontSize="9.5" fill="#E7AE80">
                  🏠 {homePm.text}
                </text>
              )}
            </g>
            <g aria-hidden="true">
              <text x="10" y="106" fontSize="10" fill="#A89A88">06h</text>
              <text x={arcX(arcF(9 * 60))} y="106" textAnchor="middle" fontSize="10" fill="#A89A88">{t("careRoutine.arcMorning")}</text>
              <text x={arcX(arcF(15 * 60))} y="106" textAnchor="middle" fontSize="10" fill="#A89A88">{t("careRoutine.arcAfternoon")}</text>
              <text x={arcX(arcF(19.5 * 60))} y="106" textAnchor="middle" fontSize="10" fill="#A89A88">{t("careRoutine.arcEvening")}</text>
              <text x="590" y="106" textAnchor="end" fontSize="10" fill="#A89A88">21h</text>
            </g>
          </svg>

          {/* Próximo momento — o cluster inteiro que vem agora (auditoria #11):
              2+ no mesmo horário mostram os dois nomes e vão pra /jornada;
              perna ganha o verbo (Busca · Henrique), não só o nome. */}
          {nextCluster && (
            <Link
              href={nextCluster.items.length === 1 ? hrefForStation(nextCluster.items[0]) : "/jornada"}
              prefetch={false}
              className="mt-2.5 block rounded-xl bg-white/[0.05] border border-white/10 px-3.5 py-3 hover:bg-white/[0.08] transition-colors"
            >
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#9A8A77] font-semibold mb-1.5">
                {t("careRoutine.nextMomentLabel")}
              </p>
              <div className="flex items-center gap-3">
                <span className="font-display text-[21px] leading-none text-[#E7AE80] tabular-nums flex-shrink-0">
                  {fmtClock(nextCluster.items[0].time ?? "")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[#F4ECE1] truncate">
                    {nextCluster.items.length > 1
                      ? nextCluster.items.map((i) => shortLabel(i.text)).join(" + ")
                      : nextCluster.items[0].kind === "activity"
                        ? shortLabel(nextCluster.items[0].text)
                        : `${t(nextCluster.items[0].kind === "pickup" ? "careRoutine.pickup" : "careRoutine.dropoff")} · ${nextCluster.items[0].text}`}
                  </p>
                  {nextCluster.items.length === 1 && (nextCluster.items[0].location || nextCluster.items[0].responsible) && (
                    <p className="text-[11.5px] text-[#A89A88] truncate">
                      {[nextCluster.items[0].location, nextCluster.items[0].responsible].filter(Boolean).join(" — ")}
                    </p>
                  )}
                </div>
                <span className="text-[#C9A98B] flex-shrink-0" aria-hidden>›</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* RITMO DA SEMANA + contagem — restaura a Semana Colorida (decisão do
          dono): 7 dias na cor da guarda, hoje com anel, "3 de 7 consecutivos".
          Clicável → calendário (onde vivem weekends/saldo/escala). */}
      {custodyContext && custodyContext.week.length > 0 && (
        <Link
          href="/calendario"
          prefetch={false}
          aria-label={t("careRoutine.heroRhythmLabel")}
          className="mt-3.5 pt-3 border-t border-white/10 flex items-center gap-3 group"
        >
          <span className="flex gap-1 flex-1 min-w-0">
            {custodyContext.week.map((d, i) => (
              <span
                key={i}
                className={`flex-1 h-5 rounded-md flex items-center justify-center text-[9px] font-semibold transition-opacity group-hover:opacity-85 ${
                  d.isToday ? "ring-1 ring-[#E7AE80]" : ""
                }`}
                style={{
                  backgroundColor: d.color ? `${d.color}59` : "rgba(255,255,255,0.06)",
                  color: d.color ? "#F4ECE1" : "#9A8A77",
                }}
              >
                {d.label}
              </span>
            ))}
          </span>
          {custodyContext.streakTotal > 1 && (
            <span className="text-[10.5px] text-[#C9A98B] flex-shrink-0">
              {t("dashboard.consecutive", { current: custodyContext.streakDays, total: custodyContext.streakTotal })}
            </span>
          )}
        </Link>
      )}

      {/* PRÓXIMA TROCA — com perspectiva ("Você pega" quando é tua vez). */}
      {custodyContext?.nextSwap && (
        <Link
          href={`/calendario?day=${custodyContext.nextSwap.dateKey}`}
          prefetch={false}
          className="mt-3 flex items-center gap-1.5 text-[12px] text-[#A89A88] hover:text-[#C9B79F] transition-colors"
        >
          <span aria-hidden="true">🔄</span>
          <span className="font-medium text-[#D8CBB9]">
            {custodyContext.nextSwap.isMine ? t("careRoutine.heroYouPickUp") : t("dashboard.nextSwap")}
          </span>
          <span className="truncate">
            · {custodyContext.nextSwap.dateLabel}
            {custodyContext.nextSwap.isMine ? "" : ` · ${custodyContext.nextSwap.name}`}
          </span>
        </Link>
      )}

      {tomorrowSummary && (
        <p className="mt-3.5 pt-2.5 border-t border-white/10 text-[12px] text-[#A89A88]">
          <span aria-hidden="true">🌅 </span>
          <span className="font-medium text-[#D8CBB9]">{t("careRoutine.tomorrowHeading")}</span> · {tomorrowSummary}
        </p>
      )}

      <Link href="/jornada" prefetch={false} className="mt-3 inline-block text-[12px] font-medium text-[#C9A98B] hover:text-[#E3C9AC]">
        {t("careRoutine.journeyCta")} →
      </Link>

      {/* Criador: troquei e aguardo ciência do outro */}
      {awaitingTheirAck && !pendingAck && (
        <p className="mt-3 pt-2.5 border-t border-white/10 text-[11px] text-[#E8A228] font-medium flex items-center gap-1">
          <span aria-hidden="true">⚠️ </span>
          {t("careRoutine.awaitingAck")}
        </p>
      )}

      {/* Âmbar, nunca vermelho (marca) + anunciado a leitores de tela. */}
      {error && <p role="alert" className="mt-2 text-[12px] text-[#E8A228]">{error}</p>}
    </div>
  );
}
