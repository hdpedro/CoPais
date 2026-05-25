import { describe, it, expect } from "vitest";
import { mapSupabaseAuthError as mapPwa } from "@/lib/auth-error-codes";
import { mapSupabaseAuthError as mapNative } from "../../kindar-native/app/_src/lib/auth-errors";

/**
 * Paridade obrigatória PWA ↔ Native pra evitar drift entre as duas tabelas
 * de tradução (memory `feedback_session_tree_responsibility` / regra
 * "padrão preferido" em CLAUDE.md). Drift causou bugs como o de 2026-05-01
 * (swap proposed_date) e 2026-05-15 (createChild RLS). Aqui é mais leve mas
 * o pattern é o mesmo: uma cópia única canonicamente sincronizada via teste.
 *
 * Se este teste quebrar: alguém adicionou ou mudou uma entrada em UM dos
 * dois arquivos e esqueceu o outro. Atualize os dois no mesmo PR.
 */

const ALL_CODES = [
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "email_exists", // alias → user_already_exists
  "email_address_invalid",
  "weak_password",
  "same_password",
  "session_not_found",
  "session_expired",
  "user_not_found",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "otp_expired",
  "otp_disabled",
  "signup_disabled",
  "user_banned",
  "captcha_failed",
  "provider_disabled",
  "validation_failed",
];

const ALL_MESSAGES = [
  "Invalid login credentials",
  "Email not confirmed",
  "User already registered",
  "Password should be at least 6 characters",
  "New password should be different from the old password.",
  "Auth session missing!",
  "User not found",
  "Email rate limit exceeded",
  "For security purposes, you can only request this once every 60 seconds",
  "For security purposes, you can only request this after 27 seconds.",
  "Invalid email",
  "Email link is invalid or has expired",
  "Token has expired or is invalid",
  "Signups not allowed for otp",
  "Something completely unrecognized",
];

describe("PWA ↔ Native auth-errors parity", () => {
  describe("by Supabase code", () => {
    it.each(ALL_CODES)("`%s` resolves identically on both sides", (code) => {
      const a = mapPwa({ code, message: "x" });
      const b = mapNative({ code, message: "x" });
      expect(a.code).toBe(b.code);
      expect(a.fallbackMessage).toBe(b.fallbackMessage);
      expect(a.params).toEqual(b.params);
    });
  });

  describe("by message (legacy fallback)", () => {
    it.each(ALL_MESSAGES)("`%s` resolves identically on both sides", (message) => {
      const a = mapPwa({ message });
      const b = mapNative({ message });
      expect(a.code).toBe(b.code);
      expect(a.fallbackMessage).toBe(b.fallbackMessage);
      expect(a.params).toEqual(b.params);
    });
  });

  describe("edge cases", () => {
    it("null is identical", () => {
      expect(mapPwa(null)).toEqual(mapNative(null));
    });
    it("undefined is identical", () => {
      expect(mapPwa(undefined)).toEqual(mapNative(undefined));
    });
    it("empty object is identical", () => {
      expect(mapPwa({})).toEqual(mapNative({}));
    });
  });
});
