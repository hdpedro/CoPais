"use client";

/**
 * Panel de audit trail de uma despesa. Lazy-loaded — só busca o histórico
 * quando o card é expandido (não na lista). Read-only, ordenado por
 * data DESC. RLS na tabela `expense_history` permite read pra qualquer
 * membro do grupo (transparência).
 */

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface HistoryRow {
  id: string;
  actor_id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  at: string;
}

interface ExpenseHistoryPanelProps {
  expenseId: string;
  memberById: Map<string, string>;
}

const ACTION_LABELS: Record<string, string> = {
  created: "criou",
  edited: "editou",
  approved: "aprovou",
  rejected: "rejeitou",
  cancel_requested: "pediu cancelamento",
  cancelled: "cancelou",
  reopened: "reabriu",
  restored: "negou o cancelamento",
};

const ACTION_ICONS: Record<string, string> = {
  created: "📝",
  edited: "✏️",
  approved: "✅",
  rejected: "❌",
  cancel_requested: "🚫",
  cancelled: "🗑️",
  reopened: "🔄",
  restored: "↩️",
};

function formatAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function describeDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  if (!before || !after) return [];
  const diffs: string[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const b = before[key];
    const a = after[key];
    if (b === a) continue;
    if (b === null && a === null) continue;
    // Format known fields
    if (key === "amount") {
      diffs.push(`valor R$ ${Number(b ?? 0).toFixed(2)} → R$ ${Number(a ?? 0).toFixed(2)}`);
    } else if (key === "description") {
      diffs.push(`descrição "${b}" → "${a}"`);
    } else if (key === "category") {
      diffs.push(`categoria ${b} → ${a}`);
    } else if (key === "expense_date") {
      diffs.push(`data ${b} → ${a}`);
    } else if (key === "priority") {
      diffs.push(`prioridade ${b} → ${a}`);
    } else if (key === "child_id") {
      diffs.push(`criança alterada`);
    }
  }
  return diffs;
}

export default function ExpenseHistoryPanel({ expenseId, memberById }: ExpenseHistoryPanelProps) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const res = await supabase
        .from("expense_history")
        .select("id, actor_id, action, before, after, reason, at")
        .eq("expense_id", expenseId)
        .order("at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (res.error) {
        setError(res.error.message);
      } else {
        setRows((res.data || []) as HistoryRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (loading) {
    return <p className="text-[11px] text-muted italic">Carregando histórico…</p>;
  }
  if (error) {
    return <p className="text-[11px] text-error">Erro ao carregar histórico: {error}</p>;
  }
  if (!rows || rows.length === 0) {
    return <p className="text-[11px] text-muted italic">Sem histórico.</p>;
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Histórico</p>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const actorName = memberById.get(row.actor_id) || "Coparente";
          const actionLabel = ACTION_LABELS[row.action] || row.action;
          const icon = ACTION_ICONS[row.action] || "•";
          const diffs = row.action === "edited" ? describeDiff(row.before, row.after) : [];
          return (
            <li key={row.id} className="flex items-start gap-2">
              <span className="text-xs flex-shrink-0 mt-0.5">{icon}</span>
              <div className="text-[11px] text-dark min-w-0 flex-1">
                <span className="font-medium">{actorName}</span>{" "}
                <span className="text-muted">{actionLabel}</span>{" "}
                <span className="text-muted">· {formatAt(row.at)}</span>
                {row.reason && (
                  <p className="text-muted italic mt-0.5">{`"${row.reason}"`}</p>
                )}
                {diffs.length > 0 && (
                  <ul className="text-muted mt-0.5 ml-2 list-disc list-inside">
                    {diffs.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
