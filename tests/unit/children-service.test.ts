/**
 * Tests do `services/children.ts` — single source of truth pra mutations
 * de criança (PWA actions + Native API + onboarding wizard).
 *
 * Foco:
 *   - Validações de entrada (campos, ISO date, future date)
 *   - Mapeamento PG error → ChildServiceFailure
 *     - 23503 → fk_blocked (mensagem humana + 409)
 *     - 23514 → check_violation (400)
 *     - 23505 → unique_violation (409)
 *     - 42501 → permission_denied (403)
 *     - PGRST116 → not_found (404)
 *   - Membership gate (admin client)
 *   - Side effects (captureServerEvent, reportServerError)
 *
 * Cobre os bugs Luísa (add 2nd child) e Jucilande (delete Android).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockChain,
  mockSupabase,
  mockCaptureServerEvent,
  mockReportServerError,
} = vi.hoisted(() => {
  const mockChain: Record<string, ReturnType<typeof vi.fn>> = {
    from: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  };
  for (const k of Object.keys(mockChain)) {
    mockChain[k].mockReturnValue(mockChain);
  }

  const mockSupabase = { from: vi.fn().mockReturnValue(mockChain) };

  return {
    mockChain,
    mockSupabase,
    mockCaptureServerEvent: vi.fn(),
    mockReportServerError: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mockCaptureServerEvent }));
vi.mock("@/lib/error-tracking/report-server", () => ({
  reportServerError: mockReportServerError,
}));

import {
  createChild,
  deleteChild,
  mapPgError,
  updateChild,
} from "@/lib/services/children";
import type { SupabaseClient } from "@supabase/supabase-js";

const sb = mockSupabase as unknown as SupabaseClient;

const CTX = {
  actorId: "user-1",
  callerPath: "tests/unit/children-service.test.ts",
  enforceMembership: false,
  via: "test",
};

const CTX_ENFORCE = { ...CTX, enforceMembership: true };

// Reseta o chain pra retornar a si mesmo em todos os métodos
function resetChain() {
  for (const k of Object.keys(mockChain)) {
    mockChain[k].mockReset();
    mockChain[k].mockReturnValue(mockChain);
  }
  mockSupabase.from.mockReset();
  mockSupabase.from.mockReturnValue(mockChain);
}

// Configura `.single()` pra retornar `result` na primeira chamada
function stubSingle(result: { data: unknown; error?: { code?: string; message?: string; details?: string | null; hint?: string | null } | null }) {
  mockChain.single.mockResolvedValueOnce(result);
}

// Configura `.maybeSingle()` sequencialmente — útil pra gateChildInGroup
// que faz Promise.all com 2 maybeSingle (membership + child).
function stubMaybeSingles(...results: Array<{ data: unknown }>) {
  for (const r of results) {
    mockChain.maybeSingle.mockResolvedValueOnce(r);
  }
}

beforeEach(() => {
  resetChain();
  mockCaptureServerEvent.mockClear();
  mockReportServerError.mockClear();
});

// ---------------------------------------------------------------------------
// mapPgError — central piece
// ---------------------------------------------------------------------------

describe("mapPgError", () => {
  it("PG 23503 (FK) → fk_blocked com mensagem humanizada", () => {
    const f = mapPgError({ code: "23503", message: "violates foreign key" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("fk_blocked");
      expect(f.status).toBe(409);
      expect(f.error).toContain("registros");
      expect(f.error).toContain("Apague-os antes");
      expect(f.pgCode).toBe("23503");
    }
  });

  it("PG 23514 (check) → check_violation com 400", () => {
    const f = mapPgError({ code: "23514", message: "violates check constraint" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("check_violation");
      expect(f.status).toBe(400);
    }
  });

  it("PG 23505 (unique) → unique_violation com 409", () => {
    const f = mapPgError({ code: "23505", message: "duplicate key" });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.errorCode).toBe("unique_violation");
  });

  it("PG 42501 (RLS) → permission_denied com 403", () => {
    const f = mapPgError({ code: "42501", message: "denied" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("permission_denied");
      expect(f.status).toBe(403);
    }
  });

  it("PGRST116 (.single() no row) → not_found com 404", () => {
    const f = mapPgError({ code: "PGRST116", message: "no rows" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("not_found");
      expect(f.status).toBe(404);
    }
  });

  it("PG code desconhecido → db_error 500 com message original", () => {
    const f = mapPgError({ code: "99999", message: "weird" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("db_error");
      expect(f.status).toBe(500);
      expect(f.error).toBe("weird");
    }
  });

  it("sem code nem message → fallback genérico", () => {
    const f = mapPgError({});
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error).toContain("Erro inesperado");
  });
});

// ---------------------------------------------------------------------------
// createChild
// ---------------------------------------------------------------------------

describe("createChild", () => {
  const baseInput = {
    groupId: "g1",
    fullName: "Bê",
    birthDate: "2020-01-01",
  };

  it("rejeita quando faltam campos obrigatórios", async () => {
    const r = await createChild(sb, { groupId: "", fullName: "", birthDate: "" }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("missing_fields");
      expect(r.status).toBe(400);
    }
  });

  it("rejeita birthDate fora de ISO YYYY-MM-DD", async () => {
    const r = await createChild(
      sb,
      { ...baseInput, birthDate: "01/01/2020" },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("invalid_date");
  });

  it("rejeita data futura", async () => {
    const future = new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10);
    const r = await createChild(sb, { ...baseInput, birthDate: future }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("future_birthdate");
  });

  it("rejeita ano absurdo no passado (typo tipo 11/11/1111 → 914 anos)", async () => {
    const r = await createChild(sb, { ...baseInput, birthDate: "1111-11-11" }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("birthdate_out_of_range");
  });

  it("retorna fk_blocked com mensagem humana quando PG 23503 (apesar de raro em INSERT)", async () => {
    stubSingle({
      data: null,
      error: { code: "23503", message: "violates fk" },
    });
    const r = await createChild(sb, baseInput, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("fk_blocked");
      expect(r.error).toContain("Apague-os antes");
    }
    expect(mockReportServerError).toHaveBeenCalledTimes(1);
  });

  it("retorna check_violation quando PG 23514 (sex inválido)", async () => {
    stubSingle({
      data: null,
      error: { code: "23514", message: "check" },
    });
    const r = await createChild(sb, baseInput, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("check_violation");
  });

  it("sucesso retorna data normalizada + dispara captureServerEvent", async () => {
    const row = {
      id: "c1",
      full_name: "Bê",
      birth_date: "2020-01-01",
      sex: null,
      photo_url: null,
      notes: null,
      allergies: null,
      cpf: null,
      rg: null,
    };
    stubSingle({ data: row, error: null });
    const r = await createChild(sb, baseInput, CTX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("c1");
    expect(mockCaptureServerEvent).toHaveBeenCalledWith(
      "user-1",
      "child_added",
      { via: "test" },
    );
  });

  it("membership gate bloqueia quando admin client + user não é membro", async () => {
    stubMaybeSingles({ data: null });
    const r = await createChild(sb, baseInput, CTX_ENFORCE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("permission_denied");
      expect(r.status).toBe(403);
    }
  });

  it("membership gate passa + insert sucede quando user é membro", async () => {
    stubMaybeSingles({ data: { role: "admin" } });
    stubSingle({
      data: {
        id: "c2",
        full_name: "Bê",
        birth_date: "2020-01-01",
        sex: null,
        photo_url: null,
        notes: null,
        allergies: null,
        cpf: null,
        rg: null,
      },
      error: null,
    });
    const r = await createChild(sb, baseInput, CTX_ENFORCE);
    expect(r.ok).toBe(true);
  });

  it("normaliza allergies vazias pra null (não [] vazio)", async () => {
    const row = {
      id: "c1",
      full_name: "Bê",
      birth_date: "2020-01-01",
      sex: null,
      photo_url: null,
      notes: null,
      allergies: null,
      cpf: null,
      rg: null,
    };
    stubSingle({ data: row, error: null });
    await createChild(
      sb,
      { ...baseInput, allergies: ["", " ", ""] },
      CTX,
    );
    // Inspeciona o payload passado pra insert
    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    const payload = mockChain.insert.mock.calls[0][0];
    expect(payload.allergies).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateChild
// ---------------------------------------------------------------------------

describe("updateChild", () => {
  it("rejeita patch vazio com no_changes", async () => {
    const r = await updateChild(
      sb,
      { childId: "c1", groupId: "g1", patch: {} },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("no_changes");
  });

  it("rejeita fullName vazio explícito", async () => {
    const r = await updateChild(
      sb,
      { childId: "c1", groupId: "g1", patch: { fullName: "   " } },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("missing_fields");
  });

  it("rejeita birthDate futura", async () => {
    const future = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
    const r = await updateChild(
      sb,
      { childId: "c1", groupId: "g1", patch: { birthDate: future } },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("future_birthdate");
  });

  it("rejeita ano absurdo no passado no patch (birthdate_out_of_range)", async () => {
    const r = await updateChild(
      sb,
      { childId: "c1", groupId: "g1", patch: { birthDate: "1011-01-01" } },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("birthdate_out_of_range");
  });

  it("sucesso devolve ChildRow + dispara child_updated", async () => {
    stubSingle({
      data: {
        id: "c1",
        full_name: "Bê Editado",
        birth_date: "2020-01-01",
        sex: null,
        photo_url: null,
        notes: null,
        allergies: null,
        cpf: null,
        rg: null,
      },
      error: null,
    });
    const r = await updateChild(
      sb,
      { childId: "c1", groupId: "g1", patch: { fullName: "Bê Editado" } },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.full_name).toBe("Bê Editado");
    expect(mockCaptureServerEvent).toHaveBeenCalledWith(
      "user-1",
      "child_updated",
      { via: "test" },
    );
  });

  it("gate enforceMembership reprova quando user não é membro", async () => {
    stubMaybeSingles({ data: null }, { data: { id: "c1", group_id: "g1" } });
    const r = await updateChild(
      sb,
      { childId: "c1", groupId: "g1", patch: { fullName: "X" } },
      CTX_ENFORCE,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("permission_denied");
  });

  it("gate enforceMembership reprova quando child pertence a outro grupo", async () => {
    stubMaybeSingles(
      { data: { role: "admin" } },
      { data: { id: "c1", group_id: "g2" } },
    );
    const r = await updateChild(
      sb,
      { childId: "c1", groupId: "g1", patch: { fullName: "X" } },
      CTX_ENFORCE,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("wrong_group");
  });
});

// ---------------------------------------------------------------------------
// deleteChild — coração do bug Jucilande
// ---------------------------------------------------------------------------

describe("deleteChild", () => {
  it("rejeita quando faltam ids", async () => {
    const r = await deleteChild(
      sb,
      { childId: "", groupId: "" },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("missing_fields");
  });

  it("FK violation (23503) vira mensagem humana 409", async () => {
    // `delete()` retorna sem .single() — ajusta o chain
    mockChain.delete.mockReturnValue({
      ...mockChain,
      eq: vi.fn().mockResolvedValue({
        error: {
          code: "23503",
          message: "violates fk constraint expenses_child_id_fkey",
          details: "Key (id)=(c1) is still referenced",
          hint: null,
        },
      }),
    });
    const r = await deleteChild(
      sb,
      { childId: "c1", groupId: "g1" },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("fk_blocked");
      expect(r.status).toBe(409);
      expect(r.error).toContain("Apague-os antes");
      expect(r.pgCode).toBe("23503");
    }
    expect(mockReportServerError).toHaveBeenCalledTimes(1);
    const reportCall = mockReportServerError.mock.calls[0][1];
    expect(reportCall.metadata.pgCode).toBe("23503");
    expect(reportCall.metadata.mappedCode).toBe("fk_blocked");
  });

  it("sucesso retorna data.id + dispara child_deleted analytics", async () => {
    mockChain.delete.mockReturnValue({
      ...mockChain,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const r = await deleteChild(
      sb,
      { childId: "c1", groupId: "g1" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("c1");
    expect(mockCaptureServerEvent).toHaveBeenCalledWith(
      "user-1",
      "child_deleted",
      { via: "test" },
    );
  });

  it("RLS deny (42501) vira permission_denied 403", async () => {
    mockChain.delete.mockReturnValue({
      ...mockChain,
      eq: vi.fn().mockResolvedValue({
        error: { code: "42501", message: "permission denied for table children" },
      }),
    });
    const r = await deleteChild(
      sb,
      { childId: "c1", groupId: "g1" },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("permission_denied");
      expect(r.status).toBe(403);
    }
  });

  it("gate reprova quando criança é de outro grupo (defesa em profundidade)", async () => {
    stubMaybeSingles(
      { data: { role: "admin" } },
      { data: { id: "c1", group_id: "g_outro" } },
    );
    const r = await deleteChild(
      sb,
      { childId: "c1", groupId: "g1" },
      CTX_ENFORCE,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("wrong_group");
  });

  it("gate reprova com not_found quando criança não existe", async () => {
    stubMaybeSingles(
      { data: { role: "admin" } },
      { data: null },
    );
    const r = await deleteChild(
      sb,
      { childId: "c1", groupId: "g1" },
      CTX_ENFORCE,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("not_found");
      expect(r.status).toBe(404);
    }
  });
});
