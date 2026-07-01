import { describe, it, expect } from "vitest";
import {
  toSchoolLogPayload,
  buildSchoolLogPayloads,
  schoolLogPayloadHash,
  buildSchoolLogDescription,
  logTypeForActivity,
  BRAIN_SCHOOL_PRIORITY,
} from "@/lib/ai/brain/materialize-payload";
import {
  reconstructHashInputFromSchoolLogRow,
  type SchoolLogRowForUndo,
} from "@/lib/ai/brain/undo-reconstruct";
import type { ActivitySpec, MaterializationPlan } from "@/lib/ai/brain/types";

const CHILD = "7883efa8-cc9a-4625-9459-64233c3e763b";

function spec(over: Partial<ActivitySpec> = {}): ActivitySpec {
  return {
    childId: CHILD,
    name: "Prova de Matemática — AV2",
    category: "school",
    startDate: "2026-08-12",
    timeStart: "08:00",
    notes: "Cap. 7\n\nOnde estudar: Apostila SAS",
    checklist: ["calculadora"],
    subject: "Matemática",
    activityType: "prova",
    ...over,
  };
}

/** Simula a linha persistida (school_logs + events.event_time) a partir do payload. */
function rowFromPayload(p: ReturnType<typeof toSchoolLogPayload>): SchoolLogRowForUndo {
  return {
    child_id: p.child_id,
    log_type: p.log_type,
    title: p.title,
    subject: p.subject,
    description: p.description,
    log_date: p.log_date,
    priority: p.priority,
    event_time: p.event_time,
  };
}

describe("toSchoolLogPayload — shape", () => {
  it("monta o payload do school_log + título do calendário + prioridade", () => {
    const p = toSchoolLogPayload(spec());
    expect(p.child_id).toBe(CHILD);
    expect(p.log_type).toBe("exam");
    expect(p.title).toBe("Prova de Matemática — AV2");
    expect(p.subject).toBe("Matemática");
    expect(p.log_date).toBe("2026-08-12");
    expect(p.event_time).toBe("08:00");
    expect(p.priority).toBe(BRAIN_SCHOOL_PRIORITY);
    expect(p.priority).toBe("important");
    // calendarTitleFor: exam + subject → "📚 Prova · Matemática"
    expect(p.calendar_title).toBe("📚 Prova · Matemática");
    // descrição: conteúdo + materiais dobrados
    expect(p.description).toBe("Cap. 7\n\nOnde estudar: Apostila SAS\n\nMateriais: calculadora");
    expect(typeof p.payload_hash).toBe("string");
    expect(p.payload_hash).toHaveLength(64);
  });

  it("buildSchoolLogPayloads mapeia o plano inteiro", () => {
    const plan: MaterializationPlan = {
      docType: "school_calendar",
      confirmation: "single",
      activities: [spec({ name: "A" }), spec({ name: "B", startDate: "2026-08-13" })],
    };
    expect(buildSchoolLogPayloads(plan)).toHaveLength(2);
  });
});

describe("logTypeForActivity / buildSchoolLogDescription", () => {
  it("prova/outro → exam; trabalho/entrega → homework", () => {
    expect(logTypeForActivity("prova")).toBe("exam");
    expect(logTypeForActivity("outro")).toBe("exam");
    expect(logTypeForActivity(undefined)).toBe("exam");
    expect(logTypeForActivity(null)).toBe("exam");
    expect(logTypeForActivity("trabalho")).toBe("homework");
    expect(logTypeForActivity("entrega")).toBe("homework");
  });
  it("descrição: conteúdo + materiais; só conteúdo; só materiais; nada → null", () => {
    expect(buildSchoolLogDescription(spec({ notes: "Cap. 7", checklist: ["régua", "lápis"] }))).toBe(
      "Cap. 7\n\nMateriais: régua, lápis",
    );
    expect(buildSchoolLogDescription(spec({ notes: "Cap. 7", checklist: undefined }))).toBe("Cap. 7");
    expect(buildSchoolLogDescription(spec({ notes: null, checklist: ["calculadora"] }))).toBe(
      "Materiais: calculadora",
    );
    expect(buildSchoolLogDescription(spec({ notes: null, checklist: undefined }))).toBeNull();
  });
});

describe("hash round-trip (undo seguro) — o ponto crítico", () => {
  it("hash do commit == hash reconstruído da linha viva (não detacha à toa)", () => {
    const p = toSchoolLogPayload(spec());
    const reconstructed = schoolLogPayloadHash(reconstructHashInputFromSchoolLogRow(rowFromPayload(p)));
    expect(reconstructed).toBe(p.payload_hash);
  });

  it("event_time 'HH:MM:SS' do banco reconstrói pra 'HH:MM' e ainda bate", () => {
    const p = toSchoolLogPayload(spec({ timeStart: "08:00" }));
    const row = { ...rowFromPayload(p), event_time: "08:00:00" }; // Postgres pode devolver com segundos
    const reconstructed = schoolLogPayloadHash(reconstructHashInputFromSchoolLogRow(row));
    expect(reconstructed).toBe(p.payload_hash);
  });

  it("prova sem horário (event_time null) também bate no round-trip", () => {
    const p = toSchoolLogPayload(spec({ timeStart: null }));
    const reconstructed = schoolLogPayloadHash(reconstructHashInputFromSchoolLogRow(rowFromPayload(p)));
    expect(reconstructed).toBe(p.payload_hash);
  });

  it("editar a linha (título/matéria/descrição/prioridade) MUDA o hash → detacha (preserva edição)", () => {
    const p = toSchoolLogPayload(spec());
    const base = rowFromPayload(p);
    for (const edited of [
      { ...base, title: "Prova de Matemática — Recuperação" },
      { ...base, subject: "Geometria" },
      { ...base, description: "Cap. 8" },
      { ...base, priority: "info" },
      { ...base, log_date: "2026-08-13" },
      { ...base, event_time: "10:00" },
    ]) {
      const h = schoolLogPayloadHash(reconstructHashInputFromSchoolLogRow(edited));
      expect(h).not.toBe(p.payload_hash);
    }
  });
});
