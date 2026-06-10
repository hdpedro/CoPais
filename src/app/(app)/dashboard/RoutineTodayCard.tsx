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
import { createRoutineOverride, markRoutineOverrideRead, recordRoutineLog } from "@/actions/care-routine";
import type { RoutineToday, RoutineHeroEntry } from "@/lib/care-routine-resolve";
import type { JourneyItem } from "@/lib/care-routine-journey";

type Leg = "dropoff" | "pickup";

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
}: RoutineTodayCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  // Feedback OTIMISTA do "Buscou?/Levou?": marca na hora (o refresh confirma).
  const [optimisticLogs, setOptimisticLogs] = useState<Record<string, "done" | "missed">>({});

  const kidsLabel = (names: string[]) => (names.length ? names.join(", ") : "");

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
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

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
  if (!hasRoutineSlots || routineToday.mode === "none") {
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

  // Estado de cada parada pela hora do sistema (reusa o nowMin do "Buscou?"):
  // "passed" (já foi, apagado), "next" (a próxima, em destaque) ou "future".
  const timelineState: ("passed" | "next" | "future")[] = (() => {
    const mins = heroTimeline.map((it) => {
      if (!it.time) return null;
      const [h, m] = it.time.split(":").map(Number);
      return Number.isNaN(h) ? null : h * 60 + (m || 0);
    });
    if (nowMin == null) return heroTimeline.map(() => "future");
    const firstTimed = mins.find((m) => m != null) ?? null;
    const passed = heroTimeline.map((_, i) => {
      const m = mins[i];
      if (m != null) return m <= nowMin;
      // Casa da manhã: apaga quando o dia entra em movimento. Casa da noite:
      // nunca "passa" — vira o destaque quando tudo terminou (estamos em casa).
      if (i === 0) return firstTimed != null && nowMin >= firstTimed;
      return false;
    });
    const nextIdx = passed.findIndex((p) => !p);
    return heroTimeline.map((_, i) => (passed[i] ? "passed" : i === nextIdx ? "next" : "future"));
  })();

  return (
    <div
      className="rounded-2xl p-5 shadow-sm text-[#EFE7DC]"
      style={{ background: "linear-gradient(157deg, #2E2823 0%, #211C18 100%)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#B79B7E] font-semibold">
          📍 {t("careRoutine.todayHeading")}
        </h3>
        <Link href="/calendario/rotina" prefetch={false} className="text-[12px] font-medium text-[#C9A98B] hover:text-[#E3C9AC]">
          {t("careRoutine.editCta")}
        </Link>
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
        {dayCalm && <p className="font-display text-[21px] leading-[1.12] text-[#F4ECE1]">{t("briefing.calmTitle")}</p>}
        <div className="space-y-2.5 mt-1">
          {routineToday.entries.map((entry, i) => (
            <div key={i}>
              <p className="font-display text-[19px] leading-[1.32] text-[#E9DECF]">{vozLine(entry)}</p>
              {actionRow(entry)}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline "linha de metrô" do dia: casa ─● leva ─● atividades ─● casa.
          Estações como moedas ancoradas NA linha; trecho percorrido aceso em
          terracota, estação atual com brilho, passado apagado (mockup, 10/jun). */}
      {heroTimeline.length > 1 && (
        <div className="mt-4 pt-3.5 border-t border-white/10">
          <div className="flex items-start">
            {heroTimeline.map((it, i) => {
              const state = timelineState[i] ?? "future";
              const last = heroTimeline.length - 1;
              // "Sempre clicável": atividade → detalhe relatável; evento → o
              // EVENTO específico no calendário (deep-link day+eventId, mesmo
              // contrato do painel); casa → o dia; leva/busca → editor da rotina.
              const stationHref =
                it.kind === "activity"
                  ? it.activityId
                    ? `/atividades/${it.activityId}`
                    : it.eventId
                      ? `/calendario?day=${todayDate}&eventId=${it.eventId}`
                      : `/calendario?day=${todayDate}`
                  : it.kind === "home"
                    ? `/calendario?day=${todayDate}`
                    : "/calendario/rotina";
              return (
                <Link
                  key={it.key}
                  href={stationHref}
                  prefetch={false}
                  className="relative flex min-w-0 flex-1 flex-col items-center gap-[5px] text-center rounded-xl py-1 -my-1 hover:bg-white/[0.045] transition-colors"
                >
                  {i > 0 && (
                    <span
                      aria-hidden
                      className={`absolute left-0 right-1/2 top-3 h-px mr-3 ${state !== "future" ? "bg-[#B0805F]" : "bg-white/[0.15]"}`}
                    />
                  )}
                  {i < last && (
                    <span
                      aria-hidden
                      className={`absolute left-1/2 right-0 top-3 h-px ml-3 ${state === "passed" ? "bg-[#B0805F]" : "bg-white/[0.15]"}`}
                    />
                  )}
                  <span
                    className={`relative w-6 h-6 rounded-full flex items-center justify-center text-[13px] leading-none ${
                      state === "next"
                        ? "bg-[#E7AE80]/20 ring-1 ring-[#E7AE80]/45 shadow-[0_0_14px_rgba(231,174,128,0.28)]"
                        : state === "passed"
                          ? "bg-white/[0.04] opacity-40"
                          : "bg-white/[0.06] ring-1 ring-white/10"
                    }`}
                  >
                    {it.icon}
                  </span>
                  <span
                    className={`text-[10.5px] leading-none tabular-nums tracking-wide ${
                      state === "next" ? "text-[#E7AE80] font-semibold" : state === "passed" ? "text-[#C9A98B]/35" : "text-[#C9A98B]/75"
                    }`}
                  >
                    {it.time ?? " "}
                  </span>
                  {/* Pessoas (casa/leva/busca) herdam o terracota da voz; atividades neutras. */}
                  <span
                    className={`w-full truncate text-[9.5px] leading-tight ${
                      it.kind !== "activity"
                        ? state === "next"
                          ? "text-[#E7AE80] font-medium"
                          : state === "passed"
                            ? "text-[#E7AE80]/35"
                            : "text-[#E7AE80]/85"
                        : state === "next"
                          ? "text-[#EFE4D6] font-medium"
                          : state === "passed"
                            ? "text-[#9A8A77]/40"
                            : "text-[#A89884]"
                    }`}
                  >
                    {shortLabel(it.text)}
                  </span>
                  {/* Responsável da atividade — pessoa, então terracota. */}
                  {it.kind === "activity" && it.responsible ? (
                    <span
                      className={`w-full truncate text-[9px] leading-tight ${
                        state === "next" ? "text-[#E7AE80] font-medium" : state === "passed" ? "text-[#E7AE80]/35" : "text-[#E7AE80]/85"
                      }`}
                    >
                      {it.responsible}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {tomorrowSummary && (
        <p className="mt-3.5 pt-2.5 border-t border-white/10 text-[12px] text-[#A89A88]">
          🌅 <span className="font-medium text-[#D8CBB9]">{t("careRoutine.tomorrowHeading")}</span> · {tomorrowSummary}
        </p>
      )}

      <Link href="/jornada" prefetch={false} className="mt-3 inline-block text-[12px] font-medium text-[#C9A98B] hover:text-[#E3C9AC]">
        {t("careRoutine.journeyCta")} →
      </Link>

      {/* Criador: troquei e aguardo ciência do outro */}
      {awaitingTheirAck && !pendingAck && (
        <p className="mt-3 pt-2.5 border-t border-white/10 text-[11px] text-[#E8A228] font-medium flex items-center gap-1">
          ⚠️ {t("careRoutine.awaitingAck")}
        </p>
      )}

      {error && <p className="mt-2 text-[12px] text-[#F0A8A0]">{error}</p>}
    </div>
  );
}
