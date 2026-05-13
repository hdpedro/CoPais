import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockRedirect, mockChain, mockSupabase, mockAdminChain, mockAdminClient } =
  vi.hoisted(() => {
    const mockRedirect = vi.fn();

    const mockChain: Record<string, any> = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      in: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    };
    for (const key of Object.keys(mockChain)) mockChain[key].mockReturnValue(mockChain);

    const mockSupabase = {
      auth: { getUser: vi.fn() },
      from: vi.fn().mockReturnValue(mockChain),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://test/file.pdf" } }),
        }),
      },
    };

    const mockAdminChain: Record<string, any> = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      single: vi.fn(),
    };
    for (const key of Object.keys(mockAdminChain)) mockAdminChain[key].mockReturnValue(mockAdminChain);

    const mockAdminClient = { from: vi.fn().mockReturnValue(mockAdminChain) };

    return { mockRedirect, mockChain, mockSupabase, mockAdminChain, mockAdminClient };
  });

// ---------------------------------------------------------------------------
// vi.mock declarations
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => { mockRedirect(...args); throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn(), getAll: vi.fn().mockReturnValue([]) }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue(mockSupabase) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn().mockReturnValue(mockAdminClient) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/push", () => ({
  createNotificationWithPush: vi.fn().mockResolvedValue(undefined),
  sendPushToUsers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/chat-notify", () => ({ postChatNotification: vi.fn().mockResolvedValue(undefined) }));
// 2026-05-13 (Saúde Foundation): actions/health.ts agora importa
// `@/lib/services/health-collab` que tem `import "server-only"`.
// Vitest roda em Node — stub o marker pra não explodir.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/health-collab", () => ({
  notifySaudeCreate: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  createAllergy, deleteAllergy, createMedication, logMedicationDose,
  createVaccinationRecord, createGrowthRecord, createAppointment,
  upsertMedicalInfo, createIllnessEpisode,
} from "@/actions/health";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

/**
 * Reset chains so every method returns the chain itself,
 * and the chain is "thenable" (resolves to {data:null, error:null}).
 * single() is set to return valid membership data by default.
 */
function setupChain(chain: Record<string, any>, singleData: any = { id: "member-1" }) {
  for (const key of Object.keys(chain)) {
    if (typeof chain[key]?.mockReturnValue === "function") {
      chain[key].mockReturnValue(chain);
    }
  }
  chain.then = (r: any) => r({ data: null, error: null });
  chain.single.mockResolvedValue({ data: singleData, error: null });
}

function expectRedirectContains(text: string) {
  const call = mockRedirect.mock.calls[0]?.[0] ?? "";
  const match = call.includes(text) || call.includes(encodeURIComponent(text)) || decodeURIComponent(call).includes(text);
  expect(match).toBe(true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("health actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    setupChain(mockChain, { id: "member-1", group_id: "group-1", full_name: "Test Child" });
    setupChain(mockAdminChain, { id: "cal-1" });

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
      error: null,
    });
  });

  // -------------------------------------------------------------------------
  // createAllergy
  // -------------------------------------------------------------------------

  describe("createAllergy", () => {
    const base = {
      groupId: "group-1", childId: "child-1", name: "Amendoim",
      allergyType: "food", severity: "grave", reaction: "Anafilaxia",
    };

    it("creates an allergy and redirects with success", async () => {
      await expect(createAllergy(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/saude/alergias?crianca=child-1&success=");
      expect(mockSupabase.from).toHaveBeenCalledWith("child_allergies");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createAllergy(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("redirects with error when membership check fails", async () => {
      // verifyMembership queries group_members.single() → null means no membership
      mockChain.single.mockResolvedValueOnce({ data: null, error: null });
      await expect(createAllergy(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Sem permissao");
    });
  });

  // -------------------------------------------------------------------------
  // deleteAllergy
  // -------------------------------------------------------------------------

  describe("deleteAllergy", () => {
    it("deletes an allergy and redirects with success", async () => {
      // 1st single: fetch allergy record
      mockChain.single
        .mockResolvedValueOnce({ data: { id: "allergy-1", group_id: "group-1", child_id: "child-1" }, error: null })
        // 2nd single: membership
        .mockResolvedValueOnce({ data: { id: "member-1" }, error: null });

      await expect(deleteAllergy(fd({ allergyId: "allergy-1" }))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/saude/alergias?crianca=child-1&success=");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(deleteAllergy(fd({ allergyId: "allergy-1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });

  // -------------------------------------------------------------------------
  // createMedication
  // -------------------------------------------------------------------------

  describe("createMedication", () => {
    const base = {
      groupId: "group-1", childId: "child-1", name: "Amoxicilina",
      dosage: "5ml", frequency: "8 em 8 horas", frequencyHours: "8",
      reason: "Infeccao de ouvido", prescribedBy: "Dr. Silva",
      startDate: "2026-06-01", endDate: "2026-06-10", notes: "Tomar com comida",
    };

    it("creates a medication and redirects with success", async () => {
      await expect(createMedication(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/saude/medicamentos?success=");
      expect(mockSupabase.from).toHaveBeenCalledWith("active_medications");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createMedication(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });

  // -------------------------------------------------------------------------
  // logMedicationDose
  // -------------------------------------------------------------------------

  describe("logMedicationDose", () => {
    const base = { medicationId: "med-1", redirectTo: "/saude/medicamentos" };

    it("logs a medication dose and redirects with success", async () => {
      // getGroupIdFromRecord: fetch record's group_id
      mockChain.single
        .mockResolvedValueOnce({ data: { group_id: "group-1" }, error: null })
        // verifyMembership
        .mockResolvedValueOnce({ data: { id: "member-1" }, error: null })
        // medication frequency_hours
        .mockResolvedValueOnce({ data: { frequency_hours: 8 }, error: null });

      // No previous doses
      const noData = { ...mockChain, then: (r: any) => r({ data: [], error: null }) };
      mockChain.limit.mockReturnValueOnce(noData);

      await expect(logMedicationDose(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("success=");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(logMedicationDose(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("blocks dose if last dose was less than 30 minutes ago", async () => {
      mockChain.single
        .mockResolvedValueOnce({ data: { group_id: "group-1" }, error: null })
        .mockResolvedValueOnce({ data: { id: "member-1" }, error: null })
        .mockResolvedValueOnce({ data: { frequency_hours: 8 }, error: null });

      const recentDose = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const recent = { ...mockChain, then: (r: any) => r({ data: [{ administered_at: recentDose }], error: null }) };
      mockChain.limit.mockReturnValueOnce(recent);

      await expect(logMedicationDose(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("menos de 30 minutos");
    });
  });

  // -------------------------------------------------------------------------
  // createVaccinationRecord
  // -------------------------------------------------------------------------

  describe("createVaccinationRecord", () => {
    const base = {
      groupId: "group-1", childId: "child-1", vaccineName: "Pentavalente",
      doseLabel: "2a dose", administeredDate: "2026-06-15",
      batchNumber: "ABC123", location: "UBS Central", notes: "Sem reacao",
    };

    it("creates a vaccination record and redirects with success", async () => {
      await expect(createVaccinationRecord(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/saude/vacinas?success=");
      expect(mockSupabase.from).toHaveBeenCalledWith("vaccination_records");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createVaccinationRecord(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });

  // -------------------------------------------------------------------------
  // createGrowthRecord
  // -------------------------------------------------------------------------

  describe("createGrowthRecord", () => {
    const base = {
      groupId: "group-1", childId: "child-1", measuredDate: "2026-06-15",
      weightKg: "12.5", heightCm: "85", headCm: "48", notes: "Crescendo bem",
    };

    it("creates a growth record and redirects with success", async () => {
      await expect(createGrowthRecord(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/saude/crescimento?success=");
      expect(mockSupabase.from).toHaveBeenCalledWith("growth_records");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createGrowthRecord(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });

  // -------------------------------------------------------------------------
  // createAppointment
  // -------------------------------------------------------------------------

  describe("createAppointment", () => {
    const base = {
      groupId: "group-1", childId: "child-1", professionalId: "prof-1",
      title: "Consulta pediatra", appointmentDate: "2026-07-01",
      appointmentTime: "10:00", location: "Clinica ABC",
      notes: "Levar cartao de vacinas", appointmentType: "routine",
    };

    it("creates an appointment and redirects with success", async () => {
      // membership
      mockChain.single.mockResolvedValueOnce({ data: { id: "member-1" }, error: null });

      // insert().select().single() → appointment
      const insertSelectSingle = vi.fn().mockResolvedValue({ data: { id: "appt-1" }, error: null });
      mockChain.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ single: insertSelectSingle }),
      });

      // Admin calendar event insert().select().single()
      const adminSingle = vi.fn().mockResolvedValue({ data: { id: "cal-1" }, error: null });
      mockAdminChain.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ single: adminSingle }),
      });

      // child name for push
      mockChain.single.mockResolvedValueOnce({ data: { full_name: "Joao Silva" }, error: null });

      // getOtherGroupMembers
      const members = { ...mockChain, then: (r: any) => r({ data: [{ user_id: "other-user" }], error: null }) };
      mockChain.neq.mockReturnValueOnce(members);

      await expect(createAppointment(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/saude/consultas?success=");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createAppointment(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });

  // -------------------------------------------------------------------------
  // upsertMedicalInfo
  // -------------------------------------------------------------------------

  describe("upsertMedicalInfo", () => {
    const base = {
      childId: "child-1", groupId: "group-1", bloodType: "O+",
      insuranceName: "Unimed", insuranceNumber: "12345",
      susNumber: "987654", primaryPediatricianId: "prof-1",
    };

    it("upserts medical info and returns success", async () => {
      const result = await upsertMedicalInfo(fd(base));
      expect(result).toEqual({ success: true });
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(upsertMedicalInfo(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });

  // -------------------------------------------------------------------------
  // createIllnessEpisode
  // -------------------------------------------------------------------------

  describe("createIllnessEpisode", () => {
    const base = {
      groupId: "group-1", childId: "child-1", title: "Gripe",
      symptoms: "febre,tosse,coriza", startDate: "2026-06-10",
      diagnosis: "Gripe A", notes: "Repouso recomendado",
      severity: "moderado", hospitalVisit: "false",
    };

    it("creates an illness episode and redirects with success", async () => {
      await expect(createIllnessEpisode(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/saude/doencas?success=");
      expect(mockSupabase.from).toHaveBeenCalledWith("illness_episodes");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createIllnessEpisode(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("redirects with error when membership check fails", async () => {
      mockChain.single.mockResolvedValueOnce({ data: null, error: null });
      await expect(createIllnessEpisode(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Sem permissao");
    });

    it("includes hospital fields when hospitalVisit is true", async () => {
      const f = fd({
        ...base, hospitalVisit: "true",
        hospitalName: "Hospital Sirio-Libanes", hospitalDate: "2026-06-11",
      });

      await expect(createIllnessEpisode(f)).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/saude/doencas?success=");

      const insertCall = mockChain.insert.mock.calls[0][0];
      expect(insertCall).toMatchObject({
        hospital_visit: true,
        hospital_name: "Hospital Sirio-Libanes",
        hospital_date: "2026-06-11",
      });
    });
  });
});
