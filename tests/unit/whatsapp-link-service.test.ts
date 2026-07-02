/**
 * Tests do `services/whatsapp-link.ts` — single source of truth pra vincular
 * um número de WhatsApp (PWA action + Native API `/api/native/whatsapp`).
 *
 * Regressão principal (bug 2026-07-01, Família Coelho — "Erro na vinculação
 * do WhatsApp" no Android e PWA):
 *   - `whatsapp_phone_links` tem UNIQUE(phone_number) GLOBAL (00043).
 *   - `unlink` faz soft-delete (is_active=false) mas MANTÉM a linha.
 *   - O request antigo procurava a linha filtrando is_active=true, não
 *     enxergava a soft-deleted, caía num INSERT que colidia no UNIQUE
 *     (23505). O erro NUNCA era checado → mandava OTP ("Código enviado!")
 *     e retornava sucesso sem gravar a pendência → verify respondia
 *     "Nenhuma vinculação pendente encontrada". Conta travava pra sempre.
 *
 * Guardas deste arquivo:
 *   1. Havendo linha dona do número (mesmo INATIVA), REUSA via UPDATE —
 *      NUNCA chama insert (era o insert que colidia).
 *   2. Todo write é checado: update/insert com erro → falha real, e o OTP
 *      NÃO é enviado (nunca reporta "sucesso" sem persistir).
 *   3. Só manda o OTP DEPOIS de persistir a pendência.
 *   4. Rejeita só quando o número está ATIVO+VERIFICADO em outra conta.
 *   5. verify usa maybeSingle + valida code/expiração.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendText, mockSendTemplate, mockReport } = vi.hoisted(() => ({
  mockSendText: vi.fn().mockResolvedValue(undefined),
  mockSendTemplate: vi.fn().mockResolvedValue(undefined),
  mockReport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: mockSendText,
  sendAuthTemplate: mockSendTemplate,
}));
vi.mock("@/lib/error-tracking/report-server", () => ({
  reportServerError: mockReport,
}));

import {
  requestWhatsAppLinkService,
  verifyWhatsAppLinkService,
} from "@/lib/services/whatsapp-link";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Mock builder: cada método encadeável devolve o próprio builder; o builder é
// "thenable", então `await admin.from(...).select(...)...` resolve com o
// próximo resultado enfileirado (FIFO). maybeSingle também consome da fila.
// Um item da fila por operação de banco, na ordem em que o service executa.
// ---------------------------------------------------------------------------
function makeAdmin() {
  const queue: Array<{ data?: unknown; error?: unknown }> = [];
  const calls = {
    from: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    neq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const next = () => Promise.resolve(queue.shift() ?? { data: null, error: null });

  const builder: Record<string, unknown> = {};
  for (const k of Object.keys(calls) as (keyof typeof calls)[]) {
    if (k === "maybeSingle") {
      calls[k].mockImplementation(() => next());
    } else {
      calls[k].mockImplementation(() => builder);
    }
    builder[k] = calls[k];
  }
  // torna o builder aguardável (para queries que terminam em order/limit/eq/etc.)
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    next().then(resolve, reject);

  return {
    admin: builder as unknown as SupabaseClient,
    calls,
    enqueue: (r: { data?: unknown; error?: unknown }) => queue.push(r),
  };
}

const USER = "user-1";
const PHONE_RAW = "11961769490"; // sem +55; normalizePhone real prepara "+5511961769490"

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestWhatsAppLinkService", () => {
  it("REUSA (UPDATE) uma linha soft-deleted do mesmo número — nunca faz INSERT (fix da colisão)", async () => {
    const { admin, calls, enqueue } = makeAdmin();
    // lookup → existe linha INATIVA (unlink anterior)
    enqueue({ data: [{ id: "row-9", user_id: USER, verified_at: "2026-01-01T00:00:00Z", is_active: false }], error: null });
    enqueue({ error: null }); // cleanup delete de outras pendências
    enqueue({ error: null }); // UPDATE (take-over)

    const res = await requestWhatsAppLinkService(admin, USER, PHONE_RAW);

    expect(res).toEqual({ ok: true, phone: "+5511961769490" });
    // A guarda central: reusa via update, NÃO insere (era o insert que colidia).
    expect(calls.update).toHaveBeenCalledTimes(1);
    expect(calls.insert).not.toHaveBeenCalled();
    // update reativa a linha existente
    const patch = calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.is_active).toBe(true);
    expect(patch.user_id).toBe(USER);
    expect(patch.verified_at).toBeNull();
    // OTP enviado só depois de persistir
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it("INSERE quando não há nenhuma linha para o número", async () => {
    const { admin, calls, enqueue } = makeAdmin();
    enqueue({ data: [], error: null }); // lookup vazio
    enqueue({ error: null }); // cleanup
    enqueue({ error: null }); // insert

    const res = await requestWhatsAppLinkService(admin, USER, PHONE_RAW);

    expect(res).toEqual({ ok: true, phone: "+5511961769490" });
    expect(calls.insert).toHaveBeenCalledTimes(1);
    expect(calls.update).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it("rejeita (phone_taken) só quando ATIVO+VERIFICADO em outra conta — sem escrever nem enviar OTP", async () => {
    const { admin, calls, enqueue } = makeAdmin();
    enqueue({ data: [{ id: "row-x", user_id: "someone-else", verified_at: "2026-01-01T00:00:00Z", is_active: true }], error: null });

    const res = await requestWhatsAppLinkService(admin, USER, PHONE_RAW);

    expect(res).toMatchObject({ ok: false, code: "phone_taken" });
    expect(calls.update).not.toHaveBeenCalled();
    expect(calls.insert).not.toHaveBeenCalled();
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("NÃO envia OTP e retorna persist_failed quando o UPDATE falha", async () => {
    const { admin, enqueue } = makeAdmin();
    enqueue({ data: [{ id: "row-9", user_id: USER, verified_at: null, is_active: false }], error: null });
    enqueue({ error: null }); // cleanup
    enqueue({ error: { code: "XX000", message: "boom" } }); // UPDATE falha

    const res = await requestWhatsAppLinkService(admin, USER, PHONE_RAW);

    expect(res).toMatchObject({ ok: false, code: "persist_failed" });
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockReport).toHaveBeenCalled();
  });

  it("mapeia 23505 no INSERT para phone_taken (corrida)", async () => {
    const { admin, enqueue } = makeAdmin();
    enqueue({ data: [], error: null }); // lookup vazio
    enqueue({ error: null }); // cleanup
    enqueue({ error: { code: "23505", message: "duplicate key" } }); // insert colide

    const res = await requestWhatsAppLinkService(admin, USER, PHONE_RAW);

    expect(res).toMatchObject({ ok: false, code: "phone_taken" });
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("send_failed quando o envio do OTP lança — a pendência já ficou gravada", async () => {
    const { admin, calls, enqueue } = makeAdmin();
    enqueue({ data: [], error: null });
    enqueue({ error: null });
    enqueue({ error: null }); // insert ok
    mockSendText.mockRejectedValueOnce(new Error("meta down"));

    const res = await requestWhatsAppLinkService(admin, USER, PHONE_RAW);

    expect(res).toMatchObject({ ok: false, code: "send_failed" });
    expect(calls.insert).toHaveBeenCalledTimes(1); // gravou antes de tentar enviar
    expect(mockReport).toHaveBeenCalled();
  });

  it("rejeita formato inválido antes de qualquer query", async () => {
    const { admin, calls } = makeAdmin();
    const res = await requestWhatsAppLinkService(admin, USER, "123");
    expect(res).toMatchObject({ ok: false, code: "invalid_phone" });
    expect(calls.from).not.toHaveBeenCalled();
  });

  it("usa o template de autenticação quando WHATSAPP_OTP_TEMPLATE está setado", async () => {
    const prev = process.env.WHATSAPP_OTP_TEMPLATE;
    process.env.WHATSAPP_OTP_TEMPLATE = "kindar_otp";
    try {
      const { admin, enqueue } = makeAdmin();
      enqueue({ data: [], error: null });
      enqueue({ error: null });
      enqueue({ error: null });

      const res = await requestWhatsAppLinkService(admin, USER, PHONE_RAW);

      expect(res).toEqual({ ok: true, phone: "+5511961769490" });
      expect(mockSendTemplate).toHaveBeenCalledTimes(1);
      expect(mockSendText).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.WHATSAPP_OTP_TEMPLATE;
      else process.env.WHATSAPP_OTP_TEMPLATE = prev;
    }
  });
});

describe("verifyWhatsAppLinkService", () => {
  it("no_pending quando não há linha pendente", async () => {
    const { admin, enqueue } = makeAdmin();
    enqueue({ data: null, error: null }); // maybeSingle → nenhuma
    const res = await verifyWhatsAppLinkService(admin, USER, "123456");
    expect(res).toMatchObject({ ok: false, code: "no_pending" });
  });

  it("wrong_code quando o código não bate", async () => {
    const { admin, enqueue } = makeAdmin();
    enqueue({ data: { id: "row-1", verification_code: "999999", verification_expires_at: "2999-01-01T00:00:00Z" }, error: null });
    const res = await verifyWhatsAppLinkService(admin, USER, "123456");
    expect(res).toMatchObject({ ok: false, code: "wrong_code" });
  });

  it("expired quando o código venceu", async () => {
    const { admin, enqueue } = makeAdmin();
    enqueue({ data: { id: "row-1", verification_code: "123456", verification_expires_at: "2000-01-01T00:00:00Z" }, error: null });
    const res = await verifyWhatsAppLinkService(admin, USER, "123456");
    expect(res).toMatchObject({ ok: false, code: "expired" });
  });

  it("sucesso marca verified_at e limpa o código", async () => {
    const { admin, calls, enqueue } = makeAdmin();
    enqueue({ data: { id: "row-1", verification_code: "123456", verification_expires_at: "2999-01-01T00:00:00Z" }, error: null });
    enqueue({ error: null }); // update verified
    const res = await verifyWhatsAppLinkService(admin, USER, "123456");
    expect(res).toEqual({ ok: true });
    const patch = calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.verification_code).toBeNull();
    expect(typeof patch.verified_at).toBe("string");
  });

  it("invalid_otp_format quando não tem 6 dígitos", async () => {
    const { admin, calls } = makeAdmin();
    const res = await verifyWhatsAppLinkService(admin, USER, "12");
    expect(res).toMatchObject({ ok: false, code: "invalid_otp_format" });
    expect(calls.from).not.toHaveBeenCalled();
  });
});
