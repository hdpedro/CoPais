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

import { useState, useTransition } from "react";
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

  // "Buscou?/Levou?" — só pra pernas já passadas e ainda não registradas.
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isPast = (time: string | null) => {
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
        {status === "done" ? (
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

      {/* Timeline horizontal do dia: casa → leva → atividades → busca → casa. */}
      {heroTimeline.length > 1 && (
        <div className="mt-3.5 pt-3 border-t border-white/10">
          <div className="flex items-start gap-1">
            {heroTimeline.map((it) => (
              <div key={it.key} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                <span className="text-[14px] leading-none">{it.icon}</span>
                <span className="text-[10px] leading-none tabular-nums text-[#C9A98B]">{it.time ?? "·"}</span>
                <span className="w-full truncate text-[9px] leading-tight text-[#9A8A77]">{it.text}</span>
              </div>
            ))}
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
