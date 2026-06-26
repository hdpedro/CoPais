/**
 * Tests do executeTool("create_activity") — DEDUP de atividade.
 *
 * Regressão do bug reportado pelo David (2026-06-25): o assistente
 * registrou "Fono (Gabriel) 10:30" 3x — uma atividade nova a cada mensagem
 * em que ele complementava a MESMA atividade (endereço, nome do fono). O
 * LLM re-chama create_activity a cada follow-up; sem dedup, cada chamada
 * inseria uma linha nova em child_activities.
 *
 * Fix: execCreateActivity converge pra UMA atividade por (grupo, criança,
 * nome, horário) e mescla os campos novos (banco como source of truth).
 */
import { describe, expect, it, vi } from "vitest";

// expenses.ts (importado transitivamente por tools.ts) usa "server-only".
// vi.mock é hoisted pelo vitest, então roda antes do import de tools.ts.
vi.mock("server-only", () => ({}));

import { executeTool, type ToolContext } from "../../src/lib/ai/tools";

/* ------------------------------------------------------------------ */
/* Mock Supabase com estado em memória (select / insert / update)      */
/* ------------------------------------------------------------------ */

function makeStatefulSupabase() {
  const rows: Array<Record<string, unknown>> = [];
  let seq = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    _op: "select",
    _insert: null as Record<string, unknown> | null,
    _update: null as Record<string, unknown> | null,
    _updateId: null as string | null,
    from() { b._op = "select"; return b; },
    select() { b._op = "select"; return b; },
    insert(payload: Record<string, unknown>) { b._op = "insert"; b._insert = payload; return b; },
    update(payload: Record<string, unknown>) { b._op = "update"; b._update = payload; return b; },
    eq(col: string, val: unknown) {
      if (b._op === "update" && col === "id") b._updateId = val as string;
      return b;
    },
    is() { return b; },
    then(resolve: (v: { data: unknown; error: unknown }) => void) {
      if (b._op === "insert") {
        rows.push({ id: `a${++seq}`, ...(b._insert || {}) });
        return resolve({ data: null, error: null });
      }
      if (b._op === "update") {
        const r = rows.find((x) => x.id === b._updateId);
        if (r) Object.assign(r, b._update || {});
        return resolve({ data: null, error: null });
      }
      return resolve({ data: rows, error: null });
    },
  };
  return { client: { from: b.from } as unknown as ToolContext["supabase"], rows };
}

const baseCtx = (supabase: ToolContext["supabase"]): ToolContext => ({
  supabase,
  userId: "u1",
  groupId: "g1",
  children: [{ id: "c1", name: "Gabriel Pedro" }],
  members: [{ id: "u1", name: "David Pedro" }],
});

describe("create_activity — dedup", () => {
  it("primeira chamada insere normalmente", async () => {
    const { client, rows } = makeStatefulSupabase();
    const res = await executeTool(
      "create_activity",
      { child_name: "Gabriel", name: "Fono", time_start: "10:30", days_of_week: "sex" },
      baseCtx(client),
    );
    expect(res.success).toBe(true);
    expect(res.message).toContain("Atividade registrada");
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Fono");
  });

  it("follow-up com endereço ATUALIZA a mesma atividade (não duplica)", async () => {
    const { client, rows } = makeStatefulSupabase();
    const ctx = baseCtx(client);
    await executeTool("create_activity", { child_name: "Gabriel", name: "Fono", time_start: "10:30", days_of_week: "sex" }, ctx);
    const res = await executeTool(
      "create_activity",
      { child_name: "Gabriel", name: "Fono", time_start: "10:30", location: "rua Real Grandeza, 182" },
      ctx,
    );
    expect(res.message).toContain("Atividade atualizada");
    expect(rows).toHaveLength(1);
    expect(rows[0].location).toBe("rua Real Grandeza, 182");
  });

  it("os 3 follow-ups do David convergem pra UMA atividade", async () => {
    const { client, rows } = makeStatefulSupabase();
    const ctx = baseCtx(client);
    // 1) "Gabriel faz fono todas as sextas 10:30"
    await executeTool("create_activity", { child_name: "Gabriel", name: "Fono", time_start: "10:30", days_of_week: "sex" }, ctx);
    // 2) "Fono é com o Moacyr na rua Real Grandeza, 182"
    await executeTool("create_activity", { child_name: "Gabriel", name: "Fono", time_start: "10:30", location: "rua Real Grandeza, 182" }, ctx);
    // 3) "To falando do endereço" → LLM re-manda o mesmo endereço (capitalização diferente)
    const last = await executeTool("create_activity", { child_name: "Gabriel", name: "Fono", time_start: "10:30", location: "Rua Real Grandeza, 182" }, ctx);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Fono");
    expect(rows[0].location).toBe("rua Real Grandeza, 182"); // call 3 não sobrescreve (mesmo endereço, só caixa diferente)
    expect(last.message).toContain("ja esta registrada");
  });

  it("mesmo nome em HORÁRIO diferente cria atividade nova (não é a mesma)", async () => {
    const { client, rows } = makeStatefulSupabase();
    const ctx = baseCtx(client);
    await executeTool("create_activity", { child_name: "Gabriel", name: "Fono", time_start: "10:30" }, ctx);
    await executeTool("create_activity", { child_name: "Gabriel", name: "Fono", time_start: "14:00" }, ctx);
    expect(rows).toHaveLength(2);
  });
});
