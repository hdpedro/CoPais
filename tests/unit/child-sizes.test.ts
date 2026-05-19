/**
 * tests/unit/child-sizes.test.ts
 *
 * Cobre as validações do service + mapping de PG errors. Foco em
 * regression: cada path de erro com mensagem amigável + happy paths
 * de record/update/delete/getCurrent/getHistory.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChain, mockSupabase } = vi.hoisted(() => {
  const mockChain: any = {};
  let _res = { data: null as any, error: null as any };
  const syncMethods = [
    "select", "insert", "update", "delete", "upsert", "eq", "neq", "in", "is",
    "gte", "lte", "gt", "lt", "or", "not", "match", "filter", "order", "limit",
  ];
  for (const m of syncMethods) mockChain[m] = vi.fn(() => mockChain);
  mockChain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  mockChain.then = (res: any, rej?: any) => Promise.resolve(_res).then(res, rej);
  mockChain._setRes = (r: any) => { _res = { data: r.data ?? null, error: r.error ?? null }; };
  mockChain._reset = () => {
    // mockReset (não mockClear) — clear+empty da queue de mockResolvedValueOnce.
    // mockClear só limpa call history; queue de Once leaks entre tests.
    for (const m of syncMethods) {
      mockChain[m].mockReset();
      mockChain[m].mockImplementation(() => mockChain);
    }
    mockChain.single.mockReset();
    mockChain.single.mockResolvedValue({ data: null, error: null });
    mockChain.maybeSingle.mockReset();
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    _res = { data: null, error: null };
  };
  const mockSupabase = { from: vi.fn(() => mockChain) };
  return { mockChain, mockSupabase };
});

vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/services/child-sizes-collab", () => ({
  notifySaudeFamiliaSize: vi.fn().mockResolvedValue(undefined),
}));

import {
  recordSize,
  updateSize,
  deleteSize,
  getCurrentSizes,
  getSizeHistory,
  isSizeKind,
} from "@/lib/services/child-sizes";

const sb = mockSupabase as unknown as Parameters<typeof recordSize>[0];

const VALID_GROUP = "11111111-1111-1111-1111-111111111111";
const VALID_CHILD = "22222222-2222-2222-2222-222222222222";
const VALID_ACTOR = "33333333-3333-3333-3333-333333333333";

function setMembership(isMember: boolean) {
  // Próxima chamada de .maybeSingle() resolve com user_id ou null.
  mockChain.maybeSingle.mockResolvedValueOnce({
    data: isMember ? { user_id: VALID_ACTOR } : null,
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChain._reset();
  mockSupabase.from.mockReturnValue(mockChain);
});

describe("isSizeKind guard", () => {
  it("aceita os 5 valores válidos", () => {
    for (const k of ["shoe", "pants", "shirt", "coat", "other"]) {
      expect(isSizeKind(k)).toBe(true);
    }
  });
  it("rejeita valores fora do enum", () => {
    expect(isSizeKind("dress")).toBe(false);
    expect(isSizeKind("")).toBe(false);
    expect(isSizeKind(null)).toBe(false);
    expect(isSizeKind(123)).toBe(false);
  });
});

describe("recordSize — validações", () => {
  it("rejeita kind inválido", async () => {
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "dress" as never,
      sizeValue: "P",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("rejeita sizeValue vazio", async () => {
    setMembership(true);
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      sizeValue: "   ",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/obrigatório/i);
  });

  it("rejeita sizeValue > 24 chars", async () => {
    setMembership(true);
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "pants",
      sizeValue: "x".repeat(25),
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/longo/i);
  });

  it("kind='other' sem customLabel é rejeitado", async () => {
    setMembership(true);
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "other",
      sizeValue: "P",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/personalizada/i);
  });

  it("kind !== 'other' com customLabel é rejeitado", async () => {
    setMembership(true);
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      customLabel: "Pijama",
      sizeValue: "27",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Outro/i);
  });

  it("rejeita data futura", async () => {
    setMembership(true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const future = tomorrow.toISOString().slice(0, 10);
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      sizeValue: "27",
      recordedOn: future,
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/futura/i);
  });

  it("rejeita data com formato inválido", async () => {
    setMembership(true);
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      sizeValue: "27",
      recordedOn: "12/05/2026",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/inválida|AAAA-MM-DD/i);
  });

  it("rejeita notes > 500 chars", async () => {
    setMembership(true);
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      sizeValue: "27",
      notes: "a".repeat(501),
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Notas/i);
  });

  it("rejeita non-member", async () => {
    setMembership(false);
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      sizeValue: "27",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});

describe("recordSize — happy path", () => {
  it("registra sapato com data default = hoje", async () => {
    setMembership(true);
    mockChain.single.mockResolvedValueOnce({
      data: {
        id: "new-id",
        child_id: VALID_CHILD,
        kind: "shoe",
        custom_label: null,
        size_value: "27",
        recorded_on: new Date().toISOString().slice(0, 10),
        is_confirmation: false,
      },
      error: null,
    });
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      sizeValue: "27",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("new-id");
  });

  it("registra 'other' com customLabel='Pijama'", async () => {
    setMembership(true);
    mockChain.single.mockResolvedValueOnce({
      data: {
        id: "new-id-other",
        child_id: VALID_CHILD,
        kind: "other",
        custom_label: "Pijama",
        size_value: "4 anos",
        recorded_on: "2026-05-19",
        is_confirmation: false,
      },
      error: null,
    });
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "other",
      customLabel: "Pijama",
      sizeValue: "4 anos",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(true);
  });

  it("is_confirmation=true pula notify (vide caller)", async () => {
    setMembership(true);
    mockChain.single.mockResolvedValueOnce({
      data: { id: "conf-id" },
      error: null,
    });
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      sizeValue: "27",
      isConfirmation: true,
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(true);
    const { notifySaudeFamiliaSize } = await import(
      "@/lib/services/child-sizes-collab"
    );
    expect(notifySaudeFamiliaSize).not.toHaveBeenCalled();
  });
});

describe("recordSize — error mapping de PG", () => {
  it("FK 23503 vira mensagem amigável", async () => {
    setMembership(true);
    mockChain.single.mockResolvedValueOnce({
      data: null,
      error: { code: "23503", message: "FK violation" },
    });
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      sizeValue: "27",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Criança não encontrada/);
      expect(r.status).toBe(400);
    }
  });

  it("CHECK 23514 vira 'Dados inválidos'", async () => {
    setMembership(true);
    mockChain.single.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", message: "violates check" },
    });
    const r = await recordSize(sb, {
      groupId: VALID_GROUP,
      childId: VALID_CHILD,
      kind: "shoe",
      sizeValue: "27",
      createdBy: VALID_ACTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/inválidos/);
  });
});

describe("updateSize", () => {
  it("404 se row não existe", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116" },
    });
    const r = await updateSize(sb, {
      sizeId: "nonexistent",
      actorId: VALID_ACTOR,
      patch: { sizeValue: "28" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("403 se actor não é member", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { id: "s1", group_id: VALID_GROUP, kind: "shoe", custom_label: null },
      error: null,
    });
    setMembership(false);
    const r = await updateSize(sb, {
      sizeId: "s1",
      actorId: VALID_ACTOR,
      patch: { sizeValue: "28" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("patch vazio é no-op (200 OK)", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { id: "s1", group_id: VALID_GROUP, kind: "shoe", custom_label: null },
      error: null,
    });
    setMembership(true);
    const r = await updateSize(sb, {
      sizeId: "s1",
      actorId: VALID_ACTOR,
      patch: {},
    });
    expect(r.ok).toBe(true);
  });

  it("atualiza sizeValue + reseta size_value_numeric pra trigger recomputar", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { id: "s1", group_id: VALID_GROUP, kind: "shoe", custom_label: null },
      error: null,
    });
    setMembership(true);
    mockChain._setRes({ data: null, error: null });
    const r = await updateSize(sb, {
      sizeId: "s1",
      actorId: VALID_ACTOR,
      patch: { sizeValue: "28" },
    });
    expect(r.ok).toBe(true);
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        size_value: "28",
        size_value_numeric: null,
      }),
    );
  });

  it("rejeita data futura no patch", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { id: "s1", group_id: VALID_GROUP, kind: "shoe", custom_label: null },
      error: null,
    });
    setMembership(true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const r = await updateSize(sb, {
      sizeId: "s1",
      actorId: VALID_ACTOR,
      patch: { recordedOn: tomorrow.toISOString().slice(0, 10) },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/futura/i);
  });
});

describe("deleteSize", () => {
  it("404 se row não existe", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116" },
    });
    const r = await deleteSize(sb, { sizeId: "nope", actorId: VALID_ACTOR });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("403 se não é member", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { id: "s1", group_id: VALID_GROUP },
      error: null,
    });
    setMembership(false);
    const r = await deleteSize(sb, { sizeId: "s1", actorId: VALID_ACTOR });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("delete OK quando member", async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { id: "s1", group_id: VALID_GROUP },
      error: null,
    });
    setMembership(true);
    mockChain._setRes({ data: null, error: null });
    const r = await deleteSize(sb, { sizeId: "s1", actorId: VALID_ACTOR });
    expect(r.ok).toBe(true);
  });
});

describe("getCurrentSizes — derive latest per kind", () => {
  it("agrupa por kind e pega o mais recente", async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    mockChain._setRes({
      data: [
        {
          id: "s2",
          kind: "shoe",
          custom_label: null,
          size_value: "27",
          recorded_on: today.toISOString().slice(0, 10),
          is_confirmation: false,
          created_by: VALID_ACTOR,
          profiles: { full_name: "Henrique Pedro" },
        },
        {
          id: "s1",
          kind: "shoe",
          custom_label: null,
          size_value: "26",
          recorded_on: yesterday.toISOString().slice(0, 10),
          is_confirmation: false,
          created_by: VALID_ACTOR,
          profiles: { full_name: "Henrique Pedro" },
        },
        {
          id: "p1",
          kind: "pants",
          custom_label: null,
          size_value: "4 anos",
          recorded_on: today.toISOString().slice(0, 10),
          is_confirmation: false,
          created_by: VALID_ACTOR,
          profiles: { full_name: "Amanda Teixeira" },
        },
      ],
      error: null,
    });
    const result = await getCurrentSizes(sb, VALID_CHILD);
    expect(result).toHaveLength(2);
    const shoe = result.find((r) => r.kind === "shoe");
    expect(shoe?.size_value).toBe("27");
    expect(shoe?.size_id).toBe("s2");
    expect(shoe?.creator_first_name).toBe("Henrique");
    expect(shoe?.days_since_recorded).toBe(0);
    const pants = result.find((r) => r.kind === "pants");
    expect(pants?.creator_first_name).toBe("Amanda");
  });

  it("trata kind='other' por custom_label distinto", async () => {
    mockChain._setRes({
      data: [
        {
          id: "o1",
          kind: "other",
          custom_label: "Pijama",
          size_value: "4 anos",
          recorded_on: "2026-05-01",
          is_confirmation: false,
          created_by: VALID_ACTOR,
          profiles: { full_name: "Henrique" },
        },
        {
          id: "o2",
          kind: "other",
          custom_label: "Vestido",
          size_value: "6 anos",
          recorded_on: "2026-04-15",
          is_confirmation: false,
          created_by: VALID_ACTOR,
          profiles: { full_name: "Amanda" },
        },
      ],
      error: null,
    });
    const result = await getCurrentSizes(sb, VALID_CHILD);
    expect(result).toHaveLength(2);
    const labels = result.map((r) => r.custom_label).sort();
    expect(labels).toEqual(["Pijama", "Vestido"]);
  });

  it("returns [] em erro", async () => {
    mockChain._setRes({ data: null, error: { message: "boom" } });
    const result = await getCurrentSizes(sb, VALID_CHILD);
    expect(result).toEqual([]);
  });
});

describe("getSizeHistory", () => {
  it("retorna todas as rows mapeadas + filtrável por kind", async () => {
    mockChain._setRes({
      data: [
        {
          id: "h1",
          group_id: VALID_GROUP,
          child_id: VALID_CHILD,
          kind: "shoe",
          custom_label: null,
          size_value: "27",
          size_value_numeric: 27,
          recorded_on: "2026-05-19",
          notes: null,
          is_confirmation: false,
          priority: "info",
          created_by: VALID_ACTOR,
          created_at: "2026-05-19T12:00:00Z",
          updated_at: "2026-05-19T12:00:00Z",
          profiles: { full_name: "Henrique Pedro" },
        },
      ],
      error: null,
    });
    const r = await getSizeHistory(sb, VALID_CHILD);
    expect(r).toHaveLength(1);
    expect(r[0].size_value).toBe("27");
    expect(r[0].creator_first_name).toBe("Henrique");
  });
});
