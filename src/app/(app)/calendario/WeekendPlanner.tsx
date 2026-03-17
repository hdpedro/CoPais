import type { WeekendInfo } from "@/lib/calendar-utils";
import { MONTH_NAMES } from "@/lib/constants";
import { parseDateKey } from "@/lib/calendar-utils";

interface WeekendPlannerProps {
  weekends: WeekendInfo[];
  currentUserId: string;
}

export default function WeekendPlanner({ weekends, currentUserId }: WeekendPlannerProps) {
  if (weekends.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-base font-semibold text-dark mb-3">Proximos Fins de Semana</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {weekends.map((w) => {
          const sat = parseDateKey(w.satDate);
          const sun = parseDateKey(w.sunDate);
          const monthName = MONTH_NAMES[sat.getMonth()].slice(0, 3);

          const statusConfig = {
            livre: { label: "Livre", bg: "bg-green-50", border: "border-green-200", text: "text-green-700", badge: "bg-green-100 text-green-700" },
            parcial: { label: "Parcial", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
            ocupado: { label: "Com voce", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
            sem_info: { label: "Sem info", bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", badge: "bg-gray-100 text-gray-500" },
          };

          const cfg = statusConfig[w.status];

          return (
            <div
              key={w.satDate}
              className={`flex-shrink-0 w-28 rounded-xl border ${cfg.border} ${cfg.bg} p-3 text-center`}
            >
              <p className="text-xs text-muted mb-1">{monthName}</p>
              <p className="text-lg font-bold text-dark">
                {sat.getDate()}-{sun.getDate()}
              </p>
              {/* Color bars for each day */}
              <div className="flex gap-1 justify-center my-2">
                {w.satInfo && (
                  <div
                    className="w-5 h-1.5 rounded-full"
                    style={{ backgroundColor: w.satInfo.color }}
                    title={`Sab: ${w.satInfo.userName}`}
                  />
                )}
                {w.sunInfo && (
                  <div
                    className="w-5 h-1.5 rounded-full"
                    style={{ backgroundColor: w.sunInfo.color }}
                    title={`Dom: ${w.sunInfo.userName}`}
                  />
                )}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted mt-2">
        &quot;Livre&quot; = fim de semana inteiro com o outro responsavel (voce pode viajar!)
      </p>
    </div>
  );
}
