import { describe, it, expect } from "vitest";
import {
  mapSupabaseAuthError,
  mapOAuthCallbackError,
} from "@/lib/auth-error-codes";

describe("mapSupabaseAuthError", () => {
  describe("resolve by error.code (auth-js v2.27+)", () => {
    it.each([
      ["invalid_credentials", "invalid_credentials"],
      ["email_not_confirmed", "email_not_confirmed"],
      ["user_already_exists", "user_already_exists"],
      ["email_exists", "user_already_exists"], // alias
      ["email_address_invalid", "email_address_invalid"],
      ["weak_password", "weak_password"],
      ["same_password", "same_password"],
      ["session_not_found", "session_missing"],
      ["session_expired", "session_missing"], // alias
      ["user_not_found", "user_not_found"],
      ["over_email_send_rate_limit", "over_email_send_rate_limit"],
      ["over_request_rate_limit", "over_email_send_rate_limit"], // alias
      ["otp_expired", "otp_expired"],
      ["otp_disabled", "otp_disabled"],
      ["signup_disabled", "signup_disabled"],
      ["user_banned", "user_banned"],
      ["captcha_failed", "captcha_failed"],
      ["provider_disabled", "provider_disabled"],
      ["validation_failed", "validation_failed"],
    ])("code %s → mapped code %s", (supabaseCode, expectedCode) => {
      const result = mapSupabaseAuthError({
        message: "irrelevant",
        code: supabaseCode,
      });
      expect(result.code).toBe(expectedCode);
      expect(result.fallbackMessage).toBeTruthy();
    });
  });

  describe("resolve by message (legacy / pre-v2.27)", () => {
    it.each([
      ["Invalid login credentials", "invalid_credentials"],
      ["Email not confirmed", "email_not_confirmed"],
      ["User already registered", "user_already_exists"],
      ["Password should be at least 6 characters", "weak_password"],
      [
        "New password should be different from the old password.",
        "same_password",
      ],
      ["Auth session missing!", "session_missing"],
      ["User not found", "user_not_found"],
      ["Email rate limit exceeded", "over_email_send_rate_limit"],
      ["Invalid email", "email_address_invalid"],
      ["Email link is invalid or has expired", "otp_expired"],
      ["Token has expired or is invalid", "otp_expired"],
      ["Signups not allowed for otp", "otp_disabled"],
    ])("message %j → code %s", (msg, expectedCode) => {
      const result = mapSupabaseAuthError({ message: msg });
      expect(result.code).toBe(expectedCode);
      expect(result.fallbackMessage).toBeTruthy();
    });

    it("matches the static 60-seconds rate-limit message", () => {
      const result = mapSupabaseAuthError({
        message:
          "For security purposes, you can only request this once every 60 seconds",
      });
      expect(result.code).toBe("rate_limit_with_seconds");
      expect(result.params).toEqual({ seconds: 60 });
      expect(result.fallbackMessage).toContain("60 segundos");
    });
  });

  describe("dynamic rate-limit (variable seconds)", () => {
    it("captures `after 57 seconds` into params.seconds", () => {
      // Bug Henrique 2026-05-20.
      const result = mapSupabaseAuthError({
        message: "For security purposes, you can only request this after 57 seconds.",
      });
      expect(result.code).toBe("rate_limit_with_seconds");
      expect(result.params).toEqual({ seconds: 57 });
      expect(result.fallbackMessage).toContain("57 segundos");
    });

    it("captures `after 1 second` (singular)", () => {
      const result = mapSupabaseAuthError({
        message: "Try again after 1 second.",
      });
      expect(result.code).toBe("rate_limit_with_seconds");
      expect(result.params).toEqual({ seconds: 1 });
    });

    it("regex runs before exact-message match (variability beats static)", () => {
      // If a future Supabase build inlines a number into the canonical
      // string, dynamic wins so we still get the seconds for i18n.
      const result = mapSupabaseAuthError({
        message: "For security purposes, you can only request this after 60 seconds.",
      });
      expect(result.params).toEqual({ seconds: 60 });
    });
  });

  describe("code takes precedence over message", () => {
    it("uses code when both are present", () => {
      const result = mapSupabaseAuthError({
        code: "email_not_confirmed",
        message: "Invalid login credentials", // misleading
      });
      expect(result.code).toBe("email_not_confirmed");
    });

    it("falls back to message when code is unknown", () => {
      const result = mapSupabaseAuthError({
        code: "some_future_code_we_dont_know_yet",
        message: "Email not confirmed",
      });
      expect(result.code).toBe("email_not_confirmed");
    });
  });

  describe("unknown / edge cases", () => {
    it("returns unknown for null", () => {
      expect(mapSupabaseAuthError(null).code).toBe("unknown");
    });

    it("returns unknown for undefined", () => {
      expect(mapSupabaseAuthError(undefined).code).toBe("unknown");
    });

    it("returns unknown for empty error", () => {
      const result = mapSupabaseAuthError({});
      expect(result.code).toBe("unknown");
      expect(result.fallbackMessage).toBe("Erro inesperado.");
    });

    it("preserves original message in fallback when unknown", () => {
      const result = mapSupabaseAuthError({
        message: "Something totally unrecognized",
      });
      expect(result.code).toBe("unknown");
      expect(result.fallbackMessage).toBe("Something totally unrecognized");
    });

    it("handles null code + null message gracefully", () => {
      const result = mapSupabaseAuthError({ code: null, message: null });
      expect(result.code).toBe("unknown");
    });
  });

  describe("fallbackMessage contract (pt-BR, used when i18n unavailable)", () => {
    // Snapshot the canonical pt-BR copy. Locks the contract: changes
    // require updating both this test and the i18n keys in lockstep.
    it("matches the expected pt-BR copy for the most common codes", () => {
      const codes = [
        "invalid_credentials",
        "email_not_confirmed",
        "user_already_exists",
        "weak_password",
        "same_password",
        "session_not_found",
        "over_email_send_rate_limit",
      ];
      const snapshot = Object.fromEntries(
        codes.map((c) => [
          c,
          mapSupabaseAuthError({ code: c, message: "" }).fallbackMessage,
        ]),
      );
      expect(snapshot).toMatchInlineSnapshot(`
        {
          "email_not_confirmed": "E-mail ainda não confirmado. Verifique sua caixa de entrada.",
          "invalid_credentials": "E-mail ou senha incorretos.",
          "over_email_send_rate_limit": "Muitas tentativas. Aguarde alguns minutos.",
          "same_password": "A nova senha deve ser diferente da senha atual.",
          "session_not_found": "Sessão expirada. Faça login novamente.",
          "user_already_exists": "Este e-mail já está cadastrado.",
          "weak_password": "A senha deve ter pelo menos 8 caracteres.",
        }
      `);
    });
  });
});

describe("mapOAuthCallbackError", () => {
  it("returns oauth_failed for empty input", () => {
    const result = mapOAuthCallbackError(null, null);
    expect(result.code).toBe("oauth_failed");
    expect(result.fallbackMessage).toContain("login social");
  });

  it("delegates to the standard mapper when the description matches", () => {
    const result = mapOAuthCallbackError(
      "server_error",
      "Email not confirmed",
    );
    expect(result.code).toBe("email_not_confirmed");
  });

  it("falls back to oauth_failed with the original message preserved", () => {
    const result = mapOAuthCallbackError(
      "access_denied",
      "User cancelled the dialog",
    );
    expect(result.code).toBe("oauth_failed");
    expect(result.fallbackMessage).toContain("User cancelled the dialog");
  });

  it("uses errorParam when description is missing", () => {
    const result = mapOAuthCallbackError("access_denied", null);
    expect(result.code).toBe("oauth_failed");
    expect(result.fallbackMessage).toContain("access_denied");
  });
});
