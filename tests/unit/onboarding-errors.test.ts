/**
 * Testes do classificador de erros de fetch (PWA).
 *
 * Garante que:
 *  - AbortError vira null (silenciado — não mostrar mensagem)
 *  - TypeError de rede vira mensagem offline
 *  - 401/403/409/5xx mapeiam pras chaves específicas
 *  - 4xx genérico com serverMessage usa a mensagem do servidor
 *  - Fallback usa fallbackKey
 */

import { describe, expect, it } from "vitest";
import {
  errorCodeToI18nKey,
  isAbortError,
  isNetworkError,
  resolveFetchErrorMessage,
} from "@/app/(app)/onboarding/_lib/errors";

const mockT = (key: string) => key;

describe("isAbortError", () => {
  it("true pra AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });
  it("false pra Error comum", () => {
    expect(isAbortError(new Error("oops"))).toBe(false);
  });
  it("false pra não-Error", () => {
    expect(isAbortError("string")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("isNetworkError", () => {
  it("true pra TypeError com 'fetch'", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });
  it("true pra TypeError com 'network'", () => {
    expect(isNetworkError(new TypeError("network error"))).toBe(true);
  });
  it("false pra TypeError sem keywords", () => {
    expect(isNetworkError(new TypeError("invalid arg"))).toBe(false);
  });
  it("false pra Error comum", () => {
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(false);
  });
});

describe("resolveFetchErrorMessage", () => {
  it("AbortError → null (silencia)", () => {
    const cause = new Error("aborted");
    cause.name = "AbortError";
    expect(
      resolveFetchErrorMessage({ cause, fallbackKey: "x" }, mockT),
    ).toBeNull();
  });

  it("Network error → errorNetwork", () => {
    expect(
      resolveFetchErrorMessage(
        { cause: new TypeError("Failed to fetch"), fallbackKey: "x" },
        mockT,
      ),
    ).toBe("onboardingForm.errorNetwork");
  });

  it("401 → sessionExpired", () => {
    expect(
      resolveFetchErrorMessage({ status: 401, fallbackKey: "x" }, mockT),
    ).toBe("common.sessionExpired");
  });

  it("403 → errorPermission", () => {
    expect(
      resolveFetchErrorMessage({ status: 403, fallbackKey: "x" }, mockT),
    ).toBe("onboardingForm.errorPermission");
  });

  it("409 → errorConflict", () => {
    expect(
      resolveFetchErrorMessage({ status: 409, fallbackKey: "x" }, mockT),
    ).toBe("onboardingForm.errorConflict");
  });

  it("500 → errorServer com código", () => {
    // Bug investigation 2026-05-15: agora inclui status code pra debug
    expect(
      resolveFetchErrorMessage({ status: 500, fallbackKey: "x" }, mockT),
    ).toBe("onboardingForm.errorServer (500)");
    expect(
      resolveFetchErrorMessage({ status: 503, fallbackKey: "x" }, mockT),
    ).toBe("onboardingForm.errorServer (503)");
  });

  it("4xx genérico com serverMessage usa a mensagem do servidor", () => {
    expect(
      resolveFetchErrorMessage(
        { status: 422, serverMessage: "Validation failed", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("Validation failed");
  });

  it("4xx sem serverMessage mostra fallback + HTTP status (não silencia info)", () => {
    // Bug 2026-05-15: antes caía no fallback nu; user via "Não foi possível..."
    // sem nenhuma pista. Agora inclui HTTP code pra debug.
    expect(
      resolveFetchErrorMessage({ status: 422, fallbackKey: "y.fallback" }, mockT),
    ).toBe("y.fallback (HTTP 422)");
  });

  it("sem status nem cause, mas com serverMessage → serverMessage", () => {
    expect(
      resolveFetchErrorMessage(
        { serverMessage: "Erro custom", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("Erro custom");
  });

  it("sem nada → fallback", () => {
    expect(resolveFetchErrorMessage({ fallbackKey: "z" }, mockT)).toBe("z");
  });

  // Bug Luísa + Jucilande 2026-05-15 (ecosistema fix): errorCode estável
  // do service tem PRIORIDADE sobre serverMessage → i18n local vence
  // copy PT-BR cravada no servidor.
  it("errorCode fk_blocked → i18n key (mesmo com serverMessage)", () => {
    expect(
      resolveFetchErrorMessage(
        {
          status: 409,
          errorCode: "fk_blocked",
          serverMessage: "PT-BR do servidor (ignorado)",
          fallbackKey: "x",
        },
        mockT,
      ),
    ).toBe("onboardingForm.errorFkBlocked");
  });

  it("errorCode check_violation → i18n key", () => {
    expect(
      resolveFetchErrorMessage(
        { status: 400, errorCode: "check_violation", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("onboardingForm.errorCheckViolation");
  });

  it("errorCode permission_denied → errorPermission (reuse)", () => {
    expect(
      resolveFetchErrorMessage(
        { errorCode: "permission_denied", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("onboardingForm.errorPermission");
  });

  it("errorCode not_found → errorNotFound", () => {
    expect(
      resolveFetchErrorMessage(
        { status: 404, errorCode: "not_found", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("onboardingForm.errorNotFound");
  });

  it("errorCode wrong_group → errorWrongGroup", () => {
    expect(
      resolveFetchErrorMessage(
        { errorCode: "wrong_group", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("onboardingForm.errorWrongGroup");
  });

  it("errorCode future_birthdate → errorFutureBirthdate", () => {
    expect(
      resolveFetchErrorMessage(
        { errorCode: "future_birthdate", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("onboardingForm.errorFutureBirthdate");
  });

  it("errorCode invalid_date → errorInvalidDate", () => {
    expect(
      resolveFetchErrorMessage(
        { errorCode: "invalid_date", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("onboardingForm.errorInvalidDate");
  });

  it("errorCode unique_violation → errorConflict (reuse)", () => {
    expect(
      resolveFetchErrorMessage(
        { errorCode: "unique_violation", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("onboardingForm.errorConflict");
  });

  it("errorCode desconhecido → cai pro serverMessage", () => {
    expect(
      resolveFetchErrorMessage(
        {
          errorCode: "weird_unknown_code",
          serverMessage: "mensagem do servidor",
          fallbackKey: "x",
        },
        mockT,
      ),
    ).toBe("mensagem do servidor");
  });

  it("AbortError + errorCode → null (silencia mesmo com code)", () => {
    const cause = new Error("aborted");
    cause.name = "AbortError";
    expect(
      resolveFetchErrorMessage(
        { cause, errorCode: "fk_blocked", fallbackKey: "x" },
        mockT,
      ),
    ).toBeNull();
  });
});

describe("errorCodeToI18nKey", () => {
  it("mapeia todos os 10 codes do service", () => {
    expect(errorCodeToI18nKey("fk_blocked")).toBe("onboardingForm.errorFkBlocked");
    expect(errorCodeToI18nKey("check_violation")).toBe("onboardingForm.errorCheckViolation");
    expect(errorCodeToI18nKey("permission_denied")).toBe("onboardingForm.errorPermission");
    expect(errorCodeToI18nKey("not_found")).toBe("onboardingForm.errorNotFound");
    expect(errorCodeToI18nKey("wrong_group")).toBe("onboardingForm.errorWrongGroup");
    expect(errorCodeToI18nKey("unique_violation")).toBe("onboardingForm.errorConflict");
    expect(errorCodeToI18nKey("future_birthdate")).toBe("onboardingForm.errorFutureBirthdate");
    expect(errorCodeToI18nKey("invalid_date")).toBe("onboardingForm.errorInvalidDate");
    expect(errorCodeToI18nKey("missing_fields")).toBe("onboardingForm.errorMissingFields");
    expect(errorCodeToI18nKey("no_changes")).toBe("onboardingForm.errorNoChanges");
  });

  it("retorna null pra code desconhecido", () => {
    expect(errorCodeToI18nKey("random_thing")).toBeNull();
    expect(errorCodeToI18nKey("")).toBeNull();
  });
});
