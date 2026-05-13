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

  it("500 → errorServer", () => {
    expect(
      resolveFetchErrorMessage({ status: 500, fallbackKey: "x" }, mockT),
    ).toBe("onboardingForm.errorServer");
    expect(
      resolveFetchErrorMessage({ status: 503, fallbackKey: "x" }, mockT),
    ).toBe("onboardingForm.errorServer");
  });

  it("4xx genérico com serverMessage usa a mensagem do servidor", () => {
    expect(
      resolveFetchErrorMessage(
        { status: 422, serverMessage: "Validation failed", fallbackKey: "x" },
        mockT,
      ),
    ).toBe("Validation failed");
  });

  it("4xx sem serverMessage cai no fallback", () => {
    expect(
      resolveFetchErrorMessage({ status: 422, fallbackKey: "y.fallback" }, mockT),
    ).toBe("y.fallback");
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
});
