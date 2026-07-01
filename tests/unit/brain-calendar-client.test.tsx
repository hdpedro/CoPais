/* ------------------------------------------------------------------ */
/* Verificação FUNCIONAL da UI em jsdom (RTL + MSW) — fecha parte do     */
/* gate visual sem navegador: render, consentimento, preview 3 zonas,    */
/* deseleção, e que o confirm envia keepIndices correto + estados.       */
/* (Não cobre pixels/responsivo — isso fica pra verificação visual.)     */
/* ------------------------------------------------------------------ */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { I18nProvider } from "@/i18n/provider";
import BrainCalendarClient from "@/app/(app)/escola/calendario/BrainCalendarClient";
import type { IntakePreview } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

const PREVIEW: IntakePreview = {
  intakeId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  docType: "school_calendar",
  confirmation: "single",
  planHash: "hash123",
  confirmationToken: "tok-123",
  priority: { level: "important", delivery: "digest" },
  impacts: [
    { kind: "same_day", severity: "attention", date: "2026-08-12", childId: CHILD, titleKey: "brain.impact.sameDay", titleVars: { childId: CHILD, count: 2, date: "2026-08-12" } },
  ],
  plan: {
    docType: "school_calendar",
    confirmation: "single",
    activities: [
      { childId: CHILD, name: "Prova de Matemática", category: "school", startDate: "2026-08-12" },
      { childId: CHILD, name: "Prova de História", category: "school", startDate: "2026-08-13", lowConfidenceFields: ["startDate"] },
    ],
  },
};

function renderUI() {
  return render(
    <I18nProvider initialLocale="pt">
      <BrainCalendarClient groupChildren={[{ id: CHILD, name: "Martim" }]} />
    </I18nProvider>,
  );
}

function pickFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "cal.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("BrainCalendarClient — fluxo funcional", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    server.use(
      http.post("*/api/brain/intakes", () => HttpResponse.json({ kind: "preview", preview: PREVIEW })),
    );
  });

  it("upload → consentimento → preview 3 zonas com itens", async () => {
    const { container } = renderUI();
    // upload screen
    expect(screen.getByText("Enviar foto do calendário")).toBeInTheDocument();
    pickFile(container);
    fireEvent.click(screen.getByText("Enviar foto do calendário"));
    // consentimento aparece antes do upload
    expect(screen.getByText(/Vamos analisar esta foto/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Entendi e quero continuar"));
    // preview
    await waitFor(() => expect(screen.getByText("O que vou criar")).toBeInTheDocument());
    expect(screen.getByText("O que encontrei")).toBeInTheDocument();
    expect(screen.getByText("O que muda")).toBeInTheDocument();
    expect(screen.getByText("Prova de Matemática")).toBeInTheDocument();
    expect(screen.getByText("Prova de História")).toBeInTheDocument();
    // impacto renderizado com nome da criança resolvido (não o id)
    expect(screen.getByText(/Martim tem 2 provas/)).toBeInTheDocument();
    // badge de baixa confiança no item 2
    expect(screen.getByText("Confira este campo")).toBeInTheDocument();
  });

  it("deseleção → confirm envia keepIndices só dos mantidos", async () => {
    let sentBody: unknown = null;
    server.use(
      http.post("*/api/brain/intakes/:id/confirm", async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ kind: "executed", intakeId: PREVIEW.intakeId, createdCount: 1 });
      }),
    );
    const { container } = renderUI();
    pickFile(container);
    fireEvent.click(screen.getByText("Enviar foto do calendário"));
    fireEvent.click(screen.getByText("Entendi e quero continuar"));
    await waitFor(() => expect(screen.getByText("O que vou criar")).toBeInTheDocument());

    // desmarca o item 1 (História) — checkboxes na ordem das atividades
    const checks = container.querySelectorAll('input[type="checkbox"]');
    expect(checks).toHaveLength(2);
    fireEvent.click(checks[1]); // desmarca História (índice 1)

    fireEvent.click(screen.getByText("Confirmar e criar"));
    await waitFor(() => expect(screen.getByText(/O Kindar vai avisar/)).toBeInTheDocument());

    expect(sentBody).toMatchObject({
      planHash: "hash123",
      confirmationToken: "tok-123",
      keepIndices: [0], // só Matemática
    });
  });

  it("editar um item → confirm envia edits com o campo alterado", async () => {
    let sentBody: { edits?: Array<{ index: number; name?: string }> } | null = null;
    server.use(
      http.post("*/api/brain/intakes/:id/confirm", async ({ request }) => {
        sentBody = (await request.json()) as typeof sentBody;
        return HttpResponse.json({ kind: "executed", intakeId: PREVIEW.intakeId, createdCount: 2 });
      }),
    );
    const { container } = renderUI();
    pickFile(container);
    fireEvent.click(screen.getByText("Enviar foto do calendário"));
    fireEvent.click(screen.getByText("Entendi e quero continuar"));
    await waitFor(() => expect(screen.getByText("O que vou criar")).toBeInTheDocument());

    // abre edição do 1º item e muda o título
    fireEvent.click(screen.getAllByText("Editar")[0]);
    const titleInput = screen.getByDisplayValue("Prova de Matemática");
    fireEvent.change(titleInput, { target: { value: "Prova AV2 Matemática" } });
    fireEvent.click(screen.getByText("Pronto"));
    // novo título aparece na visão read-only
    await waitFor(() => expect(screen.getByText("Prova AV2 Matemática")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Confirmar e criar"));
    await waitFor(() => expect(screen.getByText(/O Kindar vai avisar/)).toBeInTheDocument());

    expect(sentBody!.edits).toEqual([
      expect.objectContaining({ index: 0, name: "Prova AV2 Matemática" }),
    ]);
  });

  it("desfazer reseta pro upload (não trava no 'done')", async () => {
    server.use(
      http.post("*/api/brain/intakes/:id/confirm", () =>
        HttpResponse.json({ kind: "executed", intakeId: PREVIEW.intakeId, createdCount: 2 }),
      ),
      http.delete("*/api/brain/intakes/:id", () =>
        HttpResponse.json({ kind: "undone", removed: 2, detached: 0, message: "2 removido(s)." }),
      ),
    );
    const { container } = renderUI();
    pickFile(container);
    fireEvent.click(screen.getByText("Enviar foto do calendário"));
    fireEvent.click(screen.getByText("Entendi e quero continuar"));
    await waitFor(() => expect(screen.getByText("Confirmar e criar")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Confirmar e criar"));
    await waitFor(() => expect(screen.getByText("Desfazer")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Desfazer"));
    // volta pro upload (CTA reaparece) — não fica preso no 'done'
    await waitFor(() => expect(screen.getByText("Enviar foto do calendário")).toBeInTheDocument());
  });

  it("documento não reconhecido → mensagem calma (sem alarme)", async () => {
    server.use(
      http.post("*/api/brain/intakes", () => HttpResponse.json({ kind: "unknown_document", intakeId: "x", message: "ignorado" })),
    );
    const { container } = renderUI();
    pickFile(container);
    fireEvent.click(screen.getByText("Enviar foto do calendário"));
    fireEvent.click(screen.getByText("Entendi e quero continuar"));
    await waitFor(() => expect(screen.getByText(/Não tenho certeza do que é/)).toBeInTheDocument());
  });
});
