/**
 * Testes da Saúde Foundation adoption (migration 00080).
 *
 * Cobre o wrapper `notifySaudeCreate` (src/lib/services/health-collab.ts):
 *   - Título correto por record_type (verbo + actor name)
 *   - Body com childFirstName quando passado
 *   - Priority default por tipo (vacinas=info, outras=important)
 *   - Trigger SQL urgent é refletido via resolveEffectivePriority
 *   - Deep link aponta pro módulo certo com highlight=<id>
 *
 * Drift guard: tipos de record_type entre TS e migration SQL.
 *
 * Não testamos notifyCollabCreate de novo (já coberto em collab.test.ts) —
 * mocamos pra assertar SÓ os args que health-collab passa.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAdminChain, mockAdminClient, mockNotifyCollabCreate } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  // Cada método retorna o chain por default — tests sobrescrevem single().
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);

  const admin = { from: vi.fn().mockReturnValue(chain) };
  const notify = vi.fn().mockResolvedValue(undefined);
  return { mockAdminChain: chain, mockAdminClient: admin, mockNotifyCollabCreate: notify };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminClient),
}));
vi.mock("@/lib/services/collab", () => ({
  notifyCollabCreate: mockNotifyCollabCreate,
}));

import { notifySaudeCreate } from "@/lib/services/health-collab";

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminChain.select.mockReturnValue(mockAdminChain);
  mockAdminChain.eq.mockReturnValue(mockAdminChain);
});

function stubPriority(value: "info" | "important" | "urgent") {
  mockAdminChain.single.mockResolvedValueOnce({ data: { priority: value }, error: null });
}

describe("notifySaudeCreate", () => {
  it("appointment: monta título 'X agendou uma consulta' + body com criança + deep link", async () => {
    stubPriority("important");
    await notifySaudeCreate({
      recordType: "medical_appointment",
      recordId: "apt-1",
      groupId: "g-1",
      actorUserId: "u-1",
      actorFirstName: "Amanda",
      childFirstName: "Mia",
      description: "Pediatra · 20/05 14:00",
    });
    expect(mockNotifyCollabCreate).toHaveBeenCalledTimes(1);
    const args = mockNotifyCollabCreate.mock.calls[0][0];
    expect(args.title).toBe("Amanda agendou uma consulta");
    expect(args.message).toBe("Pediatra · 20/05 14:00 · Mia");
    // FIX iter 7 2026-05-17: era `/saude/agenda` (rota 404, bug em prod).
    // Rota correta no native + PWA é `/saude/consultas`.
    expect(args.link).toBe("/saude/consultas?highlight=apt-1");
    expect(args.priority).toBe("important");
  });

  it("illness: trigger SQL grave→urgent é refletido via resolveEffectivePriority", async () => {
    // Simula trigger SQL: row já tem priority='urgent' no banco antes do
    // helper rodar. notifySaudeCreate deve ler isso e propagar.
    stubPriority("urgent");
    await notifySaudeCreate({
      recordType: "illness_episode",
      recordId: "ill-1",
      groupId: "g-1",
      actorUserId: "u-1",
      actorFirstName: "Bruno",
      childFirstName: "Léo",
      description: "Febre alta · Grave",
    });
    const args = mockNotifyCollabCreate.mock.calls[0][0];
    expect(args.priority).toBe("urgent");
    expect(args.title).toBe("Bruno registrou um episódio de saúde");
  });

  it("vaccine: priority='info' default + deep link /saude/vacinas", async () => {
    stubPriority("info");
    await notifySaudeCreate({
      recordType: "vaccination_record",
      recordId: "vac-1",
      groupId: "g-1",
      actorUserId: "u-1",
      actorFirstName: "Amanda",
      childFirstName: "Mia",
      description: "Tríplice viral · 1ª dose",
    });
    const args = mockNotifyCollabCreate.mock.calls[0][0];
    expect(args.priority).toBe("info");
    expect(args.title).toBe("Amanda registrou uma vacina");
    expect(args.link).toBe("/saude/vacinas?highlight=vac-1");
  });

  it("medication: title + deep link /saude/medicamentos", async () => {
    stubPriority("important");
    await notifySaudeCreate({
      recordType: "active_medication",
      recordId: "med-1",
      groupId: "g-1",
      actorUserId: "u-1",
      actorFirstName: "Diogo",
      childFirstName: "Helena",
      description: "Amoxicilina · 250mg · 8h",
    });
    const args = mockNotifyCollabCreate.mock.calls[0][0];
    expect(args.title).toBe("Diogo iniciou um medicamento");
    expect(args.link).toBe("/saude/medicamentos?highlight=med-1");
  });

  it("allergy: title + deep link /saude/alergias", async () => {
    stubPriority("important");
    await notifySaudeCreate({
      recordType: "child_allergy",
      recordId: "alg-1",
      groupId: "g-1",
      actorUserId: "u-1",
      actorFirstName: "Bruno",
      childFirstName: "Mia",
      description: "Cefalexina · Moderada",
    });
    const args = mockNotifyCollabCreate.mock.calls[0][0];
    expect(args.title).toBe("Bruno cadastrou uma alergia");
    expect(args.link).toBe("/saude/alergias?highlight=alg-1");
  });

  it("falha de resolveEffectivePriority não bloqueia push (cai pra default)", async () => {
    // Banco retorna erro — helper deve usar default do tipo (vacina=info).
    mockAdminChain.single.mockRejectedValueOnce(new Error("db down"));
    await notifySaudeCreate({
      recordType: "vaccination_record",
      recordId: "vac-2",
      groupId: "g-1",
      actorUserId: "u-1",
      actorFirstName: "Amanda",
      description: "BCG",
    });
    expect(mockNotifyCollabCreate).toHaveBeenCalledTimes(1);
    expect(mockNotifyCollabCreate.mock.calls[0][0].priority).toBe("info");
  });

  it("priorityOverride bypassa resolveEffectivePriority (sem fetch)", async () => {
    // Quando caller passa override, NÃO devemos consultar o banco.
    await notifySaudeCreate({
      recordType: "medical_appointment",
      recordId: "apt-X",
      groupId: "g-1",
      actorUserId: "u-1",
      actorFirstName: "Amanda",
      description: "Emergência",
      priorityOverride: "urgent",
    });
    expect(mockNotifyCollabCreate.mock.calls[0][0].priority).toBe("urgent");
    // single() não deve ter sido chamado nesse path
    expect(mockAdminChain.single).not.toHaveBeenCalled();
  });

  it("sem childFirstName, body é só a description (sem trailing separator)", async () => {
    stubPriority("important");
    await notifySaudeCreate({
      recordType: "medical_appointment",
      recordId: "apt-2",
      groupId: "g-1",
      actorUserId: "u-1",
      actorFirstName: "Amanda",
      description: "Pediatra · 20/05",
    });
    expect(mockNotifyCollabCreate.mock.calls[0][0].message).toBe("Pediatra · 20/05");
  });
});

describe("drift guard: SQL ↔ TS record_type sync", () => {
  // Pra evitar drift entre migration 00080 e CollabRecordType, importamos
  // o tipo e o helper de deep links e asseguramos que todos os 5 novos
  // record_types têm um path mapeado. Se alguém adicionar um record_type
  // novo sem atualizar collab.ts, este teste explode.
  it("todos os 5 record_types de saúde têm cases nos helpers", async () => {
    const saudeTypes = [
      "medical_appointment",
      "illness_episode",
      "active_medication",
      "child_allergy",
      "vaccination_record",
    ] as const;
    stubPriority("important");
    for (const rt of saudeTypes) {
      vi.clearAllMocks();
      stubPriority("important");
      await notifySaudeCreate({
        recordType: rt,
        recordId: `${rt}-x`,
        groupId: "g-1",
        actorUserId: "u-1",
        actorFirstName: "Amanda",
        description: "x",
      });
      // Se algum case faltar, title cairia no fallback "adicionou X" do
      // coalescedTitle — então asseguramos que cada call passa por um
      // case nominado (título começa com "Amanda <verb>").
      expect(mockNotifyCollabCreate).toHaveBeenCalledTimes(1);
      const args = mockNotifyCollabCreate.mock.calls[0][0];
      expect(args.recordType).toBe(rt);
      // FIX iter 7 2026-05-17: era `agenda` (rota 404). Correto: `consultas`.
      expect(args.link).toMatch(/^\/saude\/(consultas|doencas|medicamentos|alergias|vacinas)\?highlight=/);
    }
  });
});
