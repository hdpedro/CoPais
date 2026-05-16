/**
 * Drift guard: o resolver `resolveFetchErrorMessage` (PWA + Native)
 * mapeia `errorCode` do `services/children.ts` pra i18n keys de
 * `onboardingForm.error*`. Se um keys faltar num locale, o user vê o
 * próprio key ("onboardingForm.errorFkBlocked") na tela.
 *
 * Esse teste lê os 10 locale JSONs (5 PWA + 5 Native) e exige que
 * TODAS as 10 keys novas existam em TODOS os arquivos.
 *
 * Bug Luísa/Jucilande 2026-05-15 (ecosistema fix): este guard protege
 * contra a regressão clássica "PT funciona mas EN mostra a key bruta".
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../..");

const PWA_LOCALES = [
  "src/i18n/locales/pt.json",
  "src/i18n/locales/en.json",
  "src/i18n/locales/es.json",
  "src/i18n/locales/fr.json",
  "src/i18n/locales/de.json",
];

const NATIVE_LOCALES = [
  "kindar-native/app/_src/i18n/locales/pt.json",
  "kindar-native/app/_src/i18n/locales/en.json",
  "kindar-native/app/_src/i18n/locales/es.json",
  "kindar-native/app/_src/i18n/locales/fr.json",
  "kindar-native/app/_src/i18n/locales/de.json",
];

// Mantém em sincronia com errorCodeToI18nKey() em ambos errors.ts
const REQUIRED_KEYS = [
  "errorFkBlocked",
  "errorCheckViolation",
  "errorPermission", // reuse — já existia
  "errorNotFound",
  "errorWrongGroup",
  "errorConflict", // reuse — já existia
  "errorFutureBirthdate",
  "errorInvalidDate",
  "errorMissingFields",
  "errorNoChanges",
];

function loadOnboardingForm(relPath: string): Record<string, string> {
  const content = readFileSync(join(ROOT, relPath), "utf-8");
  const parsed = JSON.parse(content) as { onboardingForm?: Record<string, string> };
  if (!parsed.onboardingForm) {
    throw new Error(`${relPath}: missing onboardingForm namespace`);
  }
  return parsed.onboardingForm;
}

describe("children error i18n parity — PWA", () => {
  for (const path of PWA_LOCALES) {
    it(`${path} tem todas as ${REQUIRED_KEYS.length} keys`, () => {
      const ns = loadOnboardingForm(path);
      const missing = REQUIRED_KEYS.filter((k) => !ns[k] || !ns[k].trim());
      expect(missing, `${path} missing keys`).toEqual([]);
    });
  }
});

describe("children error i18n parity — Native", () => {
  for (const path of NATIVE_LOCALES) {
    it(`${path} tem todas as ${REQUIRED_KEYS.length} keys`, () => {
      const ns = loadOnboardingForm(path);
      const missing = REQUIRED_KEYS.filter((k) => !ns[k] || !ns[k].trim());
      expect(missing, `${path} missing keys`).toEqual([]);
    });
  }
});

describe("children error i18n parity — copy não é duplicada por engano", () => {
  it("PT e EN são distintos (não copiou esquecendo de traduzir)", () => {
    const pt = loadOnboardingForm("src/i18n/locales/pt.json");
    const en = loadOnboardingForm("src/i18n/locales/en.json");
    for (const key of REQUIRED_KEYS) {
      expect(pt[key], `PT ${key} igual EN — provável copiar/colar sem traduzir`)
        .not.toBe(en[key]);
    }
  });
});
