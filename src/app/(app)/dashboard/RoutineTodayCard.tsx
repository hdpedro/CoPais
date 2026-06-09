"use client";

/**
 * Card "Hoje: quem leva · quem busca" do painel (Rotina de Leva & Busca).
 *
 * Adaptável à forma da família (`arrangement`):
 *   - together / single  → a rotina é protagonista (card destacado).
 *   - rotating           → card complementar abaixo do Herói de Guarda.
 * Sem slots → empty-state que ensina e leva pro editor (`/calendario/rotina`).
 *
 * Interações:
 *   - "Trocar hoje" por perna (⇄): cria override pro outro responsável (1 toque
 *     quando há 2 cuidadores). Dispara ciência bilateral (Foundation).
 *   - Criador vê "⚠️ Aguardando ciência" até o outro confirmar.
 *   - Destinatário vê "[X] trocou a rotina de hoje · Confirmar" → mark_collab_read.
 *
 * NÃO toca no Herói de Guarda — bloco aditivo.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { createRoutineOverride, markRoutineOverrideRead, recordRoutineLog } from "@/actions/care-routine";
import type { RoutineToday, RoutineHeroEntry, RoutineHeroLeg } from "@/lib/care-routine-resolve";

type Leg = "dropoff" | "pickup";

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
}: RoutineTodayCardProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  // Feedback OTIMISTA do "Buscou?/Levou?": marca na hora (o refresh confirma).
  // Sem isso, clicar "Sim" não dá retorno visível até o round-trip do servidor.
  const [optimisticLogs, setOptimisticLogs] = useState<Record<string, "done" | "missed">>({});

  const intlLocale =
    ({ pt: "pt-BR", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE" } as Record<string, string>)[locale] ?? "pt-BR";
  const listFmt = new Intl.ListFormat(intlLocale, { style: "long", type: "conjunction" });
  const kidsLabel = (names: string[]) => (names.length ? listFmt.format(names) : "");

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
    // Otimista: o status aparece IMEDIATAMENTE no clique.
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
          // Reverte o otimista e mostra o erro.
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
  const legStatusRow = (childIds: string[], leg: Leg, time: string | null) => {
    const status = aggStatus(childIds, leg);
    if (status === "done") return <span className="text-[11px] text-[#5B9E85] font-medium">{t("careRoutine.heroDone")}</span>;
    if (status === "missed") return <span className="text-[11px] text-[#7A8C8B]">{t("careRoutine.missedShort")}</span>;
    if (!isPast(time)) return null;
    return (
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] text-[#7A8C8B]">{leg === "dropoff" ? t("careRoutine.didDropoff") : t("careRoutine.didPickup")}</span>
        <button type="button" disabled={isPending} onClick={() => handleLog(childIds, leg, "done")} className="text-[11px] font-semibold text-[#5B9E85] disabled:opacity-40">
          {t("careRoutine.yes")}
        </button>
        <button type="button" disabled={isPending} onClick={() => handleLog(childIds, leg, "missed")} className="text-[11px] font-medium text-[#7A8C8B] disabled:opacity-40">
          {t("careRoutine.no")}
        </button>
      </div>
    );
  };

  // Empty-state: ensina + CTA pro editor.
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

  const SwapButton = ({ childIds, legs, responsibleId, legKey }: { childIds: string[]; legs: Leg[]; responsibleId: string; legKey: Leg }) =>
    canSwap ? (
      <button
        type="button"
        onClick={() => handleSwap(childIds, legs, responsibleId)}
        disabled={isPending}
        aria-label={t("a11y.careRoutine.swap", { leg: legKey === "dropoff" ? t("careRoutine.dropoff") : t("careRoutine.pickup") })}
        title={t("careRoutine.swapTodayCta")}
        className="ml-auto text-[11px] font-medium text-[#5B9E85] hover:underline disabled:opacity-40 flex-shrink-0"
      >
        ⇄ {t("careRoutine.swapTodayCta")}
      </button>
    ) : null;

  const renderLeg = (leg: RoutineHeroLeg | null, kind: Leg, kids: string, childIds: string[]) => {
    if (!leg) return null;
    const name = leg.responsibleName;
    let text: string;
    if (kind === "dropoff") {
      text = leg.label
        ? t("careRoutine.heroDropoffTo", { name, kids, label: leg.label })
        : t("careRoutine.heroDropoff", { name, kids });
    } else {
      text = leg.time
        ? t("careRoutine.heroPickupAt", { name, kids, time: leg.time.slice(0, 5) })
        : t("careRoutine.heroPickup", { name, kids });
    }
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="text-base flex-shrink-0">{kind === "dropoff" ? "🚗" : "🏠"}</span>
          <span className={`text-[13px] ${leg.isMe ? "font-semibold text-[#2C2C2C]" : "text-[#3A3A3A]"}`}>{text}</span>
          <SwapButton childIds={childIds} legs={[kind]} responsibleId={leg.responsibleId} legKey={kind} />
        </div>
        <div className="ml-7 mt-0.5">{legStatusRow(childIds, kind, leg.time)}</div>
      </div>
    );
  };

  const renderEntry = (entry: RoutineHeroEntry, key: string | number) => {
    const kids = kidsLabel(entry.childNames);
    if (entry.sameAllDay && entry.dropoff) {
      return (
        <div key={key}>
          <div className="flex items-center gap-2">
            <span className="text-base flex-shrink-0">🤝</span>
            <span className={`text-[13px] ${entry.dropoff.isMe ? "font-semibold text-[#2C2C2C]" : "text-[#3A3A3A]"}`}>
              {t("careRoutine.heroFullDay", { name: entry.dropoff.responsibleName, kids })}
            </span>
            <SwapButton childIds={entry.childIds} legs={["dropoff", "pickup"]} responsibleId={entry.dropoff.responsibleId} legKey="dropoff" />
          </div>
          <div className="ml-7 mt-0.5">{legStatusRow(entry.childIds, "pickup", entry.pickup?.time ?? entry.dropoff.time)}</div>
        </div>
      );
    }
    return (
      <div key={key} className="space-y-1.5">
        {entry.childNames.length > 1 || routineToday.mode === "split" ? (
          <p className="text-[11px] uppercase tracking-wide text-[#7A8C8B] font-medium">{kids}</p>
        ) : null}
        {renderLeg(entry.dropoff, "dropoff", kids, entry.childIds)}
        {renderLeg(entry.pickup, "pickup", kids, entry.childIds)}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] uppercase tracking-wider text-[#7A8C8B] font-semibold">📍 {t("careRoutine.todayHeading")}</h3>
        <Link href="/calendario/rotina" prefetch={false} className="text-[12px] font-medium text-[#5B9E85] hover:underline">
          {t("careRoutine.editCta")}
        </Link>
      </div>

      {/* Destinatário: alguém trocou e eu ainda não dei ciência */}
      {pendingAck && (
        <div className="mb-3 rounded-xl bg-[#E8A228]/[0.08] border border-[#E8A228]/25 px-3 py-2.5 flex items-center gap-2">
          <span className="text-[13px] text-[#2C2C2C] flex-1">{t("careRoutine.changedToday", { name: pendingAck.fromName })}</span>
          <button
            type="button"
            onClick={handleConfirmAck}
            disabled={isPending}
            className="text-[12px] font-semibold text-white bg-[#E8A228] rounded-lg px-3 py-1.5 disabled:opacity-50 flex-shrink-0"
          >
            {isPending ? t("careRoutine.confirming") : t("careRoutine.confirm")}
          </button>
        </div>
      )}

      <div className="space-y-3">{routineToday.entries.map((entry, i) => renderEntry(entry, i))}</div>

      {tomorrowSummary && (
        <p className="mt-3 pt-2.5 border-t border-gray-100 text-[12px] text-[#7A8C8B]">
          🌅 <span className="font-medium text-[#3A3A3A]">{t("careRoutine.tomorrowHeading")}</span> · {tomorrowSummary}
        </p>
      )}

      <Link href="/jornada" prefetch={false} className="mt-3 inline-block text-[12px] font-medium text-[#5B9E85] hover:underline">
        {t("careRoutine.journeyCta")} →
      </Link>

      {/* Criador: troquei e aguardo ciência do outro */}
      {awaitingTheirAck && !pendingAck && (
        <p className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-[#E8A228] font-medium flex items-center gap-1">
          ⚠️ {t("careRoutine.awaitingAck")}
        </p>
      )}

      {error && <p className="mt-2 text-[12px] text-[#E53935]">{error}</p>}
    </div>
  );
}
