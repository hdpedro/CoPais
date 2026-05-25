/**
 * notification-prefs.test.ts
 *
 * Cobre lógica crítica do controle granular de notificações:
 *  - mapTypeToCategory (mapping correto de type → category)
 *  - isWithinQuietHours (boundary cases incluindo atravessar midnight)
 *  - shouldSendPush (priorização: urgent > mute > category > quiet_hours)
 *
 * Tests não tocam DB — mocka createAdminClient.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapTypeToCategory } from "@/lib/push";

// Service usa `import "server-only"` que falha em test runtime — mock vazio
// faz o import no-op (server-only só existe pra fail-fast em build, não tem
// API runtime). Necessário porque jsdom/node não tem o env de Server Component.
vi.mock("server-only", () => ({}));

// Mock dos clients DB antes de importar o service
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { shouldSendPush } from "@/lib/services/notification-prefs";

interface MockProfile {
  notification_prefs?: {
    quiet_hours?: { enabled: boolean; start: string; end: string };
    mute_until?: string | null;
    categories?: Record<string, boolean>;
  };
}

function mockAdminClient(profileRow: MockProfile | null) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: profileRow }),
    in: vi.fn().mockReturnThis(),
  };
  return {
    from: vi.fn().mockReturnValue(mockChain),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ─────────────────────────────────────────────────────────────────────── */
/* mapTypeToCategory                                                       */
/* ─────────────────────────────────────────────────────────────────────── */

describe("mapTypeToCategory", () => {
  it("mapeia activity types corretamente", () => {
    expect(mapTypeToCategory("activity_reminder")).toBe("activity_reminders");
    expect(mapTypeToCategory("activity_digest")).toBe("activity_digest");
    expect(mapTypeToCategory("activity_status_update")).toBe("activity_reminders");
    expect(mapTypeToCategory("custody_change")).toBe("activity_reminders");
  });

  it("mapeia health Foundation Collab pra health_collab", () => {
    expect(mapTypeToCategory("medical_appointment_created")).toBe("health_collab");
    expect(mapTypeToCategory("illness_episode_created")).toBe("health_collab");
    expect(mapTypeToCategory("active_medication_created")).toBe("health_collab");
    expect(mapTypeToCategory("child_allergy_created")).toBe("health_collab");
    expect(mapTypeToCategory("vaccination_record_created")).toBe("health_collab");
    expect(mapTypeToCategory("health_growth_created")).toBe("health_collab");
    expect(mapTypeToCategory("child_size_created")).toBe("health_collab");
  });

  it("mapeia vaccine_alerts separadamente do Foundation Collab", () => {
    expect(mapTypeToCategory("vaccine_due")).toBe("vaccine_alerts");
    expect(mapTypeToCategory("vaccine_overdue")).toBe("vaccine_alerts");
    expect(mapTypeToCategory("vaccine_campaign")).toBe("vaccine_alerts");
    // health_vaccine_created (direct push from actions/health.ts) = vaccine_alerts
    expect(mapTypeToCategory("health_vaccine_created")).toBe("vaccine_alerts");
  });

  it("mapeia chat e suas variações", () => {
    expect(mapTypeToCategory("chat_message")).toBe("chat");
    expect(mapTypeToCategory("chat_message_sent")).toBe("chat");
  });

  it("mapeia Foundation Collab por record_type", () => {
    expect(mapTypeToCategory("school_log_created")).toBe("school_collab");
    expect(mapTypeToCategory("expense_created")).toBe("expense_collab");
    expect(mapTypeToCategory("expense_approved")).toBe("expense_collab");
    expect(mapTypeToCategory("expense_cancelled")).toBe("expense_collab");
  });

  it("mapeia decisões e swaps", () => {
    expect(mapTypeToCategory("decision_created")).toBe("decisions");
    expect(mapTypeToCategory("decision_voted")).toBe("decisions");
    expect(mapTypeToCategory("decision_closed")).toBe("decisions");
    expect(mapTypeToCategory("swap_request_created")).toBe("swap");
    expect(mapTypeToCategory("swap_approved")).toBe("swap");
  });

  it("mapeia tipos marketing-ish pra retention", () => {
    expect(mapTypeToCategory("retention")).toBe("retention");
    expect(mapTypeToCategory("retention_d3")).toBe("retention");
    expect(mapTypeToCategory("trial_reminder")).toBe("retention");
    expect(mapTypeToCategory("renewal_reminder")).toBe("retention");
    expect(mapTypeToCategory("signup_rescue")).toBe("retention");
  });

  it("mapeia balance/settlement/birthday", () => {
    expect(mapTypeToCategory("balance_proposed")).toBe("balance_operations");
    expect(mapTypeToCategory("balance_approved")).toBe("balance_operations");
    expect(mapTypeToCategory("settlement_created")).toBe("settlements");
    expect(mapTypeToCategory("settlement_confirmed")).toBe("settlements");
    expect(mapTypeToCategory("birthday_reminder")).toBe("birthday");
  });

  it("retorna null pra tipos desconhecidos (backward-compat)", () => {
    expect(mapTypeToCategory("system_notification")).toBeNull();
    expect(mapTypeToCategory("custom_xyz")).toBeNull();
    expect(mapTypeToCategory("")).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* shouldSendPush                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

describe("shouldSendPush", () => {
  describe("isUrgent override", () => {
    it("bypassa TUDO quando isUrgent=true", async () => {
      // Mesmo com mute_until, quiet_hours, e category disabled
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: {
            mute_until: new Date(Date.now() + 60 * 60_000).toISOString(),
            quiet_hours: { enabled: true, start: "00:00", end: "23:59" },
            categories: { health_collab: false },
          },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "health_collab", { isUrgent: true });
      expect(decision.send).toBe(true);
    });
  });

  describe("mute_until", () => {
    it("skipa quando now < mute_until", async () => {
      const futureUntil = new Date(Date.now() + 60 * 60_000).toISOString();
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: {
            mute_until: futureUntil,
          },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "chat");
      expect(decision.send).toBe(false);
      expect(decision.reason).toBe("muted_until");
    });

    it("envia quando now > mute_until (expirou)", async () => {
      const pastUntil = new Date(Date.now() - 60 * 60_000).toISOString();
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: { mute_until: pastUntil },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "chat");
      expect(decision.send).toBe(true);
    });

    it("envia quando mute_until é null", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: { mute_until: null },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "chat");
      expect(decision.send).toBe(true);
    });
  });

  describe("category disabled", () => {
    it("skipa quando categoria é false explícito", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: { categories: { retention: false } },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "retention");
      expect(decision.send).toBe(false);
      expect(decision.reason).toBe("category_disabled:retention");
    });

    it("envia quando categoria é true explícito", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: { categories: { chat: true } },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "chat");
      expect(decision.send).toBe(true);
    });

    it("envia quando categoria está AUSENTE (default permissivo)", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: { categories: {} }, // sem nenhuma categoria
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "chat");
      expect(decision.send).toBe(true);
    });

    it("não bloqueia outras categorias quando uma é desabilitada", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: { categories: { retention: false } },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const chatDecision = await shouldSendPush("user-1", "chat");
      expect(chatDecision.send).toBe(true);
    });
  });

  describe("fail-open", () => {
    it("envia push quando DB falha (preserve UX)", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        {
          from: vi.fn().mockImplementation(() => {
            throw new Error("DB down");
          }),
        } as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "chat");
      expect(decision.send).toBe(true);
    });

    it("envia push quando user não tem profile (sem prefs)", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient(null) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "chat");
      expect(decision.send).toBe(true);
    });
  });

  describe("priority order", () => {
    it("urgent bypassa MESMO com mute+category disabled+quiet_hours", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: {
            mute_until: new Date(Date.now() + 60 * 60_000).toISOString(),
            quiet_hours: { enabled: true, start: "00:00", end: "23:59" },
            categories: { health_collab: false },
          },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "health_collab", { isUrgent: true });
      expect(decision.send).toBe(true);
    });

    it("mute_until checa ANTES de category", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: {
            mute_until: new Date(Date.now() + 60 * 60_000).toISOString(),
            categories: { chat: true }, // permitido
          },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "chat");
      expect(decision.send).toBe(false);
      expect(decision.reason).toBe("muted_until");
    });

    it("category checa ANTES de quiet_hours", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        mockAdminClient({
          notification_prefs: {
            categories: { chat: false },
            quiet_hours: { enabled: true, start: "00:00", end: "23:59" },
          },
        }) as unknown as ReturnType<typeof createAdminClient>,
      );
      const decision = await shouldSendPush("user-1", "chat");
      expect(decision.send).toBe(false);
      expect(decision.reason).toBe("category_disabled:chat");
    });
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* quiet_hours boundary tests                                              */
/* ─────────────────────────────────────────────────────────────────────── */

describe("shouldSendPush quiet_hours boundaries", () => {
  it("bloqueia DENTRO de janela same-day 13:00-17:00 BRT", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({
        notification_prefs: {
          quiet_hours: { enabled: true, start: "13:00", end: "17:00" },
        },
      }) as unknown as ReturnType<typeof createAdminClient>,
    );
    // 15:00 BRT = 18:00 UTC
    const now = new Date("2026-05-22T18:00:00Z");
    const decision = await shouldSendPush("user-1", "chat", { now });
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe("quiet_hours");
  });

  it("envia FORA da janela same-day", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({
        notification_prefs: {
          quiet_hours: { enabled: true, start: "13:00", end: "17:00" },
        },
      }) as unknown as ReturnType<typeof createAdminClient>,
    );
    // 12:00 BRT = 15:00 UTC (antes da janela)
    const now = new Date("2026-05-22T15:00:00Z");
    const decision = await shouldSendPush("user-1", "chat", { now });
    expect(decision.send).toBe(true);
  });

  it("bloqueia DENTRO de janela overnight 22:00-07:00 BRT (depois da meia-noite)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({
        notification_prefs: {
          quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
        },
      }) as unknown as ReturnType<typeof createAdminClient>,
    );
    // 03:00 BRT = 06:00 UTC — dentro da janela overnight
    const now = new Date("2026-05-22T06:00:00Z");
    const decision = await shouldSendPush("user-1", "chat", { now });
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe("quiet_hours");
  });

  it("bloqueia DENTRO de janela overnight 22:00-07:00 BRT (antes da meia-noite)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({
        notification_prefs: {
          quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
        },
      }) as unknown as ReturnType<typeof createAdminClient>,
    );
    // 23:00 BRT = 02:00 UTC do dia seguinte
    const now = new Date("2026-05-23T02:00:00Z");
    const decision = await shouldSendPush("user-1", "chat", { now });
    expect(decision.send).toBe(false);
  });

  it("envia FORA da janela overnight (manhã)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({
        notification_prefs: {
          quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
        },
      }) as unknown as ReturnType<typeof createAdminClient>,
    );
    // 09:00 BRT = 12:00 UTC — fora da janela
    const now = new Date("2026-05-22T12:00:00Z");
    const decision = await shouldSendPush("user-1", "chat", { now });
    expect(decision.send).toBe(true);
  });

  it("envia na borda EXATA do end (inclusive boundary)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({
        notification_prefs: {
          quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
        },
      }) as unknown as ReturnType<typeof createAdminClient>,
    );
    // Exatamente 07:00 BRT = 10:00 UTC — JÁ fora (end é exclusivo)
    const now = new Date("2026-05-22T10:00:00Z");
    const decision = await shouldSendPush("user-1", "chat", { now });
    expect(decision.send).toBe(true);
  });

  it("bloqueia na borda EXATA do start (inclusive boundary)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({
        notification_prefs: {
          quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
        },
      }) as unknown as ReturnType<typeof createAdminClient>,
    );
    // Exatamente 22:00 BRT = 01:00 UTC do dia seguinte
    const now = new Date("2026-05-23T01:00:00Z");
    const decision = await shouldSendPush("user-1", "chat", { now });
    expect(decision.send).toBe(false);
  });

  it("quiet_hours desativado → envia mesmo dentro da janela", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({
        notification_prefs: {
          quiet_hours: { enabled: false, start: "00:00", end: "23:59" },
        },
      }) as unknown as ReturnType<typeof createAdminClient>,
    );
    const now = new Date("2026-05-22T15:00:00Z");
    const decision = await shouldSendPush("user-1", "chat", { now });
    expect(decision.send).toBe(true);
  });

  it("janela zero-length (start === end) não bloqueia ninguém", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({
        notification_prefs: {
          quiet_hours: { enabled: true, start: "12:00", end: "12:00" },
        },
      }) as unknown as ReturnType<typeof createAdminClient>,
    );
    const now = new Date("2026-05-22T15:00:00Z");
    const decision = await shouldSendPush("user-1", "chat", { now });
    expect(decision.send).toBe(true);
  });
});
