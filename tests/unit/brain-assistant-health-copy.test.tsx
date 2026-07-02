/* ------------------------------------------------------------------ */
/* Widget do assistente — copy de CONSULTA (Playbook de Saúde) no        */
/* confirmar/desfazer, em jsdom (RTL + MSW).                             */
/*                                                                      */
/* Falha real de UX pega no E2E: o intake de saúde reusava a copy        */
/* ESCOLAR ("N provas no calendário escolar", com N = medicamentos!).    */
/* Aqui trava-se: (a) saúde fala de consulta/Saúde; (b) o escolar segue  */
/* BYTE-IDÊNTICO ao que está live (regressão = prioridade máxima).       */
/* ------------------------------------------------------------------ */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { I18nProvider } from "@/i18n/provider";
import AIAssistant from "@/components/AIAssistant";

/** Passa em looksLikeConsultText (consulta+pediatra+alergia, "dia 5"/ago) e
 *  NÃO em looksLikeExamText (sem palavra de prova). */
const CONSULT_TEXT =
  "A consulta do Lucas foi boa. A pediatra disse que é uma alergia leve, passou antialérgico por sete dias e pediu retorno no dia 5 de agosto.";
/** Passa em looksLikeExamText (prova + 12/08). */
const EXAM_TEXT = "A prova de matemática do Martim é dia 12/08.";

const HEALTH_INTAKE = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  planHash: "hash-h",
  confirmationToken: "tok-h",
  count: 1, // nº de MEDICAMENTOS (não pode virar "1 prova")
  doc: "health",
};

const SCHOOL_INTAKE = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  planHash: "hash-s",
  confirmationToken: "tok-s",
  count: 1, // nº de provas
};

function renderUI() {
  return render(
    <I18nProvider initialLocale="pt">
      <AIAssistant groupId="g-test" />
    </I18nProvider>,
  );
}

/** Abre o painel e envia um texto pela caixa de mensagem. */
async function openAndSend(text: string) {
  const launchers = screen.getAllByRole("button", { name: /assistente/i });
  fireEvent.click(launchers[0]);
  const input = await screen.findByPlaceholderText("Digite sua mensagem...");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("AIAssistant — copy de saúde no confirmar/desfazer", () => {
  afterEach(() => cleanup());

  it("consulta: confirmar fala de Saúde (não 'provas'); desfazer fala de registros", async () => {
    server.use(
      http.post("*/api/ai/assistant/consult-text", () =>
        HttpResponse.json({ content: "🩺 Organizei a consulta do Otto. Quer que eu registre?", intake: HEALTH_INTAKE, link: "/saude" }),
      ),
      http.post("*/api/brain/intakes/:id/confirm", () =>
        HttpResponse.json({ kind: "executed", intakeId: HEALTH_INTAKE.id, createdCount: 4 }),
      ),
      http.delete("*/api/brain/intakes/:id", () => HttpResponse.json({ kind: "undone", removed: 4, detached: 0 })),
    );
    renderUI();
    await openAndSend(CONSULT_TEXT);

    // Prévia chegou → botões de confirmação
    await screen.findByText("🩺 Organizei a consulta do Otto. Quer que eu registre?");
    fireEvent.click(await screen.findByText("✅ Confirmar e adicionar"));

    // Copy de SAÚDE — e nada de "prova"/"calendário escolar".
    const okMsg = await screen.findByText("✅ Pronto! Registrei a consulta em Saúde. Se precisar, é só tocar em Desfazer.");
    expect(okMsg).toBeInTheDocument();
    expect(screen.queryByText(/calendário escolar/)).toBeNull();
    expect(screen.queryByText(/1 prova\b/)).toBeNull();

    // Desfazer → registros da consulta (removed vem da API: 4).
    fireEvent.click(await screen.findByText("↩️ Desfazer"));
    expect(await screen.findByText("Desfeito — removi 4 registros da consulta.")).toBeInTheDocument();
  });

  it("consulta: registro alterado depois → aviso aponta pra Saúde", async () => {
    server.use(
      http.post("*/api/ai/assistant/consult-text", () =>
        HttpResponse.json({ content: "🩺 Prévia da consulta.", intake: HEALTH_INTAKE, link: "/saude" }),
      ),
      http.post("*/api/brain/intakes/:id/confirm", () =>
        HttpResponse.json({ kind: "executed", intakeId: HEALTH_INTAKE.id, createdCount: 2 }),
      ),
      http.delete("*/api/brain/intakes/:id", () => HttpResponse.json({ kind: "undone", removed: 1, detached: 1 })),
    );
    renderUI();
    await openAndSend(CONSULT_TEXT);
    await screen.findByText("🩺 Prévia da consulta.");
    fireEvent.click(await screen.findByText("✅ Confirmar e adicionar"));
    fireEvent.click(await screen.findByText("↩️ Desfazer"));
    expect(
      await screen.findByText("Desfeito — removi 1 registro da consulta. (1 registro foi alterado depois e continua em Saúde.)"),
    ).toBeInTheDocument();
  });

  it("REGRESSÃO escolar: confirmar/desfazer seguem com a copy live, byte-idêntica", async () => {
    server.use(
      http.post("*/api/ai/assistant/exam-text", () =>
        HttpResponse.json({ content: "📅 Encontrei 1 prova. Confirmar?", intake: SCHOOL_INTAKE, link: "/escola/calendario" }),
      ),
      http.post("*/api/brain/intakes/:id/confirm", () =>
        HttpResponse.json({ kind: "executed", intakeId: SCHOOL_INTAKE.id, createdCount: 1 }),
      ),
      http.delete("*/api/brain/intakes/:id", () => HttpResponse.json({ kind: "undone", removed: 1, detached: 0 })),
    );
    renderUI();
    await openAndSend(EXAM_TEXT);
    await screen.findByText("📅 Encontrei 1 prova. Confirmar?");
    fireEvent.click(await screen.findByText("✅ Confirmar e adicionar"));
    expect(
      await screen.findByText("✅ Pronto! Adicionei 1 prova no calendário escolar. Se precisar, é só tocar em Desfazer."),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByText("↩️ Desfazer"));
    expect(await screen.findByText("Desfeito — removi 1 prova.")).toBeInTheDocument();
  });
});
